import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { and, eq, isNull } from "drizzle-orm";
import { callClaudeWithTools, MODEL, type ClaudeMessage, type ClaudeContentBlock } from "@/lib/llm";
import { triggerSkillRunForEngagement } from "@/lib/skill-trigger";

export const runtime = "nodejs";

// ── Teammates chat (2026-08-25) — v1 ─────────────────────────────────────
// Scope, stated plainly: two real, already-existing manual-trigger actions
// wired up as tools — trigger_call_brief (pre-call-read) and
// trigger_leak_map — the only two skills that support a manual trigger at
// all (see src/lib/skill-trigger.ts, extracted from the same endpoint the
// dashboard's own "run now" buttons already call). No persistence yet —
// the client sends the full message history each turn, same pattern
// documented for Claude-in-artifacts ("no memory between completions").
// Not built yet, on purpose: Slack/email delivery routing, the "create a
// client from a URL" conversational flow, and @-mention autocomplete
// beyond the client-side UI affordance — those are real next builds, not
// silently promised as done here.

interface IncomingMessage {
  role: "user" | "assistant";
  content: string;
}

const TOOLS = [
  {
    name: "trigger_call_brief",
    description:
      "Manually runs the Call Brief skill (pre-call-read) for a client — pulls their upcoming roster and researches/briefs each booked call. Only works if Call Brief is enabled for that client.",
    input_schema: {
      type: "object",
      properties: {
        engagementId: { type: "string", description: "The engagementId of the client to run this for." },
      },
      required: ["engagementId"],
    },
  },
  {
    name: "trigger_leak_map",
    description: "Manually runs a weekly Leak Map funnel audit for a client. Only works if Leak Map is enabled for that client.",
    input_schema: {
      type: "object",
      properties: {
        engagementId: { type: "string", description: "The engagementId of the client to run this for." },
      },
      required: ["engagementId"],
    },
  },
];

function buildSystemPrompt(clients: { engagementId: string; buyer: string }[]): string {
  const clientList = clients.length > 0 ? clients.map((c) => `- ${c.buyer} (engagementId: ${c.engagementId})`).join("\n") : "(no clients yet)";
  return [
    "You are Teammates, an assistant inside a sales-automation dashboard. You can trigger two real actions on the user's behalf: Call Brief and Leak Map, for any of their clients listed below.",
    "",
    "Clients:",
    clientList,
    "",
    "Rules:",
    "- Only call a tool once you're sure which client the user means. If the client name is ambiguous, missing, or doesn't match anyone in the list above, ask a short clarifying question instead of guessing — never call a tool with a guessed engagementId.",
    "- After a tool call, tell the user plainly what happened, including any error a tool returned (e.g. the skill being disabled for that client).",
    "- You can only trigger Call Brief and Leak Map right now. If asked to do something else (Pin Down, Pile-On, Win-Back, or anything not listed), say so plainly rather than pretending to do it — those don't support a manual trigger yet.",
    "- Keep replies short and direct.",
  ].join("\n");
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const incoming = (body?.messages ?? []) as IncomingMessage[];
    if (!Array.isArray(incoming) || incoming.length === 0) {
      return NextResponse.json({ error: "messages must be a non-empty array" }, { status: 400 });
    }

    const activeWorkspace = await getActiveWorkspace(session.whopUserId);
    const clients = await db
      .select({ engagementId: engagements.engagementId, buyer: engagements.buyer })
      .from(engagements)
      .where(and(eq(engagements.whopUserId, session.whopUserId), eq(engagements.workspaceId, activeWorkspace.workspaceId), isNull(engagements.deletedAt)));

    const system = buildSystemPrompt(clients);
    const messages: ClaudeMessage[] = incoming.map((m) => ({ role: m.role, content: m.content }));

    const first = await callClaudeWithTools({ model: MODEL.SYNTHESIS, system, messages, tools: TOOLS, maxTokens: 800 });

    const toolUseBlocks = first.content.filter((b): b is Extract<ClaudeContentBlock, { type: "tool_use" }> => b.type === "tool_use");

    if (toolUseBlocks.length === 0) {
      const text = first.content.find((b): b is Extract<ClaudeContentBlock, { type: "text" }> => b.type === "text")?.text ?? "";
      return NextResponse.json({ reply: text, toolCalls: [] });
    }

    // Execute every requested tool call, in-process — same validated path
    // the dashboard's own "run now" buttons use, not a second copy.
    const toolResults: { name: string; input: Record<string, unknown>; ok: boolean; message: string }[] = [];
    const resultBlocks: ClaudeContentBlock[] = [];

    for (const block of toolUseBlocks) {
      const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
      const skillName = block.name === "trigger_call_brief" ? "pre-call-read" : block.name === "trigger_leak_map" ? "leak-map" : null;

      let ok = false;
      let message = `Unknown tool: ${block.name}`;
      if (skillName && engagementId) {
        const result = await triggerSkillRunForEngagement(session.whopUserId, activeWorkspace.workspaceId, engagementId, skillName);
        ok = result.ok;
        message = result.ok ? result.message : result.error;
      } else if (!engagementId) {
        message = "No engagementId was provided for this tool call.";
      }

      toolResults.push({ name: block.name, input: block.input, ok, message });
      resultBlocks.push({ type: "tool_result", tool_use_id: block.id, content: message, is_error: !ok });
    }

    const followUpMessages: ClaudeMessage[] = [...messages, { role: "assistant", content: first.content }, { role: "user", content: resultBlocks }];

    const followUp = await callClaudeWithTools({ model: MODEL.SYNTHESIS, system, messages: followUpMessages, tools: TOOLS, maxTokens: 500 });
    const followUpText = followUp.content.find((b): b is Extract<ClaudeContentBlock, { type: "text" }> => b.type === "text")?.text ?? "";

    return NextResponse.json({ reply: followUpText, toolCalls: toolResults });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[teammates/chat]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
