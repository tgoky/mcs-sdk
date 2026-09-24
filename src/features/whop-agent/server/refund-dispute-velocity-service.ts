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
import { claimAlertFiring } from "@/lib/whop-agent/alert-cooldown";
import { WhopAgentClient } from "@/lib/whop-agent/client";
import { listConnectedEngagementIds } from "./receiver-health-service";
import { isSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { readRiskWindow, riskRates, type RiskWindow } from "./risk-window";

// Defaults when a client hasn't set their own (Whop Agent's setup proposes
// levels from their last 90 days). Refunds and disputes get separate
// levels: card networks put merchants into monitoring programs at around
// 1% of transactions disputed, so a dispute rate far below the refund
// level is already serious. RECONCILIATION_COOLDOWN_HOURS stays a const:
// it's an alert-spam guard, not a business threshold.
export const DEFAULT_REFUND_RATE_THRESHOLD = 0.08; // 8% of payments refunded over a rolling 7 days
export const DEFAULT_DISPUTE_RATE_THRESHOLD = 0.0075; // 0.75% of payments disputed over a rolling 7 days
export const DEFAULT_DISPUTE_ALERT_THRESHOLD = 3; // dispute alerts over a rolling 7 days
export const DEFAULT_MIN_SAMPLE_SIZE = 10; // payments in the rolling window before a rate counts
const RECONCILIATION_COOLDOWN_HOURS = 4;
const WINDOW_DAYS = 7;

export interface VelocityThresholds {
  refundRate: number;
  disputeRate: number;
  disputeAlerts: number;
  minSample: number;
}

export function thresholdsFrom(stack: Partial<EngagementStack> | null): VelocityThresholds {
  return {
    refundRate: stack?.refund_dispute_rate_threshold ?? DEFAULT_REFUND_RATE_THRESHOLD,
    disputeRate: stack?.dispute_rate_threshold ?? DEFAULT_DISPUTE_RATE_THRESHOLD,
    disputeAlerts: stack?.dispute_alert_threshold ?? DEFAULT_DISPUTE_ALERT_THRESHOLD,
    minSample: stack?.min_payment_sample_size ?? DEFAULT_MIN_SAMPLE_SIZE,
  };
}

export interface VelocityAlert {
  metric: "refund_rate" | "dispute_rate" | "dispute_alerts";
  threshold: number;
  severity: "warning" | "critical";
  title: string;
  body: string;
}

const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 2 : 1)}%`;

/** Which alerts a window's counts cross. Rates need `minSample` payments
 * (a couple of refunds on four payments is noise); the dispute-alert
 * count is absolute and always checked. */
export function evaluateVelocity(risk: Pick<RiskWindow, "payments" | "refunds" | "disputes" | "disputeAlerts">, t: VelocityThresholds): VelocityAlert[] {
  const out: VelocityAlert[] = [];
  const { refundRate, disputeRate } = riskRates(risk);
  const enough = risk.payments != null && risk.payments >= t.minSample;
  if (enough && refundRate !== null && refundRate >= t.refundRate) {
    out.push({
      metric: "refund_rate",
      threshold: t.refundRate,
      severity: "warning",
      title: "Refund velocity above threshold",
      body: `${pct(refundRate)} of payments refunded over the last ${WINDOW_DAYS} days (${risk.refunds!.count} refunds on ${risk.payments} payments; your level is ${pct(t.refundRate)}).`,
    });
  }
  if (enough && disputeRate !== null && disputeRate >= t.disputeRate) {
    out.push({
      metric: "dispute_rate",
      threshold: t.disputeRate,
      severity: "critical",
      title: "Dispute rate above threshold",
      body: `${pct(disputeRate)} of payments disputed over the last ${WINDOW_DAYS} days (${risk.disputes} disputes on ${risk.payments} payments; your level is ${pct(t.disputeRate)}). Card networks start monitoring merchants at around 1%.`,
    });
  }
  const alerts = risk.disputeAlerts?.count ?? null;
  if (alerts !== null && alerts >= t.disputeAlerts) {
    out.push({
      metric: "dispute_alerts",
      threshold: t.disputeAlerts,
      severity: "critical",
      title: "Dispute-alert velocity above threshold",
      body: `${alerts}${risk.disputeAlerts?.more ? "+" : ""} dispute alerts in the last ${WINDOW_DAYS} days (your level is ${t.disputeAlerts}). Each can carry a fee.`,
    });
  }
  return out;
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
 * One engagement's reconciliation pass over the last 7 days: refunds,
 * disputes and dispute alerts counted from Whop's lists, against the
 * payments in the same window (risk-window.ts), each checked against its
 * own level. Section 5.7 scopes thresholds "per product"; this checks the
 * account as a whole, which is worth flagging before any per-product split.
 */
export async function reconcileRefundDisputeVelocity(engagementId: string): Promise<void> {
  if (!(await isSkillEnabledForEngagement(engagementId, "whop-refund-dispute-velocity"))) return;

  const client = await WhopAgentClient.forEngagement(engagementId).catch(() => null);
  if (!client) return;

  const [tenant] = await db
    .select({ stack: engagements.stack })
    .from(engagements)
    .where(eq(engagements.engagementId, engagementId))
    .limit(1);
  const thresholds = thresholdsFrom((tenant?.stack as EngagementStack | null) ?? null);

  const to = new Date();
  const risk = await readRiskWindow(client, new Date(to.getTime() - WINDOW_DAYS * 86_400_000), to);
  for (const alert of evaluateVelocity(risk, thresholds)) {
    const source = `whop:${alert.metric.replace(/_/g, "-")}-velocity:${engagementId}`;
    if (await claimAlertFiring({ source, cooldownHours: RECONCILIATION_COOLDOWN_HOURS, engagementId, metricName: alert.metric, threshold: String(alert.threshold), severity: alert.severity })) {
      await alertOperator(engagementId, alert.title, alert.body, alert.severity);
    }
  }
}

export async function listEngagementsForVelocityReconciliation(): Promise<string[]> {
  return listConnectedEngagementIds();
}
