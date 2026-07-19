import { Inngest, eventType, staticSchema } from "inngest";

// ── Strict Event Payload Schema ─────────────────────────────────────────────
// v4 dropped the centralized EventSchemas class — typed events are now
// declared with eventType() + staticSchema() and reused across send/trigger.
// IMPORTANT: only engagementId is required here. We deliberately stopped
// shipping the full tenant row over the wire (see worker) — Inngest Cloud
// stores event payloads, and the engagement's `stack` jsonb carries
// slack_webhook_url / webhook_signing_secret in plaintext. The worker
// re-fetches the tenant row itself instead.
export type SkillRunExecuteData = {
  runId: string;
  engagementId: string;
  skillName: "pin-down" | "pile-on" | "pre-call-read" | "win-back" | "leak-map";
  auditType?: "weekly" | "monthly";
};

export const skillRunExecute = eventType("skill/run.execute", {
  schema: staticSchema<SkillRunExecuteData>(),
});

// Sent from the "Cancel run" button on the run-detail page. Only carries the
// runId — cancelOn matching only needs this one field, and there's no reason
// to ship anything else into Inngest Cloud's event log for a cancellation.
export type SkillRunCancelData = {
  runId: string;
};

export const skillRunCancel = eventType("skill/run.cancel", {
  schema: staticSchema<SkillRunCancelData>(),
});

// ── Maintenance-cron fan-out events ─────────────────────────────────────
// Added to fix a real architectural bug: credentialHealthCron,
// lostDealSweepCron, and weeklyMetricsCron each originally wrapped an
// entire multi-tenant loop (with real external API calls per tenant/
// credential) inside ONE step.run(). Inngest's checkpointing only yields
// back to reschedule a continuation AT a step boundary — with only one
// step, there's no boundary to checkpoint at until the whole loop
// finishes, so none of the "survives serverless timeouts" benefit Inngest
// is supposed to provide was actually happening. These events let each
// cron do its DB-only prep in one cheap step, then fan out — same
// nightlyBriefsCron/weeklyLeakMapCron pattern already established above.

export type CredentialHealthCheckSingleData = {
  credentialId: string;
};
export const credentialHealthCheckSingle = eventType("credential-health/check-single", {
  schema: staticSchema<CredentialHealthCheckSingleData>(),
});

export type LostDealSweepEngagementData = {
  engagementId: string;
  enrollmentIds: string[];
};
export const lostDealSweepEngagement = eventType("win-back/lost-deal-sweep-engagement", {
  schema: staticSchema<LostDealSweepEngagementData>(),
});

// Pre-Call Read recovery gap — per-prospect fan-out for a single tenant's
// nightly/dynamic roster. Only engagementId + the one call are shipped
// over the wire, same reasoning as skillRunExecute above: the worker
// re-fetches the tenant row (and its stack jsonb, which carries
// slack_webhook_url / webhook_signing_secret in plaintext) itself rather
// than trusting a payload Inngest Cloud stores. callTime crosses this
// boundary as an ISO string (Inngest JSON-serializes step.invoke data),
// not a Date — the worker re-normalizes it, same pattern
// executeSkillRun already uses for tenant.createdAt/updatedAt.
export type ProspectBriefDispatchData = {
  runId: string;
  engagementId: string;
  call: {
    id: string;
    name: string;
    email: string;
    company: string;
    callTime: string;
    phone?: string;
    linkedInUrl?: string;
  };
};
export const prospectBriefDispatch = eventType("pre-call-read/prospect-brief.dispatch", {
  schema: staticSchema<ProspectBriefDispatchData>(),
});

export type WeeklyMetricsEngagementData = {
  engagementId: string;
};
export const weeklyMetricsEngagement = eventType("pile-on/weekly-metrics-engagement", {
  schema: staticSchema<WeeklyMetricsEngagementData>(),
});

// Pin-Down recovery gap 5 — polling fallback for booking platforms without
// (or not configured for) webhooks. Same fan-out shape as the crons
// above: bookingPollCron does a cheap DB-only scan for engagements due for
// their next poll cycle, then dispatches one of these per engagement so a
// single slow/failing booking API call can't block the rest. See
// src/features/pin-down/server/booking-poller.ts.
export type BookingPollEngagementData = {
  engagementId: string;
};
export const bookingPollEngagement = eventType("pin-down/booking-poll-engagement", {
  schema: staticSchema<BookingPollEngagementData>(),
});

// Pile-On recovery gap 1 — durable multi-message SMS sequence for the
// direct-send platforms (Twilio, GHL SMS). Only prospect identifiers ship
// here, not credentials — same secret-hygiene principle as
// skillRunExecute's re-fetch-in-worker pattern above. The worker
// (src/inngest/pile-on-sms.ts) re-resolves the tenant's SMS credential via
// resolveCredential() itself.
//
// FIXED: Added absolute lifecycle anchors to allow the consumer loop to rebuild
// a chronological timeline instead of breaking on backward relative minute deltas.
export type PileOnSmsSequenceStartData = {
  engagementId: string;
  bookingId: string;
  prospectEmail: string;
  prospectPhone: string;
  prospectName: string;
  bookingCreatedAt: string; // ISO String anchor
  callTime: string;         // ISO String anchor
};

export const pileOnSmsSequenceStart = eventType("pile-on/sms-sequence-start", {
  schema: staticSchema<PileOnSmsSequenceStartData>(),
});

// Win-Back recovery gap 2 — durable multi-message SMS sequence for the
// recovery cadence's direct-send platforms (Twilio, GHL SMS). Separate
// from pileOnSmsSequenceStart because Win-Back's SMS content lives in a
// different asset map with day-scale offsets — see
// src/inngest/win-back-sms.ts.
export type WinBackSmsSequenceStartData = {
  engagementId: string;
  enrollmentId: string;
  prospectEmail: string;
  prospectPhone: string;
  prospectName: string;
};
export const winBackSmsSequenceStart = eventType("win-back/sms-sequence-start", {
  schema: staticSchema<WinBackSmsSequenceStartData>(),
});

// SMTP connector — direct-send win-back email channel. Unlike the four ESP
// email_platform options (Klaviyo/HubSpot/ActiveCampaign/GHL — and now
// Mailchimp/ConvertKit), SMTP has no list/flow to enroll a prospect into,
// so this app owns the send schedule itself, the same way it already does
// for Twilio/GHL SMS above. See src/inngest/win-back-email-smtp.ts.
export type WinBackEmailSmtpSequenceStartData = {
  engagementId: string;
  enrollmentId: string;
  prospectEmail: string;
  prospectName: string;
};
export const winBackEmailSmtpSequenceStart = eventType("win-back/email-smtp-sequence-start", {
  schema: staticSchema<WinBackEmailSmtpSequenceStartData>(),
});

// Pre-Call Read recovery gap 1 — dynamic brief trigger. Same fan-out shape
// as bookingPollEngagement above: dynamicBriefCron does a cheap DB-only
// scan for engagements with stack.brief_trigger_type === "dynamic_webhook",
// then dispatches one of these per engagement so a single tenant's
// booking-platform API call can't block the others. See
// src/features/pre-call-read/server/brief-service.ts's triggerMode param.
export type DynamicBriefEngagementData = {
  engagementId: string;
};
export const dynamicBriefEngagement = eventType("pre-call-read/dynamic-brief-engagement", {
  schema: staticSchema<DynamicBriefEngagementData>(),
});

export type StaleRunNotifyData = {
  runId: string;
  engagementId: string;
  skillName: string;
};
export const staleRunNotify = eventType("skill/run.notify-timeout", {
  schema: staticSchema<StaleRunNotifyData>(),
});

// Win-Back recovery gap 6 — reply detection as a recovery exit signal.
// Fired by both the native (HubSpot Conversations) and forwarding
// (Postmark/SendGrid inbound-parse) paths in
// src/app/api/webhooks/inbound-reply/route.ts, handled by
// processInboundReply in crons.ts, which halts the matching active
// win-back enrollment.
export type InboundReplyReceivedData = {
  engagementId: string;
  fromEmail: string;
  subject: string | null;
  textBody: string | null;
  source: "native" | "forwarding";
};
export const inboundReplyReceived = eventType("win-back/inbound-reply-received", {
  schema: staticSchema<InboundReplyReceivedData>(),
});

/**
 * Global Inngest Client
 * Used by API routes to publish events, and by workers to handle jobs.
 *
 * checkpointing.maxRuntime: v4 enables checkpointing by default, which lets
 * multiple step.run() calls execute within a single HTTP request to
 * /api/inngest for low latency. On Vercel that request is still bound by
 * the function's maxDuration — once maxRuntime is hit, the SDK yields back
 * to Inngest, which schedules a fresh HTTP call to continue from the next
 * step. Set this comfortably below whatever maxDuration you configure on
 * the /api/inngest route (see src/app/api/inngest/route.ts).
 */
// ── Cross-cutting recovery gap 17: human-only-blocker resume ───────────────
// One shared event for every blocker resolution, filtered by blockerId at
// the step.waitForEvent() call site rather than one event type per
// blockerType — see human-blockers.ts's waitForBlockerResolution.
export type HumanBlockerResolvedData = {
  blockerId: string;
  resumePayload?: Record<string, unknown>;
};
export const humanBlockerResolved = eventType("human-blocker/resolved", {
  schema: staticSchema<HumanBlockerResolvedData>(),
});

// ── Tier 4 #28: synthetic canary tenant ─────────────────────────────────────
// Same cheap-prep-step-then-fan-out shape as credentialHealthCheckSingle
// above — one real network call per invocation, isolated so one dead
// platform's check can't block or slow the others.
export type CanaryCheckSingleData = {
  platform: string;
  adapterMethod: string;
};
export const canaryCheckSingle = eventType("canary/check-single", {
  schema: staticSchema<CanaryCheckSingleData>(),
});

// ── Tier 4 #24: conversation intelligence (Recall.ai) ───────────────────────
// Dispatched from the Recall.ai bot-status webhook handler when a bot's
// transcript is ready (transcript.done), never from a cron — transcript
// processing is inherently event-driven, not scheduled.
export type ConversationIntelligenceProcessData = {
  engagementId: string;
  sessionId: string; // conversationIntelligenceSessions.id
};
export const conversationIntelligenceProcess = eventType("conversation-intelligence/process-transcript", {
  schema: staticSchema<ConversationIntelligenceProcessData>(),
});

// ── Reliability fix: booking-event webhook off the request thread ───────────
// booking-event/route.ts used to `await handleInboundBookingEvent(...)`
// directly inside the HTTP handler — meaning the ESP enrollment call, the
// ad-data cohort sync, and (in hybrid mode) the personalized first-message
// generation all had to complete before the response could be sent back to
// Calendly/Cal.com/GHL. Calendly's own webhook ack deadline is ~10s; a slow
// ESP response could blow through that even with fetchWithTimeout's 15s
// ceiling, risking a platform-side "delivery failed" mark and a real chance
// of Vercel's own maxDuration killing the invocation mid-flight.
//
// The route now does only fast, DB-only work (signature verify, idempotency
// insert, rate-limit check, startRun) and dispatches this event instead of
// awaiting the work itself — same pattern already used for pin-down's
// discovery-prefill and every cron's per-tenant fan-out. Calendly gets its
// 200 back in single-digit milliseconds once the DB round-trips finish;
// everything with real external-network risk happens in the worker,
// completely decoupled from any platform's ack deadline.
//
// Only the booking payload + routing fields cross the wire, not credentials
// — the worker re-fetches the tenant row (and decrypts what it needs) fresh,
// same re-fetch-don't-trust-the-event-payload principle as skillRunExecute.
export type BookingWebhookProcessData = {
  runId: string;
  engagementId: string;
  eventKind: "created" | "cancelled" | "unknown";
  bookingPayload: unknown;
};
export const bookingWebhookProcess = eventType("pile-on/booking-webhook-process", {
  schema: staticSchema<BookingWebhookProcessData>(),
});

export const inngest = new Inngest({
  id: "showtime-revenue-infrastructure", // App name identifier inside the dashboard
  checkpointing: {
    maxRuntime: "45s", // keep below maxDuration=60 set on the inngest route
  },
});