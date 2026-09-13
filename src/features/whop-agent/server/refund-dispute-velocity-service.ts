// src/features/whop-agent/server/refund-dispute-velocity-service.ts
//
// Playbook 5.7 — implemented as the scheduled reconciliation path (Section
// 5.7's own trigger list names both a webhook-driven fast path and
// "backed by scheduled reconciliation"; the fail-open table treats
// reconciliation as a fully legitimate primary path in its own right —
// "Reconciliation catches it on the next 4-hour cycle" — not a fallback
// bolted onto a missing webhook handler). The live webhook counters for
// refund.*/dispute.*/dispute_alert.created are not wired — flagged here,
// not silently assumed, since building an accurate rolling per-product
// counter off individual events is real additional work distinct from
// this reconciliation pass.
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { notifyUser } from "@/lib/notify";
import { alertFiredWithinCooldown, recordAlertFired } from "@/lib/whop-agent/alert-cooldown";
import { WhopAgentClient } from "@/lib/whop-agent/client";
import { listConnectedEngagementIds } from "./receiver-health-service";
import { isSkillEnabledForEngagement } from "@/lib/engagement-skills";

const REFUND_RATE_THRESHOLD = 0.08; // 8% over a rolling 7-day window per product
const DISPUTE_ALERT_THRESHOLD = 3; // per product per rolling 7-day window
const MIN_SAMPLE_SIZE = 10; // payments in the rolling window
const RECONCILIATION_COOLDOWN_HOURS = 4;

function latestValue(response: { data: Array<[string, ...(number | string)[]]> } | null): number | null {
  if (!response?.data?.length) return null;
  const value = response.data[response.data.length - 1][1];
  return typeof value === "number" ? value : Number(value);
}

async function alertOperator(engagementId: string, title: string, body: string, severity: "warning" | "critical"): Promise<void> {
  const [tenant] = await db
    .select({ whopUserId: engagements.whopUserId, workspaceId: engagements.workspaceId, stack: engagements.stack })
    .from(engagements)
    .where(eq(engagements.engagementId, engagementId))
    .limit(1);
  if (!tenant) return;
  await notifyUser({
    whopUserId: tenant.whopUserId,
    engagementId,
    type: "whop_webhook_health", // Reuses the same alert-delivery type as receiver health — both are "something on your connected Whop needs attention now," not two different notification shapes an inbox has to distinguish.
    severity,
    title,
    body,
    slackWebhookUrl: (tenant.stack as EngagementStack | null)?.slack_webhook_url,
    workspaceId: tenant.workspaceId ?? undefined,
  }).catch((e) => console.error("[whop-agent refund-dispute-velocity] notify failed (non-fatal):", e));
}

/**
 * One engagement's reconciliation pass. Checks account-wide refund rate,
 * dispute rate, and dispute-alert count against the thresholds — Section
 * 5.7 scopes thresholds "per product," which needs the `breakdowns`
 * parameter on each metric; that's the same per-product breakdown gap
 * flagged in Portfolio Rollup's own summary, not re-solved here. This
 * checks the account-wide rate as a conservative first pass: an account
 * crossing 8% overall is worth flagging even before it's broken down by
 * product.
 */
export async function reconcileRefundDisputeVelocity(engagementId: string): Promise<void> {
  if (!(await isSkillEnabledForEngagement(engagementId, "whop-refund-dispute-velocity"))) return;

  const client = await WhopAgentClient.forEngagement(engagementId).catch(() => null);
  if (!client) return;

  const [refundRateRes, disputeRateRes, disputeAlertsRes, paymentsRes] = await Promise.all([
    client.statsMetric("receipts/refunds:refund_rate", { granularity: "weekly" }).catch(() => null),
    client.statsMetric("receipts/disputes:dispute_rate", { granularity: "weekly" }).catch(() => null),
    client.statsMetric("dispute_alerts:dispute_alerts", { granularity: "weekly" }).catch(() => null),
    client.statsMetric("receipts:successful_payments", { granularity: "weekly" }).catch(() => null),
  ]);

  const paymentCount = latestValue(paymentsRes);
  if (paymentCount === null || paymentCount < MIN_SAMPLE_SIZE) {
    // Section 5.7: "Minimum sample size before any percentage threshold
    // evaluates: 10 payments in the rolling window. Two refunds on four
    // payments is 50 percent and is noise." Dispute-alert count is an
    // absolute threshold, not a rate, so it isn't gated by sample size —
    // still evaluated below independent of this early return.
  } else {
    const refundRate = latestValue(refundRateRes);
    if (refundRate !== null && refundRate >= REFUND_RATE_THRESHOLD) {
      const source = `whop:refund-velocity:${engagementId}`;
      if (!(await alertFiredWithinCooldown(source, RECONCILIATION_COOLDOWN_HOURS))) {
        await recordAlertFired({ source, engagementId, metricName: "refund_rate", threshold: String(REFUND_RATE_THRESHOLD), severity: "warning" });
        await alertOperator(
          engagementId,
          "Refund velocity above threshold",
          `Refund rate is ${(refundRate * 100).toFixed(1)}% over the last week (threshold ${(REFUND_RATE_THRESHOLD * 100).toFixed(0)}%, ${paymentCount} payments in window).`,
          "warning"
        );
      }
    }

    const disputeRate = latestValue(disputeRateRes);
    if (disputeRate !== null && disputeRate >= REFUND_RATE_THRESHOLD) {
      const source = `whop:dispute-rate-velocity:${engagementId}`;
      if (!(await alertFiredWithinCooldown(source, RECONCILIATION_COOLDOWN_HOURS))) {
        await recordAlertFired({ source, engagementId, metricName: "dispute_rate", threshold: String(REFUND_RATE_THRESHOLD), severity: "critical" });
        await alertOperator(engagementId, "Dispute velocity above threshold", `Dispute rate is ${(disputeRate * 100).toFixed(1)}% over the last week.`, "critical");
      }
    }
  }

  const disputeAlertCount = latestValue(disputeAlertsRes);
  if (disputeAlertCount !== null && disputeAlertCount >= DISPUTE_ALERT_THRESHOLD) {
    const source = `whop:dispute-alert-velocity:${engagementId}`;
    if (!(await alertFiredWithinCooldown(source, RECONCILIATION_COOLDOWN_HOURS))) {
      await recordAlertFired({ source, engagementId, metricName: "dispute_alerts", threshold: String(DISPUTE_ALERT_THRESHOLD), severity: "critical" });
      await alertOperator(
        engagementId,
        "Dispute-alert velocity above threshold",
        `${disputeAlertCount} dispute alerts in the last week (threshold ${DISPUTE_ALERT_THRESHOLD}) — each can carry a fee_charged cost directly.`,
        "critical"
      );
    }
  }
}

export async function listEngagementsForVelocityReconciliation(): Promise<string[]> {
  return listConnectedEngagementIds();
}
