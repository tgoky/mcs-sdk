// src/inngest/whop-agent.ts
//
// Async half of Whop Agent's inbound webhook handling — see the module
// comment on whopWebhookProcess in src/lib/inngest.ts for why this is
// split from the route's synchronous ack path.
import crypto from "crypto";
import { inngest, whopWebhookProcess, whopReceiverHealthSweepSingle, whopVelocityReconciliationSingle, whopBridgeDeliver, whopAdsDraftProcess, whopBulkPromoCodesProcess, skillRunExecute } from "@/lib/inngest";
import { markWebhookDeliveryReceived } from "@/features/whop-agent/server/webhook-subscription-service";
import { recordWhopChangeLedgerEntry, isUpdatedShapedEvent } from "@/features/whop-agent/server/webhook-envelope-service";
import { sweepReceiverHealth, listConnectedEngagementIds } from "@/features/whop-agent/server/receiver-health-service";
import { handleCancellationIntentEvent } from "@/features/whop-agent/server/cancellation-save-offer-service";
import { reconcileRefundDisputeVelocity } from "@/features/whop-agent/server/refund-dispute-velocity-service";
import { sendDailyDigest, listEngagementsForDailyDigest } from "@/features/whop-agent/server/daily-change-digest-service";
import { dispatchDriftMonitorRun } from "@/features/whop-agent/server/drift-monitor-service";
import { assembleDisputeResponse, type WhopDisputeAlert } from "@/features/whop-agent/server/dispute-response-service";
import { getBridgeConfig, attemptBridgeDelivery, notifyBridgeDeadLetter } from "@/features/whop-agent/server/bridge-manager-service";
import { runWhopAdsDraft } from "@/features/whop-agent/server/whop-ads-service";
import { runBatchLive } from "@/features/whop-agent/server/bulk-promo-codes-service";
import { getDisabledEngagementIdsForSkill, isSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { db } from "@/lib/db";
import { engagements, whopPayments, type EngagementStack } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { scheduleReviewRequest } from "@/features/reputation-manager/server/review-requests";
import { startRun } from "@/lib/run-log";
import { PAYMENT_EVENT_TYPES, recordWhopPaymentEvent } from "@/lib/whop-payments";
import { handlePaymentFailed } from "@/features/whop-agent/server/payment-recovery-service";

/**
 * Section 7.7's handler discipline applies here exactly as it does for
 * every other webhook handler in this app: this function logs, analyzes,
 * or stages a proposal — it never writes back to Whop directly off an
 * event. Any skill that needs to react to a specific event type (the
 * Cancellation Save-Offer's membership.cancel_at_period_end_changed
 * branch, Dispute Response's dispute_alert.created trigger, etc.) hooks in
 * below as that skill is built — this function is the single dispatch
 * point every webhook-driven skill shares, not a copy each skill
 * maintains on its own.
 */
export const processWhopWebhookEvent = inngest.createFunction(
  { id: "process-whop-agent-webhook-event", retries: 3, triggers: [whopWebhookProcess] },
  async ({ event, step }) => {
    const { engagementId, whopWebhookId, envelope, occurredAtIso, replay } = event.data;

    await step.run("mark-delivery-received", () => markWebhookDeliveryReceived(engagementId, whopWebhookId));

    // Every payment, refund and dispute lands on the buyer's record,
    // whichever workers are on (lib/whop-payments.ts).
    const payment = PAYMENT_EVENT_TYPES.has(envelope.type)
      ? await step.run("record-payment", () => recordWhopPaymentEvent(engagementId, envelope.type, envelope.data, new Date(occurredAtIso)))
      : null;

    // Reputation: ask a new buyer for a review (once per payment; everyone, no filtering).
    if (envelope.type === "payment.succeeded" && payment?.outcome === "paid") {
      await step.run("schedule-review-request", async () => {
        const [row] = await db.select({ email: whopPayments.email, phone: whopPayments.phone, name: whopPayments.buyerName }).from(whopPayments).where(and(eq(whopPayments.engagementId, engagementId), eq(whopPayments.paymentId, payment.paymentId))).limit(1);
        if (row) await scheduleReviewRequest(engagementId, { trigger: "paid", refId: payment.paymentId, name: row.name, email: row.email, phone: row.phone });
      });
    }

    // A failed payment: draft the buyer a message with the link to fix it,
    // for approval. Only for the payment's current state, so a late
    // "failed" delivery for a payment that has since gone through is ignored.
    if (envelope.type === "payment.failed" && payment?.outcome === "failed") {
      await step.run("handle-payment-failed", async () => {
        if (!(await isSkillEnabledForEngagement(engagementId, "whop-payment-recovery"))) return;
        await handlePaymentFailed(engagementId, payment.paymentId);
      });
    }

    if (isUpdatedShapedEvent(envelope.type)) {
      await step.run("record-change-ledger-entry", () =>
        recordWhopChangeLedgerEntry(engagementId, envelope, new Date(occurredAtIso))
      );
    }

    // Playbook 5.6's step 2 — only when the skill is on and the operator
    // has actually set a discount/duration/message (Section 8.3: never
    // propose with a guessed offer).
    if (envelope.type === "membership.cancel_at_period_end_changed") {
      await step.run("handle-cancellation-intent", async () => {
        const enabled = await isSkillEnabledForEngagement(engagementId, "whop-cancellation-save-offer");
        if (!enabled) return;
        const [tenant] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
        const stack = tenant?.stack as EngagementStack | null;
        if (!stack?.whop_save_offer_discount_percentage || !stack?.whop_save_offer_duration_months || !stack?.whop_save_offer_message) return;
        await handleCancellationIntentEvent(engagementId, envelope, {
          discountPercentage: stack.whop_save_offer_discount_percentage,
          offerDurationMonths: stack.whop_save_offer_duration_months,
          offerMessage: stack.whop_save_offer_message,
          minTenureDays: stack.whop_save_offer_min_tenure_days,
          cooldownDays: stack.whop_save_offer_cooldown_days,
        });
      });
    }

    // Playbook 5.12 — live routing. Fire-and-forget dispatch to the
    // durable delivery function; this step itself stays fast (one
    // config lookup + one event send), never the delivery attempt itself.
    await step.run("dispatch-bridge-delivery", async () => {
      const enabled = await isSkillEnabledForEngagement(engagementId, "whop-bridge-manager");
      if (!enabled) return;
      const config = await getBridgeConfig(engagementId);
      if (!config) return;
      await inngest.send(whopBridgeDeliver.create({ engagementId, envelope, replay: replay ?? false }));
    });

    // Playbook 5.10 — dispute_alert.created is the primary (pre-chargeback)
    // trigger; dispute.created is the secondary path for disputes that
    // arrive without a preceding alert.
    if (envelope.type === "dispute_alert.created" || envelope.type === "dispute.created") {
      await step.run("handle-dispute-trigger", async () => {
        const enabled = await isSkillEnabledForEngagement(engagementId, "whop-dispute-response");
        if (!enabled) return;
        const disputeId = (envelope.data?.dispute_id as string | undefined) ?? (envelope.data?.id as string | undefined);
        if (!disputeId) return;
        const alert = envelope.type === "dispute_alert.created" ? (envelope.data as unknown as WhopDisputeAlert) : null;
        await assembleDisputeResponse(engagementId, disputeId, alert);
      });
    }
  }
);

/**
 * Section 7.4's health sweep. Runs every 4 hours for every connected
 * engagement regardless of which Whop Agent skills are enabled — cadence
 * rationale in receiver-health-service.ts's own module comment (at least
 * 12 sweeps inside the 72h auto-disable window).
 */
export const whopReceiverHealthSweepCron = inngest.createFunction(
  { id: "whop-agent-receiver-health-sweep", triggers: [{ cron: "0 */4 * * *" }], retries: 1 },
  async ({ step }) => {
    const engagementIds = await step.run("list-connected-engagements", () => listConnectedEngagementIds());

    if (engagementIds.length > 0) {
      await step.sendEvent(
        "dispatch-receiver-health-sweeps",
        engagementIds.map((engagementId) => whopReceiverHealthSweepSingle.create({ engagementId }))
      );
    }

    return { dispatched: engagementIds.length };
  }
);

/** Fanned-out handler: one engagement's audit + tier evaluation per
 * invocation, isolated so one connection's failure can't block the rest. */
export const whopReceiverHealthSweepSingleCron = inngest.createFunction(
  { id: "whop-agent-receiver-health-sweep-single", triggers: [whopReceiverHealthSweepSingle], retries: 1 },
  async ({ event }) => {
    await sweepReceiverHealth(event.data.engagementId);
  }
);

/**
 * Section 9.8: "Weekly default for single-account, portfolio, and
 * attribution reports, staggered on different days." Weekly Ops Report on
 * Monday, Portfolio Rollup on Wednesday (Section 5.5: "a different day
 * than the Weekly Ops Report to avoid duplicate destination noise").
 * Dispatch is broad (every connected engagement); the generic
 * executeSkillRun dispatcher already skips an engagement where the
 * specific skill is disabled, so no separate enablement check is needed
 * here — same pattern every other scheduled skill dispatch in this app
 * follows.
 */
/** Section 5.14: "Scheduled, default weekly alongside the Weekly Ops
 * Report" — dispatched from the same Monday cron rather than a second
 * near-identical cron function. */
export const whopWeeklyOpsReportCron = inngest.createFunction(
  { id: "whop-agent-weekly-ops-report-cron", triggers: [{ cron: "TZ=UTC 0 14 * * 1" }], retries: 1 },
  async ({ step }) => {
    const engagementIds = await step.run("list-connected-engagements", () => listConnectedEngagementIds());

    // Ghost-run fix: filter out explicit disables BEFORE startRun, same as
    // every other cron (see getDisabledEngagementIdsForSkill's comment) —
    // a switched-off report should never appear in live executions.
    const [opsDisabled, attributionDisabled] = await step.run("load-disabled", async () => [
      [...(await getDisabledEngagementIdsForSkill("whop-weekly-ops-report"))],
      [...(await getDisabledEngagementIdsForSkill("whop-attribution-report"))],
    ]);

    const opsReportRuns = await step.run("start-ops-report-runs", () =>
      Promise.all(
        engagementIds.filter((id) => !opsDisabled.includes(id)).map(async (engagementId) => {
          const runId = crypto.randomUUID();
          await startRun({ id: runId, engagementId, skillName: "whop-weekly-ops-report", phase: "metric_netRevenue", label: "Weekly Ops Report" });
          return { runId, engagementId };
        })
      )
    );

    const attributionRuns = await step.run("start-attribution-report-runs", () =>
      Promise.all(
        engagementIds.filter((id) => !attributionDisabled.includes(id)).map(async (engagementId) => {
          const runId = crypto.randomUUID();
          await startRun({ id: runId, engagementId, skillName: "whop-attribution-report", phase: "v2_memberships_paginate", label: "Attribution & Affiliate Report" });
          return { runId, engagementId };
        })
      )
    );

    const events = [
      ...opsReportRuns.map(({ runId, engagementId }) => skillRunExecute.create({ runId, engagementId, skillName: "whop-weekly-ops-report" })),
      ...attributionRuns.map(({ runId, engagementId }) => skillRunExecute.create({ runId, engagementId, skillName: "whop-attribution-report" })),
    ];
    if (events.length > 0) {
      await step.sendEvent("dispatch-weekly-ops-and-attribution-reports", events);
    }
    return { dispatched: events.length };
  }
);

/**
 * Section 5.7's reconciliation cadence: "Reconciliation on a 4-hour
 * default cadence. Shorter than a day so a silent webhook gap closes
 * within an operator's decision window; longer than an hour to keep read
 * budget reasonable."
 */
export const whopVelocityReconciliationCron = inngest.createFunction(
  { id: "whop-agent-velocity-reconciliation-cron", triggers: [{ cron: "0 */4 * * *" }], retries: 1 },
  async ({ step }) => {
    const engagementIds = await step.run("list-connected-engagements", () => listConnectedEngagementIds());
    if (engagementIds.length > 0) {
      await step.sendEvent(
        "dispatch-velocity-reconciliations",
        engagementIds.map((engagementId) => whopVelocityReconciliationSingle.create({ engagementId }))
      );
    }
    return { dispatched: engagementIds.length };
  }
);

export const whopVelocityReconciliationSingleCron = inngest.createFunction(
  { id: "whop-agent-velocity-reconciliation-single", triggers: [whopVelocityReconciliationSingle], retries: 1 },
  async ({ event }) => {
    await reconcileRefundDisputeVelocity(event.data.engagementId);
  }
);

export const whopPortfolioRollupCron = inngest.createFunction(
  { id: "whop-agent-portfolio-rollup-cron", triggers: [{ cron: "TZ=UTC 0 14 * * 3" }], retries: 1 },
  async ({ step }) => {
    const engagementIds = await step.run("list-connected-engagements", () => listConnectedEngagementIds());
    const disabled = await step.run("load-disabled", async () => [...(await getDisabledEngagementIdsForSkill("whop-portfolio-rollup"))]);
    const runIds = await step.run("start-runs", () =>
      Promise.all(
        engagementIds.filter((id) => !disabled.includes(id)).map(async (engagementId) => {
          const runId = crypto.randomUUID();
          await startRun({ id: runId, engagementId, skillName: "whop-portfolio-rollup", phase: "fan_out", label: "Portfolio Rollup Report" });
          return { runId, engagementId };
        })
      )
    );
    if (runIds.length > 0) {
      await step.sendEvent(
        "dispatch-portfolio-rollups",
        runIds.map(({ runId, engagementId }) => skillRunExecute.create({ runId, engagementId, skillName: "whop-portfolio-rollup" }))
      );
    }
    return { dispatched: runIds.length };
  }
);

/** Section 5.13: "Scheduled digest delivery, default daily." Notification-
 * only, not a skillRuns-tracked execution — sendDailyDigest itself checks
 * whether the skill is enabled per engagement. */
export const whopDailyChangeDigestCron = inngest.createFunction(
  { id: "whop-agent-daily-change-digest-cron", triggers: [{ cron: "TZ=UTC 0 13 * * *" }], retries: 1 },
  async ({ step }) => {
    const engagementIds = await step.run("list-connected-engagements", () => listEngagementsForDailyDigest());
    await step.run("send-digests", () => Promise.all(engagementIds.map((id) => sendDailyDigest(id).catch((e) => console.error(`[whop-agent digest] failed for ${id}:`, e)))));
    return { checked: engagementIds.length };
  }
);

/** Section 5.3: "Scheduled, default weekly ... relaxed from v2's daily,
 * because the monitored surface is now six resources rather than
 * everything." */
/**
 * Playbook 5.12's corrected retry policy (Section 7.3): 6 attempts at 1m,
 * 5m, 20m, 1h, 4h, 12h — spanning ~17h, comfortably inside Whop's own 71h
 * redelivery window so this bridge finishes retrying before Whop stops,
 * and bounded so a permanently broken destination surfaces within an
 * operator's working day. Each attempt is its own step.run so Inngest
 * checkpoints between them; step.sleep durably parks the function between
 * attempts without holding compute.
 */
const BRIDGE_RETRY_DELAYS = ["1m", "5m", "20m", "1h", "4h", "12h"];

export const deliverToBridge = inngest.createFunction(
  { id: "whop-agent-deliver-to-bridge", triggers: [whopBridgeDeliver], retries: 0 },
  async ({ event, step }) => {
    const { engagementId, envelope, replay } = event.data;
    const config = await step.run("load-bridge-config", () => getBridgeConfig(engagementId));
    if (!config) return { skipped: "no bridge configured" };

    for (let attempt = 0; attempt < BRIDGE_RETRY_DELAYS.length; attempt++) {
      if (attempt > 0) {
        await step.sleep(`wait-before-attempt-${attempt}`, BRIDGE_RETRY_DELAYS[attempt]);
      }
      const result = await step.run(`deliver-attempt-${attempt}`, () => attemptBridgeDelivery(engagementId, config, envelope, replay ?? false));
      if (result.ok) {
        return { delivered: true, attempt };
      }
    }

    // Section 5.12 guardrail: "Dead-letter after max retries. Retrying
    // indefinitely against a broken destination burns budget for no
    // benefit."
    await step.run("notify-dead-letter", () => notifyBridgeDeadLetter(engagementId, envelope.type, config.destinationUrl));
    return { delivered: false, deadLettered: true };
  }
);

/** Playbook 5.11's own executor — see runWhopAdsDraft's own doc comment
 * for why this dispatches through Inngest rather than a synchronous route. */
export const processWhopAdsDraft = inngest.createFunction(
  { id: "whop-agent-process-ads-draft", triggers: [whopAdsDraftProcess], retries: 0 },
  async ({ event, step }) => {
    const { runId, engagementId, input } = event.data;
    await runWhopAdsDraft(engagementId, runId, input, step);
  }
);

/** Playbook 5.8's own executor — see runBatchLive's own doc comment for why
 * this dispatches through Inngest rather than a synchronous route/executor.
 * Unlike deliverToBridge/processWhopAdsDraft's retries: 0 (those guard
 * side effects that aren't individually idempotency-keyed), every write
 * here carries its own `whop-promo-batch:${runId}:${i}` idempotency key, so
 * a whole-function retry after an unexpected crash (a DB blip in
 * finishRun, say) can't double-create a code — it can only re-run already-
 * memoized steps for free and continue past whatever the crash caught
 * mid-batch. retries: 1 gets that one free recovery instead of leaving a
 * crashed batch stuck exactly where it died. */
export const processBulkPromoCodesBatch = inngest.createFunction(
  { id: "whop-agent-process-bulk-promo-codes", triggers: [whopBulkPromoCodesProcess], retries: 1 },
  async ({ event, step }) => {
    const { runId, engagementId, specs } = event.data;
    await runBatchLive(engagementId, runId, specs, step);
  }
);

export const whopDriftMonitorCron = inngest.createFunction(
  { id: "whop-agent-drift-monitor-cron", triggers: [{ cron: "TZ=UTC 0 9 * * 1" }], retries: 1 },
  async ({ step }) => {
    const engagementIds = await step.run("list-connected-engagements", () => listConnectedEngagementIds());
    const enabledIds = await step.run("filter-enabled", () =>
      Promise.all(engagementIds.map(async (id) => ((await isSkillEnabledForEngagement(id, "whop-drift-monitor")) ? id : null))).then((ids) => ids.filter((id): id is string => id !== null))
    );
    await step.run("run-drift-checks", () => Promise.all(enabledIds.map((id) => dispatchDriftMonitorRun(id).catch((e) => console.error(`[whop-agent drift-monitor] failed for ${id}:`, e)))));
    return { checked: enabledIds.length };
  }
);
