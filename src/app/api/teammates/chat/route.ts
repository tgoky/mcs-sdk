import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { and, eq, isNull } from "drizzle-orm";
import { callClaudeWithTools, MODEL, type ClaudeMessage, type ClaudeContentBlock } from "@/lib/llm";
import { triggerSkillRunForEngagement } from "@/lib/skill-trigger";
import { createThread, getOwnedThread, appendMessage, loadThreadForModel } from "@/lib/chat-threads";
import { createMinimalEngagement } from "@/lib/create-minimal-engagement";
import { checkCredentialAvailability, linkReusableCredential, getComposioConnectLink, hasBookingCredential } from "@/lib/chat-credentials";
import { getTodaysCalls, getRecentCancellations, getRunHistory, getActiveRecoveries } from "@/lib/chat-status-queries";
import { enrollProspectInWinBack } from "@/lib/chat-winback";
import { BOOKING_PLATFORM_LABELS, EMAIL_PLATFORM_LABELS } from "@/lib/copy";

export const runtime = "nodejs";

// ── Teammates chat (2026-08-25, persistence 2026-08-30, create_client +
// credential linking 2026-09-01) ─────────────────────────────────────────
// v1 scope: six real actions wired up as tools — trigger_call_brief
// (pre-call-read), trigger_leak_map (the only two skills that support a
// manual trigger at all, see src/lib/skill-trigger.ts), create_client
// (name-only, see create-minimal-engagement.ts), and three that close the
// gap create_client deliberately left open — check_credential,
// connect_credential, use_saved_credential (see chat-credentials.ts).
// Together those three get a client from "just a name" to "actually has a
// real, launchable credential" without a raw secret ever passing through
// a chat message — see chat-credentials.ts's header for exactly why that
// boundary matters and what's still routed to the real page instead
// (pasting a raw key). Still not built, on purpose: the same mechanism
// for email_platform (it's a one-line system-prompt change away, the
// library functions are already provider-agnostic — see the `field`
// param), Slack/email delivery routing, and @-mention autocomplete beyond
// the client-side UI affordance.

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
  {
    name: "create_client",
    description:
      "Creates a new client (engagement) by name. Only sets the name — no booking/email platform, credentials, or offer details are collected here. The reply should tell the user to finish setup on the client's own page (linked automatically) before anything can actually run for them.",
    input_schema: {
      type: "object",
      properties: {
        buyerName: { type: "string", description: "The client's name, exactly as the user said it." },
      },
      required: ["buyerName"],
    },
  },
  {
    name: "check_credential",
    description:
      "Checks whether a client already has a working credential for a booking or email platform, and if not, whether the workspace has a previously-saved one that could be reused. Call this before offering to connect or reuse anything — never assume the state.",
    input_schema: {
      type: "object",
      properties: {
        engagementId: { type: "string", description: "The client to check." },
        field: { type: "string", enum: ["booking", "email"], description: "Which stack slot this is for." },
        provider: {
          type: "string",
          enum: [...Object.keys(BOOKING_PLATFORM_LABELS), ...Object.keys(EMAIL_PLATFORM_LABELS)],
          description: "Which platform — must match field (a booking platform for field=booking, an email platform for field=email).",
        },
      },
      required: ["engagementId", "field", "provider"],
    },
  },
  {
    name: "use_saved_credential",
    description:
      "Links the workspace's existing saved credential for a provider to this client. Only call this after check_credential confirmed a reusable one exists — never guess that one is there.",
    input_schema: {
      type: "object",
      properties: {
        engagementId: { type: "string", description: "The client to link it to." },
        field: { type: "string", enum: ["booking", "email"], description: "Which stack slot this is for." },
        provider: {
          type: "string",
          enum: [...Object.keys(BOOKING_PLATFORM_LABELS), ...Object.keys(EMAIL_PLATFORM_LABELS)],
          description: "Which platform.",
        },
      },
      required: ["engagementId", "field", "provider"],
    },
  },
  {
    name: "connect_credential",
    description:
      "Starts a real OAuth connection for a booking or email platform and returns a link the user has to click themselves (this can never be completed inline in chat — it's a full page redirect to the provider's own login). Only works for Composio-managed providers (Calendly, GoHighLevel Calendar for booking; HubSpot, Klaviyo, Mailchimp, GoHighLevel for email) — everything else (Cal.com, OnceHub, ActiveCampaign, ConvertKit, direct SMTP) isn't OAuth-connectable, tell the user to paste a key on the client's page instead for those.",
    input_schema: {
      type: "object",
      properties: {
        field: { type: "string", enum: ["booking", "email"], description: "Which stack slot this is for." },
        provider: { type: "string", description: "Which platform — must be Composio-managed, check with check_credential's result first if unsure." },
      },
      required: ["field", "provider"],
    },
  },
  {
    name: "get_todays_calls",
    description: "Lists everything on a client's booking roster for today — read-only, no side effects. Use this whenever the user asks what's on today, how many calls, or similar.",
    input_schema: {
      type: "object",
      properties: { engagementId: { type: "string", description: "The client to check." } },
      required: ["engagementId"],
    },
  },
  {
    name: "get_recent_cancellations",
    description: "Lists bookings cancelled in roughly the last week for a client — read-only. Use this when the user asks who cancelled or what's been cancelled recently.",
    input_schema: {
      type: "object",
      properties: { engagementId: { type: "string", description: "The client to check." } },
      required: ["engagementId"],
    },
  },
  {
    name: "get_run_history",
    description: "Lists a client's recent skill runs (Call Brief, Leak Map, etc.) with status and any error — read-only. Use this when the user asks how something went, whether a run finished, or for a status update on returning to the conversation.",
    input_schema: {
      type: "object",
      properties: {
        engagementId: { type: "string", description: "The client to check." },
        skillName: { type: "string", description: "Optional — filter to one skill (e.g. 'pre-call-read', 'leak-map')." },
      },
      required: ["engagementId"],
    },
  },
  {
    name: "get_active_recoveries",
    description: "Lists prospects currently in an active win-back recovery cadence for a client — read-only. Use this when the user asks about win-back status or who's currently being recovered.",
    input_schema: {
      type: "object",
      properties: { engagementId: { type: "string", description: "The client to check." } },
      required: ["engagementId"],
    },
  },
  {
    name: "enroll_in_winback",
    description:
      "Manually enrolls one specific prospect into the client's win-back recovery cadence right now — a real action, it adds them to the actual configured list/workflow on the client's email platform. Requires the client to already have a working email-platform credential and the platform's recovery list/workflow already configured (Klaviyo needs a recovery list id, GoHighLevel needs a location id and workflow id, ActiveCampaign needs a list id and base URL — HubSpot needs nothing extra). If any of that is missing, the tool will say so plainly — don't guess whether it's configured, just try it and relay what comes back. Direct-send (SMTP) accounts aren't supported yet.",
    input_schema: {
      type: "object",
      properties: {
        engagementId: { type: "string", description: "The client this prospect belongs to." },
        prospectEmail: { type: "string", description: "The prospect's email address." },
        prospectName: { type: "string", description: "Optional — the prospect's name, if known." },
      },
      required: ["engagementId", "prospectEmail"],
    },
  },
];

function buildSystemPrompt(clients: { engagementId: string; buyer: string }[]): string {
  const clientList = clients.length > 0 ? clients.map((c) => `- ${c.buyer} (engagementId: ${c.engagementId})`).join("\n") : "(no clients yet)";
  return [
    "You are Teammates, an assistant inside a sales-automation dashboard. You can trigger real actions on the user's behalf: Call Brief, Leak Map, create a new client by name, connect a booking or email platform credential, manually enroll a specific prospect in win-back recovery, and answer status questions — today's calls, recent cancellations, run history, active win-back recoveries — for any client, without triggering anything.",
    "",
    "Clients:",
    clientList,
    "",
    "Rules:",
    "- For Call Brief or Leak Map: only call the tool once you're sure which client the user means. If the client name is ambiguous, missing, or doesn't match anyone in the list above, ask a short clarifying question instead of guessing — never call a tool with a guessed engagementId. If they seem to mean a client who isn't in the list, ask whether they want to create that client first rather than assuming. Call Brief specifically needs a booking platform connected to run at all — if the tool says one isn't connected, offer to help set that up rather than just reporting the error and stopping.",
    "- For create_client: only the name is needed. Don't ask for booking/email platform, credentials, or anything else — that happens on the client's own page afterward, which the reply will link to automatically.",
    "- For booking or email platform setup: always call check_credential first, never assume whether one already exists or is reusable. If it finds a reusable saved credential, ask before calling use_saved_credential — don't link it without confirming. If none exists and the platform is Composio-managed (Calendly/GoHighLevel Calendar for booking; HubSpot/Klaviyo/Mailchimp/GoHighLevel for email), call connect_credential and tell the user to click the link — it's a real redirect, not something you can finish for them. For anything else (Cal.com, OnceHub, ActiveCampaign, ConvertKit, direct SMTP), or if they'd rather type a key directly, tell them to paste it on the client's own page instead — you can't collect a raw credential value in chat, only real links or saved-credential reuse. Always pass the correct field (\"booking\" or \"email\") matching which platform you're setting up.",
    "- Never ask the user to paste an API key or secret directly in this chat, under any circumstances, even if they offer to.",
    "- If a message arrives saying a platform was just connected, that means the user completed a connect_credential link and came back — call check_credential for that client/provider (it should now show a reusable credential) and then use_saved_credential to finish linking it, using whichever client was being set up earlier in the conversation.",
    "- For status questions — what's on today, who cancelled, how did a run go, who's in an active recovery — use get_todays_calls / get_recent_cancellations / get_run_history / get_active_recoveries. These never change anything, so use them freely whenever the user is asking about current state rather than asking you to do something.",
    "- After a tool call, tell the user plainly what happened, including any error a tool returned (e.g. the skill being disabled for that client).",
    "- For enroll_in_winback: needs a working email-platform credential on the client already, plus the platform's recovery list/workflow configured — if the tool reports something's missing, tell the user plainly what and point them to the client's page, don't retry blindly.",
    "- You can only trigger Call Brief, Leak Map, create a client, set up a booking or email credential, enroll someone in win-back, and answer status questions right now. If asked to run Pin-Down's onboarding or any of its individual pieces (brand voice, ad briefs, video scripts, confirmation page), say plainly that it's not wired up yet rather than pretending to do it. That's a real, separate capability, not a smaller version of what you can already do — don't approximate it with the tools you have.",
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
      let ok = false;
      let message2 = `Unknown tool: ${block.name}`;

      if (block.name === "create_client") {
        const buyerName = typeof block.input.buyerName === "string" ? block.input.buyerName.trim() : "";
        if (buyerName) {
          const created = await createMinimalEngagement({ whopUserId: session.whopUserId, workspaceId: activeWorkspace.workspaceId, buyerName });
          ok = true;
          message2 = `Created ${buyerName}. Booking/email platform and credentials still need to be set up on their page before anything can run for them.`;
          links.push({ label: `${buyerName}'s page`, href: `/dashboard/engagements/${created.engagementId}` });
        } else {
          message2 = "No client name was provided.";
        }
      } else if (block.name === "check_credential") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        const provider = typeof block.input.provider === "string" ? block.input.provider : "";
        if (engagementId && provider) {
          const status = await checkCredentialAvailability(activeWorkspace.workspaceId, engagementId, provider);
          ok = true;
          message2 = status.alreadyLinked
            ? `${provider} is already connected for this client.`
            : status.reusable
              ? `Not connected yet for this client, but the workspace has a saved ${provider} credential ("${status.reusable.label}") that could be reused.`
              : `Not connected, and no saved ${provider} credential exists in the workspace yet.`;
        } else {
          message2 = "Missing engagementId or provider.";
        }
      } else if (block.name === "use_saved_credential") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        const provider = typeof block.input.provider === "string" ? block.input.provider : "";
        const field = block.input.field === "email" ? "email" : "booking";
        if (engagementId && provider) {
          const status = await checkCredentialAvailability(activeWorkspace.workspaceId, engagementId, provider);
          if (!status.reusable) {
            message2 = `No saved ${provider} credential was found to reuse.`;
          } else {
            const result = await linkReusableCredential({
              engagementId,
              workspaceId: activeWorkspace.workspaceId,
              provider,
              field,
              vaultId: status.reusable.id,
            });
            ok = result.ok;
            message2 = result.ok ? `Linked the saved ${provider} credential to this client.` : result.error;
            if (result.ok) {
              const buyer = clients.find((c) => c.engagementId === engagementId)?.buyer;
              links.push({ label: buyer ? `${buyer}'s page` : "Client page", href: `/dashboard/engagements/${engagementId}` });
            }
          }
        } else {
          message2 = "Missing engagementId or provider.";
        }
      } else if (block.name === "connect_credential") {
        const provider = typeof block.input.provider === "string" ? block.input.provider : "";
        if (provider) {
          const origin = new URL(request.url).origin;
          const result = await getComposioConnectLink({ provider, workspaceId: activeWorkspace.workspaceId, origin });
          ok = result.ok;
          message2 = result.ok ? `Connect link ready for ${provider}.` : result.error;
          if (result.ok) links.push({ label: `Connect ${provider}`, href: result.redirectUrl });
        } else {
          message2 = "Missing provider.";
        }
      } else if (block.name === "get_todays_calls") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        if (engagementId) {
          const rows = await getTodaysCalls(engagementId);
          ok = true;
          message2 =
            rows.length === 0
              ? "Nothing on the roster for today."
              : rows.map((r) => `${r.prospectName ?? r.prospectEmail ?? "Unknown"} — ${r.callTime.toLocaleTimeString()} (${r.status})`).join("; ");
        } else {
          message2 = "Missing engagementId.";
        }
      } else if (block.name === "get_recent_cancellations") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        if (engagementId) {
          const rows = await getRecentCancellations(engagementId);
          ok = true;
          message2 =
            rows.length === 0
              ? "No cancellations in the last week."
              : rows.map((r) => `${r.prospectName ?? r.prospectEmail ?? "Unknown"} — was booked for ${r.callTime.toLocaleString()}`).join("; ");
        } else {
          message2 = "Missing engagementId.";
        }
      } else if (block.name === "get_run_history") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        const skillNameFilter = typeof block.input.skillName === "string" ? block.input.skillName : undefined;
        if (engagementId) {
          const rows = await getRunHistory(engagementId, skillNameFilter);
          ok = true;
          message2 =
            rows.length === 0
              ? "No runs yet for this client."
              : rows
                  .map((r) => `${r.skillName} — ${r.status}${r.errorMessage ? ` (${r.errorMessage})` : ""}, started ${r.startedAt.toLocaleString()}`)
                  .join("; ");
        } else {
          message2 = "Missing engagementId.";
        }
      } else if (block.name === "get_active_recoveries") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        if (engagementId) {
          const rows = await getActiveRecoveries(engagementId);
          ok = true;
          message2 =
            rows.length === 0
              ? "No one is currently in an active recovery cadence for this client."
              : rows.map((r) => `${r.prospectName ?? r.prospectEmail} — enrolled ${r.enrolledAt.toLocaleDateString()}, ${r.recoveryWindowDays}-day window`).join("; ");
        } else {
          message2 = "Missing engagementId.";
        }
      } else if (block.name === "enroll_in_winback") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        const prospectEmail = typeof block.input.prospectEmail === "string" ? block.input.prospectEmail.trim() : "";
        const prospectName = typeof block.input.prospectName === "string" ? block.input.prospectName : undefined;
        if (engagementId && prospectEmail) {
          const result = await enrollProspectInWinBack({ engagementId, workspaceId: activeWorkspace.workspaceId, prospectEmail, prospectName });
          ok = result.ok;
          message2 = result.ok ? `Enrolled ${prospectEmail} in the win-back recovery cadence.` : result.error;
          if (result.ok) {
            const buyer = clients.find((c) => c.engagementId === engagementId)?.buyer;
            links.push({ label: buyer ? `${buyer}'s page` : "Client page", href: `/dashboard/engagements/${engagementId}` });
          }
        } else {
          message2 = "Missing engagementId or prospectEmail.";
        }
      } else {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        const skillName = block.name === "trigger_call_brief" ? "pre-call-read" : block.name === "trigger_leak_map" ? "leak-map" : null;

        if (skillName && engagementId) {
          // triggerSkillRunForEngagement only checks the skill's on/off
          // toggle, never whether a credential actually exists — by
          // design, it's shared with the dashboard's own "run now"
          // button, which only shows up on an engagement page that
          // already forces setup first. Chat has no such guarantee (a
          // client made via create_client starts with zero credentials,
          // and the enabled-toggle defaults to true when never explicitly
          // set — see isSkillEnabledForEngagement). Without this check,
          // this call would happily return ok:true and a runId, then fail
          // silently in the background (brief-service.ts throws once it
          // hits the missing booking_platform config) with nothing
          // reporting that failure back into this chat thread. Checked
          // here instead of inside triggerSkillRunForEngagement itself so
          // every other caller of that function (the HTTP endpoint, any
          // future one) keeps its current behavior unchanged.
          // Call Brief hard-fails without a booking credential —
          // brief-service.ts throws outright once it hits missing
          // booking_platform config, no graceful degradation. Leak Map is
          // meaningfully different: audit-engine.ts gates the
          // booking-show-rate metric behind stack?.booking_platform being
          // set, but doesn't throw if it's absent — it just skips that
          // one metric and still produces a useful audit from whatever
          // other data sources are configured. Gating both the same way
          // here would be over-blocking Leak Map for something it doesn't
          // actually require to run.
          const needsBookingCredential = skillName === "pre-call-read";
          const hasCredential = needsBookingCredential ? await hasBookingCredential(engagementId, activeWorkspace.workspaceId) : true;
          if (!hasCredential) {
            message2 = "This client doesn't have a booking platform connected yet — nothing would actually run. Want to connect one first?";
          } else {
            const result = await triggerSkillRunForEngagement(session.whopUserId, activeWorkspace.workspaceId, engagementId, skillName);
            ok = result.ok;
            message2 = result.ok ? result.message : result.error;
            if (result.ok) {
              const buyer = clients.find((c) => c.engagementId === engagementId)?.buyer;
              links.push({ label: "View run", href: `/dashboard/runs/${result.runId}` });
              links.push({ label: buyer ? `${buyer}'s page` : "Client page", href: `/dashboard/engagements/${engagementId}` });
            }
          }
        } else if (!engagementId) {
          message2 = "No engagementId was provided for this tool call.";
        }
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
