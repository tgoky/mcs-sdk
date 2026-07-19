import { inngest, bookingWebhookProcess } from "@/lib/inngest";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { eq } from "drizzle-orm";
import { handleInboundBookingEvent } from "@/features/pile-on/server/enrollment-service";
import { failRun } from "@/lib/run-log";

/**
 * Reliability fix — see the module comment on bookingWebhookProcess in
 * src/lib/inngest.ts for why this exists. booking-event/route.ts dispatches
 * this event instead of running handleInboundBookingEvent inline, so the
 * webhook response to Calendly/Cal.com/GHL/OnceHub is no longer gated on
 * ESP calls, ad-data cohort syncing, or (in hybrid mode) LLM-personalized
 * message generation.
 *
 * retries: 0 is deliberate, not an oversight. The idempotency key in
 * webhook_events already stops a *redelivered* webhook from reaching this
 * far — that's checked synchronously in the route, before this event is
 * ever sent. The only remaining retry vector at this point would be
 * Inngest's own internal retry of this function after a failure, and
 * handleInboundBookingEvent's side effects (ESP enrollment, hybrid
 * personalized sends) are not individually idempotency-keyed the way the
 * webhook delivery itself is — a function-level retry could re-enroll or
 * double-send. handleInboundBookingEvent already catches and logs its own
 * per-phase failures internally (ad-data cohort sync, hybrid personalization
 * fallback, etc. all fail soft), so a *thrown* error reaching this function
 * is already an unusual case; failing the run visibly and letting the
 * operator see it in the dashboard is safer here than a silent automatic
 * retry that might double-fire a side effect on a real booking platform.
 */
export const processBookingWebhookEvent = inngest.createFunction(
  { id: "process-booking-webhook-event", retries: 0, triggers: [bookingWebhookProcess] },
  async ({ event, step }) => {
    const { runId, engagementId, eventKind, bookingPayload } = event.data;

    const tenant = await step.run("load-tenant", async () => {
      const [row] = await db.select().from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
      return row ?? null;
    });

    if (!tenant) {
      // Engagement was deleted between the webhook arriving and this worker
      // picking it up — nothing to enroll. Not worth failing the run over.
      return { processed: false, reason: "engagement not found" };
    }

    try {
      await step.run("handle-inbound-booking-event", async () => {
        await handleInboundBookingEvent(bookingPayload, tenant, runId, eventKind);
      });
      return { processed: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await failRun(runId, err, {
        summary: {
          whatWasAttempted: ["Process inbound booking webhook event (async worker)."],
          whatWorked: [],
          whatFailed: [message],
          openItems: [
            "This booking event was not enrolled in any sequence — check the payload shape against the configured booking platform.",
          ],
          decisionsMade: [],
        },
      }).catch(() => {});
      // Deliberately not re-thrown: retries: 0 means Inngest wouldn't retry
      // anyway, and re-throwing only pollutes the Inngest dashboard with a
      // "failed" function run on top of the failed skill run we've already
      // recorded — the skill run is the source of truth the operator sees.
      return { processed: false, reason: message };
    }
  }
);
