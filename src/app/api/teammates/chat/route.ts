import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { and, eq, isNull } from "drizzle-orm";
import { callClaudeWithTools, MODEL, type ClaudeMessage, type ClaudeContentBlock } from "@/lib/llm";
import { triggerSkillRunForEngagement } from "@/lib/skill-trigger";
import { createThread, getOwnedThread, appendMessage, loadThreadForModel } from "@/lib/chat-threads";

export const runtime = "nodejs";

// ── Teammates chat (2026-08-25, persistence added 2026-08-30) ───────────
// v1 scope, still true: two real, already-existing manual-trigger actions
// wired up as tools — trigger_call_brief (pre-call-read) and
// trigger_leak_map — the only two skills that support a manual trigger at
// all (see src/lib/skill-trigger.ts). Not built yet, on purpose:
// Slack/email delivery routing, the "create a client from a URL"
// conversational flow, and @-mention autocomplete beyond the client-side
// UI affordance.
//
// What changed today: the client used to resend full message history
// every turn (no server memory between requests). It now sends only the
// new message plus an optional threadId — the server is the source of
// truth for history, via chat-threads.ts. A missing/omitted threadId
// starts a new thread. Successful tool calls now also return `links` —
// real page hrefs (a run's page, the client's engagement page) so the UI
// can render them as clickable, rather than the user having to go find
// what just happened.

interface RequestBody {
  threadId?: string;
  message?: string;
  engagementId?: string | null;
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

    const body = (await request.json()) as RequestBody;
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const activeWorkspace = await getActiveWorkspace(session.whopUserId);
    const clients = await db
      .select({ engagementId: engagements.engagementId, buyer: engagements.buyer })
      .from(engagements)
      .where(and(eq(engagements.whopUserId, session.whopUserId), eq(engagements.workspaceId, activeWorkspace.workspaceId), isNull(engagements.deletedAt)));

    // Resolve (or create) the thread this message belongs to. A threadId
    // the caller doesn't actually own (wrong workspace, stale after a DB
    // reset) is treated the same as no threadId — start fresh, rather
    // than 404ing on something the UI's own localStorage handed back.
    // Title is carried alongside so the response can hand the left rail a
    // real name immediately (new thread's derived title, or the existing
    // one's) instead of it needing a second round trip to find out.
    const existing = body.threadId ? await getOwnedThread(body.threadId, activeWorkspace.workspaceId) : null;
    let threadId: string;
    let threadTitle: string;
    if (existing) {
      threadId = existing.id;
      threadTitle = existing.title;
    } else {
      const created = await createThread({
        whopUserId: session.whopUserId,
        workspaceId: activeWorkspace.workspaceId,
        engagementId: body.engagementId ?? null,
        firstUserText: message,
      });
      threadId = created.id;
      threadTitle = created.title;
    }

    await appendMessage({ threadId, role: "user", kind: "text", rawContent: message, displayText: message });

    const system = buildSystemPrompt(clients);
    const history = await loadThreadForModel(threadId);

    const first = await callClaudeWithTools({ model: MODEL.SYNTHESIS, system, messages: history, tools: TOOLS, maxTokens: 800 });

    const toolUseBlocks = first.content.filter((b): b is Extract<ClaudeContentBlock, { type: "tool_use" }> => b.type === "tool_use");

    if (toolUseBlocks.length === 0) {
      const text = first.content.find((b): b is Extract<ClaudeContentBlock, { type: "text" }> => b.type === "text")?.text ?? "";
      await appendMessage({ threadId, role: "assistant", kind: "text", rawContent: first.content, displayText: text });
      return NextResponse.json({ threadId, title: threadTitle, reply: text, toolCalls: [], links: [] });
    }

    // Execute every requested tool call, in-process — same validated path
    // the dashboard's own "run now" buttons use, not a second copy.
    const toolResults: { name: string; input: Record<string, unknown>; ok: boolean; message: string }[] = [];
    const resultBlocks: ClaudeContentBlock[] = [];
    const links: { label: string; href: string }[] = [];

    for (const block of toolUseBlocks) {
      const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
      const skillName = block.name === "trigger_call_brief" ? "pre-call-read" : block.name === "trigger_leak_map" ? "leak-map" : null;

      let ok = false;
      let message2 = `Unknown tool: ${block.name}`;
      if (skillName && engagementId) {
        const result = await triggerSkillRunForEngagement(session.whopUserId, activeWorkspace.workspaceId, engagementId, skillName);
        ok = result.ok;
        message2 = result.ok ? result.message : result.error;
        if (result.ok) {
          const buyer = clients.find((c) => c.engagementId === engagementId)?.buyer;
          links.push({ label: "View run", href: `/dashboard/runs/${result.runId}` });
          links.push({ label: buyer ? `${buyer}'s page` : "Client page", href: `/dashboard/engagements/${engagementId}` });
        }
      } else if (!engagementId) {
        message2 = "No engagementId was provided for this tool call.";
      }

      toolResults.push({ name: block.name, input: block.input, ok, message: message2 });
      resultBlocks.push({ type: "tool_result", tool_use_id: block.id, content: message2, is_error: !ok });
    }

    await appendMessage({ threadId, role: "assistant", kind: "internal", rawContent: first.content });
    await appendMessage({ threadId, role: "user", kind: "internal", rawContent: resultBlocks });

    const followUpMessages: ClaudeMessage[] = [...history, { role: "assistant", content: first.content }, { role: "user", content: resultBlocks }];
    const followUp = await callClaudeWithTools({ model: MODEL.SYNTHESIS, system, messages: followUpMessages, tools: TOOLS, maxTokens: 500 });
    const followUpText = followUp.content.find((b): b is Extract<ClaudeContentBlock, { type: "text" }> => b.type === "text")?.text ?? "";

    await appendMessage({
      threadId,
      role: "assistant",
      kind: "text",
      rawContent: followUp.content,
      displayText: followUpText,
      toolCalls: toolResults,
      links,
    });

    return NextResponse.json({ threadId, title: threadTitle, reply: followUpText, toolCalls: toolResults, links });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[teammates/chat]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
