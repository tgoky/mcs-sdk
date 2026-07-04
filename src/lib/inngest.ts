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

