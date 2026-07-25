import { inngest, bookingWebhookProcess } from "@/lib/inngest";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { eq } from "drizzle-orm";
import { handleInboundBookingEvent } from "@/features/pile-on/server/enrollment-service";
import { failRun, logStep, finishRun } from "@/lib/run-log";
import { isSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { SKILL_REGISTRY } from "@/lib/skill-registry";

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
 *
 * Reliability fix: `step` is now passed straight into
 * handleInboundBookingEvent instead of wrapping the whole call in one
 * step.run("handle-inbound-booking-event"). That single-step shape decoupled
 * this work from Calendly's ack deadline (the original problem) but was
 * still exactly the "one giant step, no checkpoint until the whole thing
 * finishes" pattern flagged everywhere else in this codebase (see the
 * module comment at the top of crons.ts) — every ESP call, the win-back
 * exit-signal transaction, the CRM tagger, cohort sync, and hybrid LLM
 * personalization all ran as one uncheckpointed unit, competing for the
 * same maxDuration=60s budget on /api/inngest with zero partial-progress
 * recovery. handleInboundBookingEvent now takes its own `run` wrapper
 * (same convention as onboarding-service.ts / recovery-service.ts /
 * audit-engine.ts) and gives each phase its own named step.
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

    // Matches the skillName booking-event/route.ts already used to start
    // this run: a cancellation exits/enrolls into Win-Back, anything else
    // is a Pile-On enrollment. Neither goes through the generic
    // skill/run.execute dispatcher (see src/inngest/skill.ts), so the
    // per-engagement enablement check has to live here instead.
    const skillId = eventKind === "cancelled" ? "win-back" : "pile-on";
    const enabled = await step.run("check-skill-enabled", () => isSkillEnabledForEngagement(engagementId, skillId));

    if (!enabled) {
      await logStep(runId, {
        phase: "skill_disabled",
        status: "skipped",
        detail: `${SKILL_REGISTRY[skillId].name} is turned off for this engagement — this booking event was not enrolled.`,
      });
      await finishRun(runId);
      return { processed: false, reason: "skill disabled for this engagement" };
    }

    try {
      await handleInboundBookingEvent(bookingPayload, tenant, runId, eventKind, step);
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
