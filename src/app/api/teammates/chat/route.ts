import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace, isPackageInstalledInWorkspace } from "@/lib/workspace";
import { and, eq, isNull } from "drizzle-orm";
import { callClaudeWithTools, MODEL, type ClaudeMessage, type ClaudeContentBlock } from "@/lib/llm";
import { triggerSkillRunForEngagement } from "@/lib/skill-trigger";
import { createThread, getOwnedThread, appendMessage, loadThreadForModel } from "@/lib/chat-threads";
import { createMinimalEngagement } from "@/lib/create-minimal-engagement";
import { createMinimalRepEngagement } from "@/lib/create-minimal-rep-engagement";
import { getRepEnrolledEngagementIds } from "@/lib/rep-engagements";
import { checkCredentialAvailability, linkReusableCredential, getComposioConnectLink, hasBookingCredential } from "@/lib/chat-credentials";
import { getTodaysCalls, getRecentCancellations, getRunHistory, getActiveRecoveries, getLeakMapBenchmarkComparison } from "@/lib/chat-status-queries";
import { enrollProspectInWinBack } from "@/lib/chat-winback";
import { previewManualPileOnEnrollment, enrollProspectInPileOn } from "@/lib/chat-pile-on";
import { triggerVoiceExtractionForEngagement, triggerScriptPackForEngagement, triggerAdCreativeBriefsForEngagement, triggerPageAuditForEngagement, triggerEngineAdhocCheckForEngagement, triggerCrisisStressTestForEngagement, triggerDraftResponseForEngagement, triggerTwitterDeepScanForEngagement, triggerTrustpilotDeepScanForEngagement, triggerRedditDeepScanForEngagement } from "@/lib/chat-skill-trigger";
import { BOOKING_PLATFORM_LABELS, EMAIL_PLATFORM_LABELS } from "@/lib/copy";

export const runtime = "nodejs";

// ── Teammates chat (2026-08-25, persistence 2026-08-30, create_client +
// credential linking 2026-09-01, Reputation Manager parity 2026-09-06)
// ─────────────────────────────────────────────────────────────────────
// v1 scope: six real actions wired up as tools — trigger_call_brief
// (pre-call-read), trigger_leak_map (the only two skills that support a
// manual trigger at all, see src/lib/skill-trigger.ts), create_client
// (name-only, see create-minimal-engagement.ts), and three that close the
// gap create_client deliberately left open — check_credential,
// connect_credential, use_saved_credential (see chat-credentials.ts).
// create_rep_client is Reputation Manager's counterpart to create_client —
// same name-only shape, see create-minimal-rep-engagement.ts — but RM has
// no counterpart to trigger_call_brief/trigger_leak_map yet: its watch
// skills (engine panel, Trustpilot/Reddit/Twitter watch, crisis response)
// have no manual "run now" anywhere in the app, dashboard included, only
// their own cron schedule — building that is a real, separate feature
// (a manual-trigger endpoint/Inngest event for those skills doesn't exist
// to call), not something to fake here. The system prompt says as much
// rather than pretending it's wired up.
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
      "Creates a new Showtime client (engagement) by name. Only sets the name — no booking/email platform, credentials, or offer details are collected here. The reply should tell the user to finish setup on the client's own page (linked automatically) before anything can actually run for them.",
    input_schema: {
      type: "object",
      properties: {
        buyerName: { type: "string", description: "The client's name, exactly as the user said it." },
      },
      required: ["buyerName"],
    },
  },
  {
    name: "create_rep_client",
    description:
      "Creates a new Reputation Manager client by operator name — the person or brand whose online reputation will be monitored. Only sets the name, same minimal shape as create_client. No aliases, handles, domains, competitors, or engine selection are collected here — the reply should tell the user to finish Identity Setup on the client's own page (linked automatically), the same as anything created from Reputation Manager's own 'New client' page would need to.",
    input_schema: {
      type: "object",
      properties: {
        operatorName: { type: "string", description: "The operator's name, exactly as the user said it." },
      },
      required: ["operatorName"],
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
    name: "compare_leak_map_benchmarks",
    description:
      "Compares a client's most recent Leak Map audit metrics against anonymized cross-client benchmarks for their same bucket (traffic temperature + price range + vertical) — read-only, no new audit run, no LLM call. Reuses the client's existing audit metrics, not a fresh scan. Only works if the client has run Leak Map at least once and has enough same-bucket peers on file (k-anonymity floor); the tool will say plainly if either is missing rather than fabricating a comparison.",
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
  {
    name: "preview_pile_on_enrollment",
    description:
      "Read-only — shows exactly what enroll_in_pile_on would do for a specific prospect, without doing any of it: no email sent, no writes. Always call this before enroll_in_pile_on and show the user what it says; never call enroll_in_pile_on without a preview shown to the user first in this conversation.",
    input_schema: {
      type: "object",
      properties: {
        engagementId: { type: "string", description: "The client this prospect belongs to." },
        prospectEmail: { type: "string", description: "The prospect's email address." },
      },
      required: ["engagementId", "prospectEmail"],
    },
  },
  {
    name: "enroll_in_pile_on",
    description:
      "Manually enrolls one specific prospect into the client's Pile-On pre-call follow-up sequence right now — a real action on their actual email platform (klaviyo, hubspot, activecampaign, ghl, mailchimp, or convertkit). Deliberately narrower than a real booking webhook: never enrolls SMS (timed against a real call time this path doesn't have) and never syncs an ad-data cohort (touches real ad spend, gated separately) — email enrollment only, plus exiting an active win-back cadence for the same prospect if one exists. If the prospect already has a booking on file, this refuses unless force is set — only set force after the user has explicitly confirmed they want to proceed anyway, never on your own judgment.",
    input_schema: {
      type: "object",
      properties: {
        engagementId: { type: "string", description: "The client this prospect belongs to." },
        prospectEmail: { type: "string", description: "The prospect's email address." },
        prospectName: { type: "string", description: "Optional — the prospect's name, if known." },
        force: { type: "boolean", description: "Only true if the user explicitly confirmed enrolling despite an existing booking already on file for this email." },
      },
      required: ["engagementId", "prospectEmail"],
    },
  },
  {
    name: "extract_brand_voice",
    description:
      "Runs a real brand voice extraction from a client's website in the background — crawls the site, distills a voice profile via AI analysis, and saves it to the client (the same result Show Rate Setup's onboarding produces, standalone). This takes a while (real web crawling), so it dispatches and returns immediately with a runId — it does not complete within this reply. Tell the user it's running and to check back or ask for a status update; use get_run_history to check progress later.",
    input_schema: {
      type: "object",
      properties: {
        engagementId: { type: "string", description: "The client to extract this for." },
        domain: { type: "string", description: "The client's website URL or domain." },
      },
      required: ["engagementId", "domain"],
    },
  },
  {
    name: "generate_video_scripts",
    description:
      "Generates a hero confirmation-page video script plus breakout scripts for each top call question, in the background — the same script pack Show Rate Setup generates, standalone. Uses whatever brand voice, offer details, and call questions are already on the client — none of that needs asking for first, it'll just produce a more generic result if some of it isn't set. This takes a while, dispatches and returns immediately with a runId. Tell the user it's running.",
    input_schema: {
      type: "object",
      properties: {
        engagementId: { type: "string", description: "The client to generate scripts for." },
        approach: {
          type: "string",
          enum: ["research_assistance", "urgency", "faq"],
          description:
            "Optional — forces the hero video's framing instead of letting it auto-pick from the offer's price/traffic temperature. research_assistance = lower-anxiety working-session framing for cold, complex/high-price offers. urgency = confident, decisive framing for warm/hot high-price offers. faq = standard friendly warm-lead framing. Only set this when the user explicitly asks for a different angle/approach on an already-generated script pack — there is no free-text tone override, only these 3 real options.",
        },
      },
      required: ["engagementId"],
    },
  },
  {
    name: "generate_ad_briefs",
    description:
      "Generates ad creative briefs across all 4 content pillars, in the background — the same output Show Rate Setup generates, standalone. Same graceful degradation as generate_video_scripts — uses whatever's already on the client. Dispatches and returns immediately with a runId. Tell the user it's running.",
    input_schema: {
      type: "object",
      properties: { engagementId: { type: "string", description: "The client to generate briefs for." } },
      required: ["engagementId"],
    },
  },
  {
    name: "audit_confirmation_page",
    description:
      "Audits an existing confirmation page URL against what a well-built one should include (hero video, what-to-expect section, breakout content, social proof, reschedule path) and notes concrete gaps, in the background — the same audit Show Rate Setup runs. Does NOT build or deploy a new page — say so plainly if asked for that, it's a bigger, separate action not wired up here. Optionally also fetches a second URL (typically a competitor's confirmation page) and compares directly against it. Dispatches and returns immediately with a runId.",
    input_schema: {
      type: "object",
      properties: {
        engagementId: { type: "string", description: "The client whose page this is." },
        pageUrl: { type: "string", description: "The URL of the existing confirmation page to audit." },
        competitorPageUrl: { type: "string", description: "Optional — a competitor's confirmation page URL to fetch and compare against directly. Only include this if the user actually gave a specific competitor URL to compare against." },
      },
      required: ["engagementId", "pageUrl"],
    },
  },
  {
    name: "check_ai_engines",
    description:
      "Asks the client's configured AI engines (ChatGPT, Claude, Perplexity, Grok, Gemini) a live question right now — about the client themselves, or about a named competitor already tracked in their identity graph. This is a one-off spot-check, separate from the scheduled AI Engine Watch panel — nothing gets written to the client's monitoring history, it's a live snapshot only. Dispatches and returns immediately with a runId; tell the user it's running.",
    input_schema: {
      type: "object",
      properties: {
        engagementId: { type: "string", description: "The client to check this for." },
        subject: {
          type: "string",
          description: "Who to ask about — omit for the client themselves, or give the exact name of a competitor already tracked in their identity graph. Never guess a competitor name that hasn't been confirmed as tracked.",
        },
        question: {
          type: "string",
          description: "Optional — the exact question to ask. Omit to use a sensible default ('what do people generally say about X, anything concerning').",
        },
      },
      required: ["engagementId"],
    },
  },
  {
    name: "check_crisis_threshold",
    description:
      "Scores a hypothetical finding (something that hasn't actually happened) through the exact same severity model the real Crisis Response skill uses, and reports whether it would cross this client's threshold — for tuning the threshold ahead of time, not reacting to something real. Never declares a real incident or notifies anyone. Dispatches and returns immediately with a runId; tell the user it's running.",
    input_schema: {
      type: "object",
      properties: {
        engagementId: { type: "string", description: "The client whose threshold to test against." },
        hypotheticalFindingText: { type: "string", description: "The made-up finding to score — e.g. a hypothetical bad review or mention. Make clear to the user this must be hypothetical, not something real that already happened (a real one should go through the normal watch skills instead)." },
        hypotheticalFindingSource: { type: "string", enum: ["engine_panel", "trustpilot", "reddit", "twitter"], description: "Which kind of source to frame this as for scoring. Defaults to trustpilot if omitted." },
      },
      required: ["engagementId", "hypotheticalFindingText"],
    },
  },
  {
    name: "draft_response",
    description:
      "Drafts a suggested public response to a real flagged finding (a Trustpilot review, Reddit/X mention, or AI-engine answer), in the operator's brand voice when one's on file. Does not post anywhere — purely a draft for a human to review and post themselves. Dispatches and returns immediately with a runId; tell the user it's running.",
    input_schema: {
      type: "object",
      properties: {
        engagementId: { type: "string", description: "The client this finding is about." },
        findingText: { type: "string", description: "The actual finding text to respond to, as given by the user." },
        findingPlatform: { type: "string", enum: ["trustpilot", "reddit", "twitter", "engine_panel"], description: "Which platform this finding came from, if known." },
      },
      required: ["engagementId", "findingText"],
    },
  },
  {
    name: "twitter_deep_scan",
    description:
      "Scans X/Twitter for mentions of a client back to a specific date, further than the regular daily watch's recent-only window — using X's own since: search operator. Real mentions found this way get added to the client's real monitoring history, same as the regular watch. Only works for X — there's no equivalent verified deep-scan for Trustpilot or Reddit. Dispatches and returns immediately with a runId; tell the user it's running.",
    input_schema: {
      type: "object",
      properties: {
        engagementId: { type: "string", description: "The client to scan for." },
        deepScanSinceDate: { type: "string", description: "How far back to scan, in YYYY-MM-DD format." },
      },
      required: ["engagementId", "deepScanSinceDate"],
    },
  },
  {
    name: "trustpilot_deep_scan",
    description:
      "Scans Trustpilot for a client's reviews back to a specific date, using Outscraper's own documented cutoff parameter — an exact, real date-bound fetch. Real reviews found this way get added to the client's real monitoring history, same as the regular watch. Dispatches and returns immediately with a runId; tell the user it's running.",
    input_schema: {
      type: "object",
      properties: {
        engagementId: { type: "string", description: "The client to scan for." },
        deepScanSinceDate: { type: "string", description: "How far back to scan, in YYYY-MM-DD format." },
      },
      required: ["engagementId", "deepScanSinceDate"],
    },
  },
  {
    name: "reddit_deep_scan",
    description:
      "Widens the Reddit search for a client beyond the regular daily watch's recency window, using verified sort=top + t=timeframe combinations Reddit's own search docs recommend for reaching older posts. Coarser than an exact date — a timeframe bucket, not a specific day, since Reddit search has no exact cutoff parameter the way Trustpilot/X do. Real mentions found this way get added to the client's real monitoring history. Dispatches and returns immediately with a runId; tell the user it's running.",
    input_schema: {
      type: "object",
      properties: {
        engagementId: { type: "string", description: "The client to scan for." },
        deepScanTimeframe: { type: "string", enum: ["hour", "day", "week", "month", "year", "all"], description: "Which timeframe bucket to widen into." },
      },
      required: ["engagementId", "deepScanTimeframe"],
    },
  },
];
function buildSystemPrompt(clients: { engagementId: string; buyer: string; repEnrolled: boolean }[], repInstalled: boolean): string {
  const clientList =
    clients.length > 0
      ? clients.map((c) => `- ${c.buyer} (engagementId: ${c.engagementId}${c.repEnrolled ? ", Reputation Manager" : ""})`).join("\n")
      : "(no clients yet)";
  return [
    "You are Teammates, an assistant inside a sales-automation dashboard covering two products: Showtime (booking/sales automation) and Reputation Manager (online reputation monitoring). You can trigger real actions on the user's behalf: Call Brief, Leak Map, create a new Showtime client by name, create a new Reputation Manager client by operator name, connect a booking or email platform credential, manually enroll a specific prospect in win-back recovery, preview or manually enroll a specific prospect in Pile-On's pre-call sequence, run any of Show Rate Setup's individual pieces (brand voice extraction, video scripts, ad creative briefs, confirmation page audit) standalone for an already-created client, ask a client's configured AI engines a live one-off question about the client or a tracked competitor, test a hypothetical finding against a client's crisis threshold, draft a suggested response to a real flagged finding, deep-scan X/Twitter back to a specific date, deep-scan Trustpilot back to a specific date, widen a Reddit scan to an older timeframe bucket, and answer status questions — today's calls, recent cancellations, run history, active win-back recoveries, how a client's Leak Map metrics compare to similar clients — for any client, without triggering anything.",
    "",
    "Clients (a client tagged \"Reputation Manager\" is enrolled in that product; everyone else is Showtime-only unless just created and not yet set up):",
    clientList,
    "",
    "Rules:",
    "- For Call Brief or Leak Map: only call the tool once you're sure which client the user means. If the client name is ambiguous, missing, or doesn't match anyone in the list above, ask a short clarifying question instead of guessing — never call a tool with a guessed engagementId. If they seem to mean a client who isn't in the list, ask whether they want to create that client first rather than assuming. Call Brief specifically needs a booking platform connected to run at all — if the tool says one isn't connected, offer to help set that up rather than just reporting the error and stopping. Neither tool applies to a Reputation Manager-only client — say so instead of trying.",
    "- For create_client: only the name is needed. Don't ask for booking/email platform, credentials, or anything else — that happens on the client's own page afterward, which the reply will link to automatically. Use this for a Showtime client.",
    `- For create_rep_client: only the operator name is needed (the person/brand whose reputation is being monitored) — same minimal shape as create_client, just for Reputation Manager. ${repInstalled ? "Full identity-graph setup (aliases, handles, domains, competitors, which engines to run) still happens on the client's own Identity Setup page afterward, which the reply will link to automatically." : "Reputation Manager isn't installed in this workspace — if asked to create one, say so plainly rather than calling the tool."}`,
    "- Reputation Manager's own watch skills (AI Engine Watch, Trustpilot/Reddit/Twitter Watch, Crisis Response) run automatically on their own schedule once a client's Identity Setup is complete — there's no manual \"run now\" for them yet, in the dashboard or here. If asked to trigger one on demand, say so plainly rather than pretending to.",
    "- For booking or email platform setup: always call check_credential first, never assume whether one already exists or is reusable. If it finds a reusable saved credential, ask before calling use_saved_credential — don't link it without confirming. If none exists and the platform is Composio-managed (Calendly/GoHighLevel Calendar for booking; HubSpot/Klaviyo/Mailchimp/GoHighLevel for email), call connect_credential and tell the user to click the link — it's a real redirect, not something you can finish for them. For anything else (Cal.com, OnceHub, ActiveCampaign, ConvertKit, direct SMTP), or if they'd rather type a key directly, tell them to paste it on the client's own page instead — you can't collect a raw credential value in chat, only real links or saved-credential reuse. Always pass the correct field (\"booking\" or \"email\") matching which platform you're setting up.",
    "- Never ask the user to paste an API key or secret directly in this chat, under any circumstances, even if they offer to.",
    "- If a message arrives saying a platform was just connected, that means the user completed a connect_credential link and came back — call check_credential for that client/provider (it should now show a reusable credential) and then use_saved_credential to finish linking it, using whichever client was being set up earlier in the conversation.",
    "- For status questions — what's on today, who cancelled, how did a run go, who's in an active recovery, how a client's Leak Map metrics compare to similar clients — use get_todays_calls / get_recent_cancellations / get_run_history / get_active_recoveries / compare_leak_map_benchmarks. These never change anything, so use them freely whenever the user is asking about current state rather than asking you to do something.",
    "- After a tool call, tell the user plainly what happened, including any error a tool returned (e.g. the skill being disabled for that client).",
    "- For enroll_in_winback: needs a working email-platform credential on the client already, plus the platform's recovery list/workflow configured — if the tool reports something's missing, tell the user plainly what and point them to the client's page, don't retry blindly.",
    "- For enroll_in_pile_on: ALWAYS call preview_pile_on_enrollment first and show the user its output before ever calling enroll_in_pile_on — never call enroll_in_pile_on in the same turn as the user's first request without a preview shown first. It only enrolls email, never SMS or an ad-data cohort sync (say so plainly if asked — deliberately not replicated for manual enrollment, see the tool's own description for why). If the preview or the real call reports an existing booking on file for that email, tell the user plainly and only pass force:true after they explicitly confirm they want to proceed anyway — never set force on your own judgment.",
    "- For check_crisis_threshold: the finding must be explicitly hypothetical — if the user describes something that actually happened, don't use this tool, tell them the real watch skills (or draft_response) are what handle real findings. Never presents as declaring a real incident; always make clear in your reply that nothing was actually triggered, this only tested the threshold.",
    "- For twitter_deep_scan and trustpilot_deep_scan: deepScanSinceDate must be a real past date the user gives you, not something you pick. Both add real results to the client's actual monitoring history, the same as the regular scheduled watch — never present either as a preview or a dry run.",
    "- For reddit_deep_scan: Reddit's own search has no exact date cutoff the way Trustpilot/X do, only a timeframe bucket (hour/day/week/month/year/all) — never ask the user for a specific date for this one, ask which bucket to widen into instead, and if they give you a date, translate it to the closest bucket yourself rather than pushing back. Adds real results to the client's actual monitoring history, same as the regular scheduled watch.",
    "- For draft_response: this is for a REAL finding the user gives you (a real review, a real mention) — the draft never gets posted anywhere automatically, always tell the user to review and post it themselves. Don't fabricate specific facts, offers, or promises in how you relay the draft.",
    "- For check_ai_engines: omit subject to ask about the client themselves; to ask about a competitor, use the exact name from their tracked competitors list (shown on their Identity Setup) — never guess or paraphrase a competitor name that hasn't been confirmed as tracked, ask the user to confirm the exact name instead. This is a live spot-check, separate from the scheduled AI Engine Watch panel — nothing gets saved to the client's monitoring history, so don't present it as if it updates their ongoing findings.",
    "- extract_brand_voice, generate_video_scripts, generate_ad_briefs, and audit_confirmation_page all run in the background and take a while — always tell the user it's running and won't finish instantly, and offer to check status with get_run_history if they ask later. None of these run the full Show Rate Setup wizard end to end (no booking webhook wiring, no new page deployment) — each does exactly the one piece it's named for, using whatever the client already has on file (brand voice, offer details, call questions) and degrading to a more generic result if some of that isn't set yet, never failing outright for missing optional context. If asked to build or deploy a new confirmation page (not audit an existing one), say plainly that's not wired up — audit_confirmation_page only reviews a page that already exists.",
    "- generate_video_scripts' approach param: only set it when the user explicitly asks to regenerate with a different angle/framing — never set it on a first-time script generation, and never invent a description beyond the 3 real options (research_assistance/urgency/faq) listed in the tool's own schema. audit_confirmation_page's competitorPageUrl: only set it when the user gives an actual competitor URL to compare against — never guess or reuse a URL from earlier in the conversation for a different purpose.",
    "- You can only trigger Call Brief, Leak Map, create a Showtime or Reputation Manager client, set up a booking or email credential, enroll someone in win-back, preview or enroll someone in Pile-On (preview_pile_on_enrollment, enroll_in_pile_on — email only, see that rule above), run Show Rate Setup's four individual pieces above, run a live AI-engine spot-check (check_ai_engines), test a hypothetical against the crisis threshold (check_crisis_threshold), draft a response to a real finding (draft_response), deep-scan X/Twitter back to a date (twitter_deep_scan), deep-scan Trustpilot back to a date (trustpilot_deep_scan), widen a Reddit scan to an older timeframe (reddit_deep_scan), and answer status questions right now. If asked for Showtime's full onboarding wizard end to end, Pile-On's SMS or ad-data cohort sync specifically (not replicated for manual enrollment, only the real booking webhook does those), or to manually trigger the SCHEDULED AI Engine Watch panel or the Trustpilot/Reddit/Twitter/Crisis Response watch skills themselves on their regular cadence, say plainly that it's not wired up rather than pretending to do it — check_ai_engines, check_crisis_threshold, draft_response, twitter_deep_scan, trustpilot_deep_scan, reddit_deep_scan, and enroll_in_pile_on are separate, narrower, manually-triggered actions, not a way to fire the scheduled skills themselves.",
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
    const [clients, repEnrolledIds, repInstalled] = await Promise.all([
      db
        .select({ engagementId: engagements.engagementId, buyer: engagements.buyer })
        .from(engagements)
        .where(and(eq(engagements.whopUserId, session.whopUserId), eq(engagements.workspaceId, activeWorkspace.workspaceId), isNull(engagements.deletedAt))),
      getRepEnrolledEngagementIds(session.whopUserId, activeWorkspace.workspaceId),
      isPackageInstalledInWorkspace(activeWorkspace.workspaceId, "reputation-manager"),
    ]);
    const repEnrolledSet = new Set(repEnrolledIds);

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

    const clientsForPrompt = clients.map((c) => ({ ...c, repEnrolled: repEnrolledSet.has(c.engagementId) }));
    const system = buildSystemPrompt(clientsForPrompt, repInstalled);
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
      } else if (block.name === "create_rep_client") {
        const operatorName = typeof block.input.operatorName === "string" ? block.input.operatorName.trim() : "";
        if (!operatorName) {
          message2 = "No operator name was provided.";
        } else if (!repInstalled) {
          message2 = "Reputation Manager isn't installed in this workspace.";
        } else {
          const result = await createMinimalRepEngagement({ whopUserId: session.whopUserId, workspaceId: activeWorkspace.workspaceId, operatorName });
          ok = result.ok;
          message2 = result.ok
            ? `Created ${operatorName}. Identity Setup (aliases, handles, domains, competitors, which engines to run) still needs to be finished on their page before monitoring actually starts.`
            : result.error;
          if (result.ok) {
            links.push({ label: `${operatorName}'s Identity Setup`, href: `/dashboard/engagements/${result.engagementId}/bridges/rep-onboarding` });
          }
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
      } else if (block.name === "compare_leak_map_benchmarks") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        if (engagementId) {
          const result = await getLeakMapBenchmarkComparison(engagementId);
          ok = !("error" in result);
          message2 = "error" in result ? result.error : result.lines.join(" ");
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
      } else if (block.name === "preview_pile_on_enrollment") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        const prospectEmail = typeof block.input.prospectEmail === "string" ? block.input.prospectEmail.trim() : "";
        if (engagementId && prospectEmail) {
          const result = await previewManualPileOnEnrollment({ engagementId, workspaceId: activeWorkspace.workspaceId, prospectEmail });
          ok = result.ok;
          message2 = result.ok ? [...result.actions, ...result.warnings].join(" ") : result.error;
        } else {
          message2 = "Missing engagementId or prospectEmail.";
        }
      } else if (block.name === "enroll_in_pile_on") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        const prospectEmail = typeof block.input.prospectEmail === "string" ? block.input.prospectEmail.trim() : "";
        const prospectName = typeof block.input.prospectName === "string" ? block.input.prospectName : undefined;
        const force = block.input.force === true;
        if (engagementId && prospectEmail) {
          const result = await enrollProspectInPileOn({ engagementId, workspaceId: activeWorkspace.workspaceId, prospectEmail, prospectName, force });
          ok = result.ok;
          message2 = result.ok
            ? `Enrolled ${prospectEmail} in the Pile-On pre-call sequence.${result.rebookedFromWinBack ? " Also exited them from their active win-back cadence." : ""}`
            : result.error;
          if (result.ok) {
            const buyer = clients.find((c) => c.engagementId === engagementId)?.buyer;
            links.push({ label: buyer ? `${buyer}'s page` : "Client page", href: `/dashboard/engagements/${engagementId}` });
          }
        } else {
          message2 = "Missing engagementId or prospectEmail.";
        }
      } else if (block.name === "extract_brand_voice") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        const domain = typeof block.input.domain === "string" ? block.input.domain : "";
        if (engagementId && domain) {
          const result = await triggerVoiceExtractionForEngagement(session.whopUserId, activeWorkspace.workspaceId, engagementId, domain);
          ok = result.ok;
          message2 = result.ok ? result.message : result.error;
          if (result.ok) {
            const buyer = clients.find((c) => c.engagementId === engagementId)?.buyer;
            links.push({ label: "View run", href: `/dashboard/runs/${result.runId}` });
            links.push({ label: buyer ? `${buyer}'s page` : "Client page", href: `/dashboard/engagements/${engagementId}` });
          }
        } else {
          message2 = "Missing engagementId or domain.";
        }
      } else if (block.name === "generate_video_scripts") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        const approach =
          block.input.approach === "research_assistance" || block.input.approach === "urgency" || block.input.approach === "faq"
            ? block.input.approach
            : undefined;
        if (engagementId) {
          const result = await triggerScriptPackForEngagement(session.whopUserId, activeWorkspace.workspaceId, engagementId, approach);
          ok = result.ok;
          message2 = result.ok ? result.message : result.error;
          if (result.ok) {
            const buyer = clients.find((c) => c.engagementId === engagementId)?.buyer;
            links.push({ label: "View run", href: `/dashboard/runs/${result.runId}` });
            links.push({ label: buyer ? `${buyer}'s page` : "Client page", href: `/dashboard/engagements/${engagementId}` });
          }
        } else {
          message2 = "Missing engagementId.";
        }
      } else if (block.name === "generate_ad_briefs") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        if (engagementId) {
          const result = await triggerAdCreativeBriefsForEngagement(session.whopUserId, activeWorkspace.workspaceId, engagementId);
          ok = result.ok;
          message2 = result.ok ? result.message : result.error;
          if (result.ok) {
            const buyer = clients.find((c) => c.engagementId === engagementId)?.buyer;
            links.push({ label: "View run", href: `/dashboard/runs/${result.runId}` });
            links.push({ label: buyer ? `${buyer}'s page` : "Client page", href: `/dashboard/engagements/${engagementId}` });
          }
        } else {
          message2 = "Missing engagementId.";
        }
      } else if (block.name === "audit_confirmation_page") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        const pageUrl = typeof block.input.pageUrl === "string" ? block.input.pageUrl : "";
        const competitorPageUrl = typeof block.input.competitorPageUrl === "string" ? block.input.competitorPageUrl : undefined;
        if (engagementId && pageUrl) {
          const result = await triggerPageAuditForEngagement(session.whopUserId, activeWorkspace.workspaceId, engagementId, pageUrl, competitorPageUrl);
          ok = result.ok;
          message2 = result.ok ? result.message : result.error;
          if (result.ok) {
            const buyer = clients.find((c) => c.engagementId === engagementId)?.buyer;
            links.push({ label: "View run", href: `/dashboard/runs/${result.runId}` });
            links.push({ label: buyer ? `${buyer}'s page` : "Client page", href: `/dashboard/engagements/${engagementId}` });
          }
        } else {
          message2 = "Missing engagementId or pageUrl.";
        }
      } else if (block.name === "check_ai_engines") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        const subject = typeof block.input.subject === "string" ? block.input.subject : undefined;
        const question = typeof block.input.question === "string" ? block.input.question : undefined;
        if (engagementId) {
          const result = await triggerEngineAdhocCheckForEngagement(session.whopUserId, activeWorkspace.workspaceId, engagementId, subject, question);
          ok = result.ok;
          message2 = result.ok ? result.message : result.error;
          if (result.ok) {
            const buyer = clients.find((c) => c.engagementId === engagementId)?.buyer;
            links.push({ label: "View run", href: `/dashboard/runs/${result.runId}` });
            links.push({ label: buyer ? `${buyer}'s page` : "Client page", href: `/dashboard/engagements/${engagementId}` });
          }
        } else {
          message2 = "Missing engagementId.";
        }
      } else if (block.name === "check_crisis_threshold") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        const hypotheticalFindingText = typeof block.input.hypotheticalFindingText === "string" ? block.input.hypotheticalFindingText : "";
        const hypotheticalFindingSource = typeof block.input.hypotheticalFindingSource === "string" ? block.input.hypotheticalFindingSource : undefined;
        if (engagementId && hypotheticalFindingText) {
          const result = await triggerCrisisStressTestForEngagement(session.whopUserId, activeWorkspace.workspaceId, engagementId, hypotheticalFindingText, hypotheticalFindingSource);
          ok = result.ok;
          message2 = result.ok ? result.message : result.error;
          if (result.ok) {
            const buyer = clients.find((c) => c.engagementId === engagementId)?.buyer;
            links.push({ label: "View run", href: `/dashboard/runs/${result.runId}` });
            links.push({ label: buyer ? `${buyer}'s page` : "Client page", href: `/dashboard/engagements/${engagementId}` });
          }
        } else {
          message2 = "Missing engagementId or hypotheticalFindingText.";
        }
      } else if (block.name === "draft_response") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        const findingText = typeof block.input.findingText === "string" ? block.input.findingText : "";
        const findingPlatform = typeof block.input.findingPlatform === "string" ? block.input.findingPlatform : undefined;
        if (engagementId && findingText) {
          const result = await triggerDraftResponseForEngagement(session.whopUserId, activeWorkspace.workspaceId, engagementId, findingText, findingPlatform);
          ok = result.ok;
          message2 = result.ok ? result.message : result.error;
          if (result.ok) {
            const buyer = clients.find((c) => c.engagementId === engagementId)?.buyer;
            links.push({ label: "View run", href: `/dashboard/runs/${result.runId}` });
            links.push({ label: buyer ? `${buyer}'s page` : "Client page", href: `/dashboard/engagements/${engagementId}` });
          }
        } else {
          message2 = "Missing engagementId or findingText.";
        }
      } else if (block.name === "twitter_deep_scan") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        const deepScanSinceDate = typeof block.input.deepScanSinceDate === "string" ? block.input.deepScanSinceDate : "";
        if (engagementId && deepScanSinceDate) {
          const result = await triggerTwitterDeepScanForEngagement(session.whopUserId, activeWorkspace.workspaceId, engagementId, deepScanSinceDate);
          ok = result.ok;
          message2 = result.ok ? result.message : result.error;
          if (result.ok) {
            const buyer = clients.find((c) => c.engagementId === engagementId)?.buyer;
            links.push({ label: "View run", href: `/dashboard/runs/${result.runId}` });
            links.push({ label: buyer ? `${buyer}'s page` : "Client page", href: `/dashboard/engagements/${engagementId}` });
          }
        } else {
          message2 = "Missing engagementId or deepScanSinceDate.";
        }
      } else if (block.name === "trustpilot_deep_scan") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        const deepScanSinceDate = typeof block.input.deepScanSinceDate === "string" ? block.input.deepScanSinceDate : "";
        if (engagementId && deepScanSinceDate) {
          const result = await triggerTrustpilotDeepScanForEngagement(session.whopUserId, activeWorkspace.workspaceId, engagementId, deepScanSinceDate);
          ok = result.ok;
          message2 = result.ok ? result.message : result.error;
          if (result.ok) {
            const buyer = clients.find((c) => c.engagementId === engagementId)?.buyer;
            links.push({ label: "View run", href: `/dashboard/runs/${result.runId}` });
            links.push({ label: buyer ? `${buyer}'s page` : "Client page", href: `/dashboard/engagements/${engagementId}` });
          }
        } else {
          message2 = "Missing engagementId or deepScanSinceDate.";
        }
      } else if (block.name === "reddit_deep_scan") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        const deepScanTimeframe = typeof block.input.deepScanTimeframe === "string" ? block.input.deepScanTimeframe : "";
        if (engagementId && deepScanTimeframe) {
          const result = await triggerRedditDeepScanForEngagement(session.whopUserId, activeWorkspace.workspaceId, engagementId, deepScanTimeframe);
          ok = result.ok;
          message2 = result.ok ? result.message : result.error;
          if (result.ok) {
            const buyer = clients.find((c) => c.engagementId === engagementId)?.buyer;
            links.push({ label: "View run", href: `/dashboard/runs/${result.runId}` });
            links.push({ label: buyer ? `${buyer}'s page` : "Client page", href: `/dashboard/engagements/${engagementId}` });
          }
        } else {
          message2 = "Missing engagementId or deepScanTimeframe.";
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
