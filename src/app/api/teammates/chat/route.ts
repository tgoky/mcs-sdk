import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, coldOpenConfig, whopAgentConnections } from "@/models/schema";
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
import { getTodaysCalls, getRecentCancellations, getRunHistory, getActiveRecoveries, getLeakMapBenchmarkComparison, getWhopConnectionStatus } from "@/lib/chat-status-queries";
import {
  runProductLaunchPreflightForEngagement,
  assemblePurchaseCapPacketForEngagement,
  configureCancelDiscountForEngagement,
  assemblePayoutHoldKitForEngagement,
  assembleDisputeResponseForEngagement,
  submitDisputeEvidenceForEngagement,
  draftWhopAdForEngagement,
  flipWhopAdActiveForEngagement,
  runBulkPromoCodesForEngagement,
  runPortfolioRollupForEngagement,
  runWeeklyOpsReportForEngagement,
  runAttributionReportForEngagement,
  configureWhopBridgeForEngagement,
  configureCancellationSaveOfferForEngagement,
} from "@/lib/chat-whop-agent";
import { enableColdOpenSkillForEngagement } from "@/lib/chat-cold-open";
import type { ProductLaunchInput } from "@/features/whop-agent/server/product-launch-preflight-service";
import type { PromoCodeSpec } from "@/features/whop-agent/server/bulk-promo-codes-service";
import type { DisputeEvidenceDraft } from "@/features/whop-agent/server/dispute-response-service";
import { enrollProspectInWinBack } from "@/lib/chat-winback";
import { previewManualPileOnEnrollment, enrollProspectInPileOn } from "@/lib/chat-pile-on";
import { enablePileOnForEngagement } from "@/lib/enable-pile-on";
import { triggerVoiceExtractionForEngagement, triggerScriptPackForEngagement, triggerAdCreativeBriefsForEngagement, triggerPageAuditForEngagement, triggerConfirmationPageRebuildForEngagement, triggerEngineAdhocCheckForEngagement, triggerCrisisStressTestForEngagement, triggerDraftResponseForEngagement, triggerTwitterDeepScanForEngagement, triggerTrustpilotDeepScanForEngagement, triggerRedditDeepScanForEngagement } from "@/lib/chat-skill-trigger";
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
    name: "check_whop_connection",
    description:
      "Checks whether a client has a working Whop account connection through Whop Agent (the pasted Bot API key from its Connect step) — read-only. This is a completely different thing from the user being logged into this dashboard at all, which is a Whop OAuth session every request already requires and is never something to 'check' — never answer a general 'is my Whop account connected' question from session state alone; if the user means a specific client's Whop Agent connection, call this. If Whop Agent isn't installed in the workspace, say so plainly instead of calling this tool.",
    input_schema: {
      type: "object",
      properties: { engagementId: { type: "string", description: "The client to check." } },
      required: ["engagementId"],
    },
  },
  {
    name: "run_product_launch_preflight",
    description:
      "Runs Whop Agent's Product Launch Pre-Flight for one product — validates the launch inputs against the purchase cap and Whop's own rules. For a client's first launch (per Section 8.2) this always comes back as a dry run — a preview of exactly what would be created, no live write. There is currently no way, in this chat or the dashboard, to force a real launch past that first dry run for a single product below the bulk-confirmation threshold (more than 3 products in one call queues the whole batch for a human to approve instead, and going live from there is real) — say so plainly rather than implying you can push it live.",
    input_schema: {
      type: "object",
      properties: {
        engagementId: { type: "string", description: "The client to launch this for." },
        title: { type: "string", description: "Product title." },
        headline: { type: "string", description: "Product headline." },
        description: { type: "string", description: "Optional product description." },
        plans: {
          type: "array",
          description: "At least one pricing plan.",
          items: {
            type: "object",
            properties: {
              priceCents: { type: "number" },
              billingType: { type: "string", enum: ["one_time", "recurring"] },
              billingPeriod: { type: "string", enum: ["monthly", "yearly", "weekly"], description: "Required if billingType is recurring." },
            },
            required: ["priceCents", "billingType"],
          },
        },
        promoCode: {
          type: "object",
          description: "Optional launch promo code.",
          properties: { code: { type: "string" }, discountPercentage: { type: "number" } },
        },
      },
      required: ["engagementId", "title", "headline", "plans"],
    },
  },
  {
    name: "assemble_purchase_cap_packet",
    description:
      "Read-only. Assembles Whop Agent's purchase-cap increase request packet for a client (sales history, account health, the manual walkthrough for submitting the request in the Whop dashboard — there's no API to submit it directly). Use this when a launch is halted for exceeding the purchase cap, or whenever the user wants to request a cap increase.",
    input_schema: {
      type: "object",
      properties: {
        engagementId: { type: "string", description: "The client to assemble this for." },
        highestPricedOfferCents: { type: "number", description: "The highest-priced offer driving the request, in cents." },
        targetApprovalAmountCents: { type: "number", description: "The cap amount being requested, in cents." },
        contactEmail: { type: "string", description: "Contact email for the request." },
      },
      required: ["engagementId", "highestPricedOfferCents", "targetApprovalAmountCents", "contactEmail"],
    },
  },
  {
    name: "configure_cancel_discount",
    description:
      "Proposes a native cancel-discount configuration on one of a client's recurring plans — every member who reaches the cancel step would see this offer. Always queued for a human to approve in the dashboard's Approvals (Section 8.3) — this never goes live directly, regardless of what's passed.",
    input_schema: {
      type: "object",
      properties: {
        engagementId: { type: "string", description: "The client to configure this for." },
        planId: { type: "string", description: "The Whop plan id." },
        percentage: { type: "number", description: "Discount percentage, 1-100." },
        intervals: { type: "number", description: "Number of billing intervals the discount applies for." },
      },
      required: ["engagementId", "planId", "percentage", "intervals"],
    },
  },
  {
    name: "assemble_payout_hold_kit",
    description: "Read-only. Assembles a client's payout hold/suspension packet — account health, payout methods, chargeback ratio, a drafted escalation message to Whop support, and a follow-up checklist. Can run any time, not just during an actual hold (packet-on-demand).",
    input_schema: {
      type: "object",
      properties: { engagementId: { type: "string", description: "The client to assemble this for." } },
      required: ["engagementId"],
    },
  },
  {
    name: "assemble_dispute_response",
    description: "Read-only. Drafts a dispute evidence response for a real, specific Whop dispute on a client's account. Never posts anything — always show the user the draft and let them confirm before calling submit_dispute_evidence.",
    input_schema: {
      type: "object",
      properties: {
        engagementId: { type: "string", description: "The client this dispute belongs to." },
        disputeId: { type: "string", description: "The Whop dispute id." },
      },
      required: ["engagementId", "disputeId"],
    },
  },
  {
    name: "submit_dispute_evidence",
    description:
      "Submits dispute evidence for real — but only ever as a queued request a human has to approve in the dashboard's Approvals (Section 8.3); this never posts to Whop directly. Only call this after assemble_dispute_response has produced a draft and the user has reviewed/confirmed it — pass the final draft (possibly user-edited), not a guessed one.",
    input_schema: {
      type: "object",
      properties: {
        engagementId: { type: "string", description: "The client this dispute belongs to." },
        disputeId: { type: "string", description: "The Whop dispute id." },
        draft: {
          type: "object",
          description: "The evidence draft — notes is required, the rest are optional supporting fields matching Whop's own evidence categories.",
          properties: {
            notes: { type: "string" },
            access_activity_log: { type: "string" },
            billing_address: { type: "string" },
            cancellation_policy_disclosure: { type: "string" },
            customer_communication_attachment: { type: "string" },
            customer_email_address: { type: "string" },
            customer_name: { type: "string" },
            product_description: { type: "string" },
            refund_policy_disclosure: { type: "string" },
            refund_refusal_explanation: { type: "string" },
            service_date: { type: "string" },
            uncategorized_attachment: { type: "string" },
          },
          required: ["notes"],
        },
      },
      required: ["engagementId", "disputeId", "draft"],
    },
  },
  {
    name: "draft_whop_ad",
    description:
      "Drafts a Whop ad in the background — generates creative media and creates the ad in draft status only, no spend yet. Dispatches and returns a runId immediately; tell the user it's running. Flipping it active (real spend) is the separate flip_whop_ad_active action.",
    input_schema: {
      type: "object",
      properties: {
        engagementId: { type: "string", description: "The client to draft this ad for." },
        productId: { type: "string", description: "The Whop product id being advertised." },
        creativeBrief: { type: "string", description: "The creative brief describing the ad." },
        budgetCents: { type: "number", description: "Budget in cents." },
        budgetLevel: { type: "string", enum: ["ad_group", "campaign"], description: "Which level the budget applies at." },
        targeting: { type: "object", description: "Optional targeting parameters." },
      },
      required: ["engagementId", "productId", "creativeBrief", "budgetCents", "budgetLevel"],
    },
  },
  {
    name: "flip_whop_ad_active",
    description: "Flips a drafted Whop ad active — starts real spend. Always queued for a human to approve in the dashboard's Approvals (Section 8.3); never goes live directly. Only call this after the user has seen the draft and explicitly asked to activate it.",
    input_schema: {
      type: "object",
      properties: {
        engagementId: { type: "string", description: "The client this ad belongs to." },
        adId: { type: "string", description: "The Whop ad id (from draft_whop_ad's result)." },
        budgetCents: { type: "number", description: "The budget to activate with, in cents." },
      },
      required: ["engagementId", "adId", "budgetCents"],
    },
  },
  {
    name: "run_bulk_promo_codes",
    description:
      "Creates promo codes on a client's live Whop account, up to 25 in one call (more is automatically queued for a human to approve instead). First run for a client defaults to a dry run (Section 8.2) unless dryRun:false is explicitly passed — never pass dryRun:false yourself unless the user has already seen a dry-run result and explicitly confirmed the real thing.",
    input_schema: {
      type: "object",
      properties: {
        engagementId: { type: "string", description: "The client to create these for." },
        codes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              code: { type: "string" },
              planIds: { type: "array", items: { type: "string" } },
              discountPercentage: { type: "number" },
              newUsersOnly: { type: "boolean" },
              existingMembershipsOnly: { type: "boolean" },
              churnedUsersOnly: { type: "boolean" },
              onePerCustomer: { type: "boolean" },
              stock: { type: "number" },
              unlimitedStock: { type: "boolean" },
              promoDurationMonths: { type: "number" },
              expiresAt: { type: "string" },
            },
            required: ["code", "planIds", "discountPercentage"],
          },
        },
        dryRun: { type: "boolean", description: "Only set to false after the user has seen a dry run and explicitly confirmed the real thing." },
      },
      required: ["engagementId", "codes"],
    },
  },
  {
    name: "run_portfolio_rollup",
    description: "Runs Whop Agent's Portfolio Rollup for a client in the background — read-only reporting, no writes to Whop. Dispatches and returns a runId; tell the user it's running and check get_run_history for the result.",
    input_schema: {
      type: "object",
      properties: { engagementId: { type: "string", description: "The client to run this for." } },
      required: ["engagementId"],
    },
  },
  {
    name: "run_weekly_ops_report",
    description: "Runs Whop Agent's Weekly Ops Report for a client on demand (Section 9.8: manual on-demand always available) — read-only reporting. Dispatches and returns a runId; tell the user it's running.",
    input_schema: {
      type: "object",
      properties: { engagementId: { type: "string", description: "The client to run this for." } },
      required: ["engagementId"],
    },
  },
  {
    name: "run_attribution_report",
    description: "Runs Whop Agent's Attribution & Affiliate Report for a client — read-only, no writes to Whop.",
    input_schema: {
      type: "object",
      properties: { engagementId: { type: "string", description: "The client to run this for." } },
      required: ["engagementId"],
    },
  },
  {
    name: "configure_whop_bridge",
    description: "Sets the destination URL Whop Agent's Bridge Manager routes verified webhook events to for a client. A plain config write, never gated — it doesn't touch Whop or the destination itself. Field mapping (if the destination needs one) still has to be set on the client's own Bridge Manager page.",
    input_schema: {
      type: "object",
      properties: {
        engagementId: { type: "string", description: "The client to configure this for." },
        destinationUrl: { type: "string", description: "Must be a valid https:// URL." },
      },
      required: ["engagementId", "destinationUrl"],
    },
  },
  {
    name: "configure_cancellation_save_offer",
    description:
      "Saves what a client's native cancel-discount save-offer would say (discount %, duration, message) — a plain config write, not gated. This only saves the config; it gets proposed automatically the next time a real cancel-intent event comes in, it doesn't apply anything immediately.",
    input_schema: {
      type: "object",
      properties: {
        engagementId: { type: "string", description: "The client to configure this for." },
        discountPercentage: { type: "number", description: "1-100." },
        durationMonths: { type: "number", description: "Positive whole number." },
        message: { type: "string", description: "The offer message shown to the member — required, never guess this." },
        minTenureDays: { type: "number", description: "Optional minimum tenure before this offer applies." },
        cooldownDays: { type: "number", description: "Optional cooldown between offers." },
      },
      required: ["engagementId", "discountPercentage", "durationMonths", "message"],
    },
  },
  {
    name: "enable_cold_open_skill",
    description:
      "Turns one of Cold Open's skills on or off for a client — the same toggle the dashboard's Skills panel has. Cannot turn on icp-lock this way (it needs its own onboarding bridge) and every other skill needs icp-lock to have already run for this client. This ONLY toggles the switch — voice-capture, source-connect, send-connect, daily-send, reply-sort, and send-report all then run automatically on their own cadence; there's no separate 'run now' for any of them, here or in the dashboard.",
    input_schema: {
      type: "object",
      properties: {
        engagementId: { type: "string", description: "The client to toggle this for." },
        skillId: { type: "string", enum: ["voice-capture", "source-connect", "send-connect", "daily-send", "reply-sort", "send-report"], description: "Which Cold Open skill." },
        enabled: { type: "boolean" },
      },
      required: ["engagementId", "skillId", "enabled"],
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
    name: "enable_pile_on",
    description:
      "Turns the Pile-On worker on for a client — a real action (installs Showtime into the workspace if needed, flips the worker on). Optionally sets the SMS follow-up platform and/or ad-data cohort sync platform at the same time; omit either (or pass \"none\") to leave it off, same as enabling from the Library without answering them — nothing is required beyond the client.",
    input_schema: {
      type: "object",
      properties: {
        engagementId: { type: "string", description: "The client to enable Pile-On for." },
        smsPlatform: { type: "string", enum: ["none", "twilio", "ghl_sms", "hubspot_sms"], description: "Optional — which platform sends the SMS follow-up sequence." },
        adDataPlatform: { type: "string", enum: ["none", "hyros", "google_sheets", "native_crm"], description: "Optional — which platform receives the ad-spend attribution cohort sync." },
      },
      required: ["engagementId"],
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
      "Audits an existing confirmation page URL against what a well-built one should include (hero video, what-to-expect section, breakout content, social proof, reschedule path) and notes concrete gaps, in the background — the same audit Show Rate Setup runs. Does NOT build or deploy a new page — use rebuild_confirmation_page for that, or ask the user which they want. Optionally also fetches a second URL (typically a competitor's confirmation page) and compares directly against it. Dispatches and returns immediately with a runId.",
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
    name: "rebuild_confirmation_page",
    description:
      "Rebuilds and republishes the client's Pin-Down confirmation page using their current offer, testimonials, top call questions, hero video, and chosen design template — the same build+deploy Show Rate Setup ran once at onboarding, run again on demand. Republishes to the client's existing hosting platform (Webflow/WordPress/Vercel) if one is configured, updating the page already live there rather than creating a duplicate; otherwise hands back paste-ready HTML. Also re-scrapes the client's site for design signal, so this is the right call after their offer, proof, hero video, or site design changes. Does NOT re-run voice extraction, scripts, or ad briefs — those are their own separate actions. Has no effect if the client is configured to keep their own existing confirmation page instead of a Pin-Down-built one. Dispatches and returns immediately with a runId.",
    input_schema: {
      type: "object",
      properties: {
        engagementId: { type: "string", description: "The client whose confirmation page to rebuild." },
        heroVideoUrl: {
          type: "string",
          description: "Optional — a Loom, YouTube, or Vimeo share link to the client's recorded hero video, to save and embed in this same rebuild. Only include this if the user actually gave a video link; omit to just rebuild with whatever's already on file (or the placeholder, if no video has been recorded yet).",
        },
      },
      required: ["engagementId"],
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
interface ClientForPrompt {
  engagementId: string;
  buyer: string;
  repEnrolled: boolean;
  coldOpenEnrolled: boolean;
  whopAgentConnected: boolean;
}

function buildSystemPrompt(
  clients: ClientForPrompt[],
  installed: { repInstalled: boolean; coldOpenInstalled: boolean; whopAgentInstalled: boolean }
): string {
  const clientList =
    clients.length > 0
      ? clients
          .map((c) => {
            const tags = [
              c.repEnrolled ? "Reputation Manager" : null,
              c.coldOpenEnrolled ? "Cold Open" : null,
              c.whopAgentConnected ? "Whop Agent connected" : null,
            ].filter(Boolean);
            return `- ${c.buyer} (engagementId: ${c.engagementId}${tags.length ? ", " + tags.join(", ") : ""})`;
          })
          .join("\n")
      : "(no clients yet)";
  const installedProducts = [
    "Showtime",
    installed.repInstalled ? "Reputation Manager" : null,
    installed.coldOpenInstalled ? "Cold Open" : null,
    installed.whopAgentInstalled ? "Whop Agent" : null,
  ].filter(Boolean);
  const notInstalledProducts = [
    !installed.repInstalled ? "Reputation Manager" : null,
    !installed.coldOpenInstalled ? "Cold Open" : null,
    !installed.whopAgentInstalled ? "Whop Agent" : null,
  ].filter(Boolean);
  return [
    "You are Teammates, an assistant inside a sales-automation dashboard. The app has four products total: Showtime (booking/sales automation), Reputation Manager (online reputation monitoring), Cold Open (cold outbound email), and Whop Agent (automation against the operator's own Whop seller account — ads, disputes, payouts, webhooks, etc.). Know all four exist regardless of what's installed here — never act as if a product you have no tools for doesn't exist in the app at all; say plainly when something belongs to a real product but isn't wired up as a chat action yet, as the specific rules below do for each one.",
    `Installed in this workspace: ${installedProducts.join(", ")}.${notInstalledProducts.length ? ` NOT installed: ${notInstalledProducts.join(", ")} — if asked to create a client or take an action in one of these, say plainly it isn't installed here rather than trying.` : ""}`,
    "You can trigger real actions on the user's behalf. Showtime: Call Brief, Leak Map, create a client by name, connect a booking or email platform credential, manually enroll a specific prospect in win-back recovery, preview or manually enroll a specific prospect in Pile-On's pre-call sequence, turn the Pile-On worker on for a client, run any of Show Rate Setup's individual pieces (brand voice extraction, video scripts, ad creative briefs, confirmation page audit, confirmation page rebuild) standalone. Reputation Manager: create a client by operator name, ask a client's configured AI engines a live one-off question, test a hypothetical finding against a client's crisis threshold, draft a suggested response to a real flagged finding, deep-scan X/Twitter/Trustpilot/Reddit. Whop Agent: check a client's connection health, run Product Launch Pre-Flight, assemble a purchase-cap increase packet, propose a cancel-discount configuration (queued for human approval), assemble a payout-hold kit, assemble and submit dispute evidence (submission queued for human approval), draft a Whop ad and flip one active (flipping is queued for human approval), create bulk promo codes, run the Portfolio Rollup / Weekly Ops Report / Attribution Report, and configure the Bridge Manager destination or the cancellation save-offer message. Cold Open: turn one of its skills on or off for an already-onboarded client. Plus status questions for any client — today's calls, recent cancellations, run history, active win-back recoveries, how a client's Leak Map metrics compare to similar clients — without triggering anything. What's genuinely NOT reachable from chat, because the underlying capability doesn't exist anywhere in the app yet (dashboard included) rather than just missing a chat wrapper: Whop Agent's own Connect step (pasting the Bot API key — a raw secret can never go through chat, full stop), Drift Monitor and Refund/Dispute Velocity (cron-only, no manual dispatch anywhere), Daily Change Digest (notification-only, nothing to run), Cold Open's ICP Lock onboarding and its other 6 skills' actual sends/scans (they run on their own cadence once enabled — only the on/off switch is real), Reputation Manager's own watch skills on demand, and Showtime's full Pin-Down wizard / a whole-worker Pile-On or Win-Back run. Say so plainly for any of those rather than pretending to do it.",
    "",
    "Clients (tags show which products beyond Showtime a client is actually enrolled in / connected to — a client with no tags is Showtime-only, or just created and not yet set up):",
    clientList,
    "",
    "Rules:",
    "- For Call Brief or Leak Map: only call the tool once you're sure which client the user means. If the client name is ambiguous, missing, or doesn't match anyone in the list above, ask a short clarifying question instead of guessing — never call a tool with a guessed engagementId. If they seem to mean a client who isn't in the list, ask whether they want to create that client first rather than assuming. Call Brief specifically needs a booking platform connected to run at all — if the tool says one isn't connected, offer to help set that up rather than just reporting the error and stopping. Neither tool applies to a Reputation Manager-only client — say so instead of trying.",
    "- For create_client: only the name is needed. Don't ask for booking/email platform, credentials, or anything else — that happens on the client's own page afterward, which the reply will link to automatically. Use this for a Showtime client.",
    `- For create_rep_client: only the operator name is needed (the person/brand whose reputation is being monitored) — same minimal shape as create_client, just for Reputation Manager. ${installed.repInstalled ? "Full identity-graph setup (aliases, handles, domains, competitors, which engines to run) still happens on the client's own Identity Setup page afterward, which the reply will link to automatically." : "Reputation Manager isn't installed in this workspace — if asked to create one, say so plainly rather than calling the tool."}`,
    "- Reputation Manager's own watch skills (AI Engine Watch, Trustpilot/Reddit/Twitter Watch, Crisis Response) run automatically on their own schedule once a client's Identity Setup is complete — there's no manual \"run now\" for them yet, in the dashboard or here. If asked to trigger one on demand, say so plainly rather than pretending to.",
    "- Whop Agent write actions are gated the same way the dashboard gates them, not by anything in this prompt alone: run_product_launch_preflight and run_bulk_promo_codes come back as a dry run on a client's first use (Section 8.2) with no way to force it live from chat for a single item — say so plainly rather than implying you can push it through; configure_cancel_discount, submit_dispute_evidence, and flip_whop_ad_active always queue a pendingAction for a human to approve in the dashboard's Approvals (Section 8.3), they never go live directly no matter how the user phrases the request — tell them it's queued and needs that approval, not that it's done. draft_whop_ad only creates a draft (no spend); flip_whop_ad_active only ever queues turning it on. assemble_purchase_cap_packet, assemble_payout_hold_kit, and assemble_dispute_response are read-only research/drafting, never move ahead to the queued action on your own — show the user what was assembled and let them decide.",
    "- Whop Agent's Connect step (pasting the Bot API key) can never happen through chat — same raw-secret rule as booking/email credentials, no exception. Drift Monitor, Refund/Dispute Velocity, and Daily Change Digest have no manual trigger anywhere in this app, chat or dashboard — say so plainly rather than pretending to run one. Cold Open's ICP Lock onboarding needs its own bridge wizard (real ICP/product-identity input this chat can't collect) — point to that page instead of trying; enable_cold_open_skill only toggles an already-onboarded client's other skills on/off, it never runs a send or a scan on demand — those fire automatically on their own cadence once enabled, exactly like Reputation Manager's watch skills below.",
    "- \"Is my Whop account connected\" is ambiguous between two real, different things — resolve which one before answering, don't guess: (1) the user's own Whop login session to this dashboard, which is always true simply by being here and using it (there's nothing to look up for that), and (2) a specific client's Whop Agent connection (a pasted Whop Bot API key, probed and health-checked — see check_whop_connection), which is a real per-client state that can be missing, healthy, or broken and genuinely needs looking up. If they mean their own login, say plainly it's already connected. If they mean a client's Whop Agent connection, or it's unclear which client, ask which client (if ambiguous) and call check_whop_connection rather than answering from memory. If Whop Agent isn't installed in this workspace at all, say that instead of calling the tool.",
    "- More generally: if asked about something outside these tools' scope (a platform check_credential doesn't cover, an action none of these tools do, a product with no chat tools), don't just say it can't be checked/done and stop there — say plainly what you actually can do that's closest to what they asked, and whether the thing they want exists elsewhere in the app, so the reply is useful context rather than a dead end.",
    "- For booking or email platform setup: always call check_credential first, never assume whether one already exists or is reusable. If it finds a reusable saved credential, ask before calling use_saved_credential — don't link it without confirming. If none exists and the platform is Composio-managed (Calendly/GoHighLevel Calendar for booking; HubSpot/Klaviyo/Mailchimp/GoHighLevel for email), call connect_credential and tell the user to click the link — it's a real redirect, not something you can finish for them. For anything else (Cal.com, OnceHub, ActiveCampaign, ConvertKit, direct SMTP), or if they'd rather type a key directly, tell them to paste it on the client's own page instead — you can't collect a raw credential value in chat, only real links or saved-credential reuse. Always pass the correct field (\"booking\" or \"email\") matching which platform you're setting up.",
    "- Never ask the user to paste an API key or secret directly in this chat, under any circumstances, even if they offer to.",
    "- If a message arrives saying a platform was just connected, that means the user completed a connect_credential link and came back — call check_credential for that client/provider (it should now show a reusable credential) and then use_saved_credential to finish linking it, using whichever client was being set up earlier in the conversation.",
    "- For status questions — what's on today, who cancelled, how did a run go, who's in an active recovery, how a client's Leak Map metrics compare to similar clients, whether a client's Whop Agent connection is healthy — use get_todays_calls / get_recent_cancellations / get_run_history / get_active_recoveries / compare_leak_map_benchmarks / check_whop_connection. These never change anything, so use them freely whenever the user is asking about current state rather than asking you to do something.",
    "- After a tool call, tell the user plainly what happened, including any error a tool returned (e.g. the skill being disabled for that client).",
    "- For enroll_in_winback: needs a working email-platform credential on the client already, plus the platform's recovery list/workflow configured — if the tool reports something's missing, tell the user plainly what and point them to the client's page, don't retry blindly.",
    "- For enroll_in_pile_on: ALWAYS call preview_pile_on_enrollment first and show the user its output before ever calling enroll_in_pile_on — never call enroll_in_pile_on in the same turn as the user's first request without a preview shown first. It only enrolls email, never SMS or an ad-data cohort sync (say so plainly if asked — deliberately not replicated for manual enrollment, see the tool's own description for why). If the preview or the real call reports an existing booking on file for that email, tell the user plainly and only pass force:true after they explicitly confirm they want to proceed anyway — never set force on your own judgment.",
    "- For enable_pile_on: this is a DIFFERENT action from enroll_in_pile_on — enable_pile_on turns the worker itself on for a client (once), enroll_in_pile_on enrolls one specific prospect (repeatable). Don't confuse them. smsPlatform/adDataPlatform are both optional — if the user doesn't mention them, enable with neither set rather than asking a checklist of questions; only ask if they bring up SMS or ad-data tracking themselves.",
    "- For check_crisis_threshold: the finding must be explicitly hypothetical — if the user describes something that actually happened, don't use this tool, tell them the real watch skills (or draft_response) are what handle real findings. Never presents as declaring a real incident; always make clear in your reply that nothing was actually triggered, this only tested the threshold.",
    "- For twitter_deep_scan and trustpilot_deep_scan: deepScanSinceDate must be a real past date the user gives you, not something you pick. Both add real results to the client's actual monitoring history, the same as the regular scheduled watch — never present either as a preview or a dry run.",
    "- For reddit_deep_scan: Reddit's own search has no exact date cutoff the way Trustpilot/X do, only a timeframe bucket (hour/day/week/month/year/all) — never ask the user for a specific date for this one, ask which bucket to widen into instead, and if they give you a date, translate it to the closest bucket yourself rather than pushing back. Adds real results to the client's actual monitoring history, same as the regular scheduled watch.",
    "- For draft_response: this is for a REAL finding the user gives you (a real review, a real mention) — the draft never gets posted anywhere automatically, always tell the user to review and post it themselves. Don't fabricate specific facts, offers, or promises in how you relay the draft.",
    "- For check_ai_engines: omit subject to ask about the client themselves; to ask about a competitor, use the exact name from their tracked competitors list (shown on their Identity Setup) — never guess or paraphrase a competitor name that hasn't been confirmed as tracked, ask the user to confirm the exact name instead. This is a live spot-check, separate from the scheduled AI Engine Watch panel — nothing gets saved to the client's monitoring history, so don't present it as if it updates their ongoing findings.",
    "- extract_brand_voice, generate_video_scripts, generate_ad_briefs, audit_confirmation_page, and rebuild_confirmation_page all run in the background and take a while — always tell the user it's running and won't finish instantly, and offer to check status with get_run_history if they ask later. None of these run the full Show Rate Setup wizard end to end (no booking webhook wiring) — each does exactly the one piece it's named for, using whatever the client already has on file (brand voice, offer details, call questions) and degrading to a more generic result if some of that isn't set yet, never failing outright for missing optional context. audit_confirmation_page only reviews a page that already exists; rebuild_confirmation_page is the one that actually rebuilds and republishes it — use rebuild_confirmation_page when asked to build, regenerate, or redeploy the confirmation page, or ask the user which they want if it's unclear.",
    "- generate_video_scripts' approach param: only set it when the user explicitly asks to regenerate with a different angle/framing — never set it on a first-time script generation, and never invent a description beyond the 3 real options (research_assistance/urgency/faq) listed in the tool's own schema. audit_confirmation_page's competitorPageUrl: only set it when the user gives an actual competitor URL to compare against — never guess or reuse a URL from earlier in the conversation for a different purpose. rebuild_confirmation_page's heroVideoUrl: only set it when the user actually gives a Loom/YouTube/Vimeo link to save — omit it to just rebuild with whatever's already on file.",
    "- The full tool list is exactly the tools available to you in this call, nothing more — Showtime/RM/Whop Agent/Cold Open actions described above, plus status/read tools. If asked for Showtime's full onboarding wizard end to end, Pile-On's SMS or ad-data cohort sync during MANUAL PROSPECT ENROLLMENT specifically (enroll_in_pile_on only does email — enable_pile_on can set the platform CHOICE when turning the worker on, that's a different thing), to manually trigger the SCHEDULED AI Engine Watch panel or the Trustpilot/Reddit/Twitter/Crisis Response watch skills on their regular cadence, or for anything listed as genuinely not reachable above (Whop Agent Connect, Drift Monitor, Refund/Dispute Velocity, Daily Change Digest, Cold Open's ICP Lock or its other skills' actual sends/scans), say plainly that it's not wired up rather than pretending to do it.",
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
    const [clients, repEnrolledIds, coldOpenEnrolledRows, whopAgentConnectedRows, repInstalled, coldOpenInstalled, whopAgentInstalled] = await Promise.all([
      db
        .select({ engagementId: engagements.engagementId, buyer: engagements.buyer })
        .from(engagements)
        .where(and(eq(engagements.whopUserId, session.whopUserId), eq(engagements.workspaceId, activeWorkspace.workspaceId), isNull(engagements.deletedAt))),
      getRepEnrolledEngagementIds(session.whopUserId, activeWorkspace.workspaceId),
      // coldOpenConfig/whopAgentConnections each key uniquely off
      // engagementId with no workspaceId column of their own (same shape
      // as repIdentityGraphs) — scoped to this workspace the same way
      // getRepEnrolledEngagementIds is, via the engagements join.
      db
        .select({ engagementId: coldOpenConfig.engagementId })
        .from(coldOpenConfig)
        .innerJoin(engagements, eq(engagements.engagementId, coldOpenConfig.engagementId))
        .where(and(eq(engagements.whopUserId, session.whopUserId), eq(engagements.workspaceId, activeWorkspace.workspaceId), isNull(engagements.deletedAt))),
      db
        .select({ engagementId: whopAgentConnections.engagementId })
        .from(whopAgentConnections)
        .innerJoin(engagements, eq(engagements.engagementId, whopAgentConnections.engagementId))
        .where(and(eq(engagements.whopUserId, session.whopUserId), eq(engagements.workspaceId, activeWorkspace.workspaceId), isNull(engagements.deletedAt))),
      isPackageInstalledInWorkspace(activeWorkspace.workspaceId, "reputation-manager"),
      isPackageInstalledInWorkspace(activeWorkspace.workspaceId, "cold-open"),
      isPackageInstalledInWorkspace(activeWorkspace.workspaceId, "whop-agent"),
    ]);
    const repEnrolledSet = new Set(repEnrolledIds);
    const coldOpenEnrolledSet = new Set(coldOpenEnrolledRows.map((r) => r.engagementId));
    const whopAgentConnectedSet = new Set(whopAgentConnectedRows.map((r) => r.engagementId));

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

    const clientsForPrompt: ClientForPrompt[] = clients.map((c) => ({
      ...c,
      repEnrolled: repEnrolledSet.has(c.engagementId),
      coldOpenEnrolled: coldOpenEnrolledSet.has(c.engagementId),
      whopAgentConnected: whopAgentConnectedSet.has(c.engagementId),
    }));
    const system = buildSystemPrompt(clientsForPrompt, { repInstalled, coldOpenInstalled, whopAgentInstalled });
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
      } else if (block.name === "check_whop_connection") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        if (!engagementId) {
          message2 = "Missing engagementId.";
        } else if (!whopAgentInstalled) {
          message2 = "Whop Agent isn't installed in this workspace, so there's no Whop Bot API key connection to check for this client.";
        } else {
          const status = await getWhopConnectionStatus(engagementId, activeWorkspace.workspaceId);
          ok = true;
          if (!status.connected) {
            message2 = "No Whop account has been connected for this client yet. Whop Agent's Connect step hasn't been run.";
          } else if (status.disconnected) {
            message2 = `This client's Whop connection was disconnected (account ${status.whopAccountId ?? "unknown"}). It needs to be reconnected.`;
          } else if (status.circuitBreakerState === "open") {
            message2 = `This client's Whop connection is broken (account ${status.whopAccountId ?? "unknown"}). The circuit breaker tripped${status.circuitBreakerReason ? `: ${status.circuitBreakerReason}` : ""}. It needs to be reconnected.`;
          } else {
            message2 = `Connected (account ${status.whopAccountId ?? "unknown"}, ${status.credentialType} credential). ${status.unlockedScopeCount}/${status.totalScopeCount} probed scopes unlocked${status.lastScopeProbeAt ? `, last checked ${status.lastScopeProbeAt.toLocaleString()}` : ""}.`;
          }
        }
      } else if (block.name === "run_product_launch_preflight") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        if (!whopAgentInstalled) {
          message2 = "Whop Agent isn't installed in this workspace.";
        } else if (!engagementId) {
          message2 = "Missing engagementId.";
        } else {
          const result = await runProductLaunchPreflightForEngagement(session, engagementId, {
            title: typeof block.input.title === "string" ? block.input.title : "",
            headline: typeof block.input.headline === "string" ? block.input.headline : "",
            description: typeof block.input.description === "string" ? block.input.description : undefined,
            plans: Array.isArray(block.input.plans) ? (block.input.plans as ProductLaunchInput["plans"]) : [],
            promoCode: block.input.promoCode as ProductLaunchInput["promoCode"],
          });
          ok = result.ok;
          message2 = result.ok ? result.message : result.error;
        }
      } else if (block.name === "assemble_purchase_cap_packet") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        if (!whopAgentInstalled) {
          message2 = "Whop Agent isn't installed in this workspace.";
        } else if (!engagementId) {
          message2 = "Missing engagementId.";
        } else {
          const result = await assemblePurchaseCapPacketForEngagement(session, engagementId, {
            highestPricedOfferCents: Number(block.input.highestPricedOfferCents),
            targetApprovalAmountCents: Number(block.input.targetApprovalAmountCents),
            contactEmail: typeof block.input.contactEmail === "string" ? block.input.contactEmail : "",
          });
          ok = result.ok;
          message2 = result.ok ? result.message : result.error;
        }
      } else if (block.name === "configure_cancel_discount") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        if (!whopAgentInstalled) {
          message2 = "Whop Agent isn't installed in this workspace.";
        } else if (!engagementId) {
          message2 = "Missing engagementId.";
        } else {
          const result = await configureCancelDiscountForEngagement(
            session,
            engagementId,
            typeof block.input.planId === "string" ? block.input.planId : "",
            Number(block.input.percentage),
            Number(block.input.intervals)
          );
          ok = result.ok;
          message2 = result.ok ? result.message : result.error;
        }
      } else if (block.name === "assemble_payout_hold_kit") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        if (!whopAgentInstalled) {
          message2 = "Whop Agent isn't installed in this workspace.";
        } else if (!engagementId) {
          message2 = "Missing engagementId.";
        } else {
          const result = await assemblePayoutHoldKitForEngagement(session, engagementId);
          ok = result.ok;
          message2 = result.ok ? result.message : result.error;
        }
      } else if (block.name === "assemble_dispute_response") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        if (!whopAgentInstalled) {
          message2 = "Whop Agent isn't installed in this workspace.";
        } else if (!engagementId) {
          message2 = "Missing engagementId.";
        } else {
          const result = await assembleDisputeResponseForEngagement(session, engagementId, typeof block.input.disputeId === "string" ? block.input.disputeId : "");
          ok = result.ok;
          message2 = result.ok ? result.message : result.error;
        }
      } else if (block.name === "submit_dispute_evidence") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        if (!whopAgentInstalled) {
          message2 = "Whop Agent isn't installed in this workspace.";
        } else if (!engagementId) {
          message2 = "Missing engagementId.";
        } else {
          const result = await submitDisputeEvidenceForEngagement(
            session,
            engagementId,
            typeof block.input.disputeId === "string" ? block.input.disputeId : "",
            (block.input.draft ?? {}) as DisputeEvidenceDraft
          );
          ok = result.ok;
          message2 = result.ok ? result.message : result.error;
        }
      } else if (block.name === "draft_whop_ad") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        if (!whopAgentInstalled) {
          message2 = "Whop Agent isn't installed in this workspace.";
        } else if (!engagementId) {
          message2 = "Missing engagementId.";
        } else {
          const result = await draftWhopAdForEngagement(session, engagementId, {
            productId: typeof block.input.productId === "string" ? block.input.productId : "",
            creativeBrief: typeof block.input.creativeBrief === "string" ? block.input.creativeBrief : "",
            budgetCents: Number(block.input.budgetCents),
            budgetLevel: block.input.budgetLevel === "campaign" ? "campaign" : "ad_group",
            targeting: block.input.targeting as Record<string, unknown> | undefined,
          });
          ok = result.ok;
          message2 = result.ok ? result.message : result.error;
          if (result.ok && result.runId) links.push({ label: "View run", href: `/dashboard/runs/${result.runId}` });
        }
      } else if (block.name === "flip_whop_ad_active") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        if (!whopAgentInstalled) {
          message2 = "Whop Agent isn't installed in this workspace.";
        } else if (!engagementId) {
          message2 = "Missing engagementId.";
        } else {
          const result = await flipWhopAdActiveForEngagement(
            session,
            engagementId,
            typeof block.input.adId === "string" ? block.input.adId : "",
            Number(block.input.budgetCents)
          );
          ok = result.ok;
          message2 = result.ok ? result.message : result.error;
        }
      } else if (block.name === "run_bulk_promo_codes") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        if (!whopAgentInstalled) {
          message2 = "Whop Agent isn't installed in this workspace.";
        } else if (!engagementId) {
          message2 = "Missing engagementId.";
        } else {
          const dryRun = typeof block.input.dryRun === "boolean" ? block.input.dryRun : undefined;
          const result = await runBulkPromoCodesForEngagement(session, engagementId, (block.input.codes ?? []) as PromoCodeSpec[], dryRun);
          ok = result.ok;
          message2 = result.ok ? result.message : result.error;
          if (result.ok && result.runId) links.push({ label: "View run", href: `/dashboard/runs/${result.runId}` });
        }
      } else if (block.name === "run_portfolio_rollup") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        if (!whopAgentInstalled) {
          message2 = "Whop Agent isn't installed in this workspace.";
        } else if (!engagementId) {
          message2 = "Missing engagementId.";
        } else {
          const result = await runPortfolioRollupForEngagement(session, engagementId);
          ok = result.ok;
          message2 = result.ok ? result.message : result.error;
          if (result.ok && result.runId) links.push({ label: "View run", href: `/dashboard/runs/${result.runId}` });
        }
      } else if (block.name === "run_weekly_ops_report") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        if (!whopAgentInstalled) {
          message2 = "Whop Agent isn't installed in this workspace.";
        } else if (!engagementId) {
          message2 = "Missing engagementId.";
        } else {
          const result = await runWeeklyOpsReportForEngagement(session, engagementId);
          ok = result.ok;
          message2 = result.ok ? result.message : result.error;
          if (result.ok && result.runId) links.push({ label: "View run", href: `/dashboard/runs/${result.runId}` });
        }
      } else if (block.name === "run_attribution_report") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        if (!whopAgentInstalled) {
          message2 = "Whop Agent isn't installed in this workspace.";
        } else if (!engagementId) {
          message2 = "Missing engagementId.";
        } else {
          const result = await runAttributionReportForEngagement(session, engagementId);
          ok = result.ok;
          message2 = result.ok ? result.message : result.error;
          if (result.ok && result.runId) links.push({ label: "View run", href: `/dashboard/runs/${result.runId}` });
        }
      } else if (block.name === "configure_whop_bridge") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        if (!whopAgentInstalled) {
          message2 = "Whop Agent isn't installed in this workspace.";
        } else if (!engagementId) {
          message2 = "Missing engagementId.";
        } else {
          const result = await configureWhopBridgeForEngagement(session, engagementId, typeof block.input.destinationUrl === "string" ? block.input.destinationUrl : "");
          ok = result.ok;
          message2 = result.ok ? result.message : result.error;
        }
      } else if (block.name === "configure_cancellation_save_offer") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        if (!whopAgentInstalled) {
          message2 = "Whop Agent isn't installed in this workspace.";
        } else if (!engagementId) {
          message2 = "Missing engagementId.";
        } else {
          const result = await configureCancellationSaveOfferForEngagement(session, engagementId, {
            discountPercentage: Number(block.input.discountPercentage),
            durationMonths: Number(block.input.durationMonths),
            message: typeof block.input.message === "string" ? block.input.message : "",
            minTenureDays: block.input.minTenureDays !== undefined ? Number(block.input.minTenureDays) : undefined,
            cooldownDays: block.input.cooldownDays !== undefined ? Number(block.input.cooldownDays) : undefined,
          });
          ok = result.ok;
          message2 = result.ok ? result.message : result.error;
        }
      } else if (block.name === "enable_cold_open_skill") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        if (!coldOpenInstalled) {
          message2 = "Cold Open isn't installed in this workspace.";
        } else if (!engagementId) {
          message2 = "Missing engagementId.";
        } else {
          const result = await enableColdOpenSkillForEngagement(
            session.whopUserId,
            activeWorkspace.workspaceId,
            engagementId,
            typeof block.input.skillId === "string" ? block.input.skillId : "",
            block.input.enabled === true
          );
          ok = result.ok;
          message2 = result.ok ? result.message : result.error;
        }
      } else if (block.name === "get_todays_calls") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        if (engagementId) {
          const rows = await getTodaysCalls(engagementId, activeWorkspace.workspaceId);
          ok = true;
          message2 =
            rows.length === 0
              ? "Nothing on the roster for today."
              : rows.map((r) => `${r.prospectName ?? r.prospectEmail ?? "Unknown"} at ${r.callTime.toLocaleTimeString()} (${r.status})`).join("; ");
        } else {
          message2 = "Missing engagementId.";
        }
      } else if (block.name === "get_recent_cancellations") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        if (engagementId) {
          const rows = await getRecentCancellations(engagementId, activeWorkspace.workspaceId);
          ok = true;
          message2 =
            rows.length === 0
              ? "No cancellations in the last week."
              : rows.map((r) => `${r.prospectName ?? r.prospectEmail ?? "Unknown"} was booked for ${r.callTime.toLocaleString()}`).join("; ");
        } else {
          message2 = "Missing engagementId.";
        }
      } else if (block.name === "get_run_history") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        const skillNameFilter = typeof block.input.skillName === "string" ? block.input.skillName : undefined;
        if (engagementId) {
          const rows = await getRunHistory(engagementId, activeWorkspace.workspaceId, skillNameFilter);
          ok = true;
          message2 =
            rows.length === 0
              ? "No runs yet for this client."
              : rows
                  .map((r) => `${r.skillName}: ${r.status}${r.errorMessage ? ` (${r.errorMessage})` : ""}, started ${r.startedAt.toLocaleString()}`)
                  .join("; ");
        } else {
          message2 = "Missing engagementId.";
        }
      } else if (block.name === "get_active_recoveries") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        if (engagementId) {
          const rows = await getActiveRecoveries(engagementId, activeWorkspace.workspaceId);
          ok = true;
          message2 =
            rows.length === 0
              ? "No one is currently in an active recovery cadence for this client."
              : rows.map((r) => `${r.prospectName ?? r.prospectEmail} enrolled ${r.enrolledAt.toLocaleDateString()}, ${r.recoveryWindowDays}-day window`).join("; ");
        } else {
          message2 = "Missing engagementId.";
        }
      } else if (block.name === "compare_leak_map_benchmarks") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        if (engagementId) {
          const result = await getLeakMapBenchmarkComparison(engagementId, activeWorkspace.workspaceId);
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
      } else if (block.name === "enable_pile_on") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        const smsPlatform = typeof block.input.smsPlatform === "string" ? block.input.smsPlatform : undefined;
        const adDataPlatform = typeof block.input.adDataPlatform === "string" ? block.input.adDataPlatform : undefined;
        if (engagementId) {
          const result = await enablePileOnForEngagement(session.whopUserId, activeWorkspace.workspaceId, engagementId, { smsPlatform, adDataPlatform });
          ok = result.ok;
          message2 = result.ok ? "Pile-On is now enabled for this client." : result.error;
          if (result.ok) {
            const buyer = clients.find((c) => c.engagementId === engagementId)?.buyer;
            links.push({ label: buyer ? `${buyer}'s page` : "Client page", href: `/dashboard/engagements/${engagementId}` });
          }
        } else {
          message2 = "Missing engagementId.";
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
      } else if (block.name === "rebuild_confirmation_page") {
        const engagementId = typeof block.input.engagementId === "string" ? block.input.engagementId : "";
        const heroVideoUrl = typeof block.input.heroVideoUrl === "string" ? block.input.heroVideoUrl : undefined;
        if (engagementId) {
          const result = await triggerConfirmationPageRebuildForEngagement(session.whopUserId, activeWorkspace.workspaceId, engagementId, heroVideoUrl);
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
            message2 = "This client doesn't have a booking platform connected yet. Nothing would actually run. Want to connect one first?";
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
