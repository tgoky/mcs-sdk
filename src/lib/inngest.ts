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

export type StaleRunNotifyData = {
  runId: string;
  engagementId: string;
  skillName: string;
};
export const staleRunNotify = eventType("skill/run.notify-timeout", {
  schema: staticSchema<StaleRunNotifyData>(),
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
export const inngest = new Inngest({
  id: "showtime-revenue-infrastructure", // App name identifier inside the dashboard
  checkpointing: {
    maxRuntime: "45s", // keep below maxDuration=60 set on the inngest route
  },
});