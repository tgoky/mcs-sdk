import { db } from "@/lib/db";
import { activeAlerts, briefedCallsLog, auditRunsLog, engagements, type EngagementStack } from "@/models/schema";
import { eq, gte, inArray, desc } from "drizzle-orm";
import { callClaude, MODEL } from "@/lib/llm";
import { fetchWithTimeout } from "@/lib/http";

/**
 * 6-Hour Active Alert Monitor.
 * Evaluates all registered alerts across all engagements.
 * Cooldown is tracked via activeAlerts.lastFiredAt — no skillRuns abuse.
 * Slack delivery uses per-engagement webhook, never a global env var.
 *
 * PERFORMANCE: 4 queries total, no N+1 — one join for alerts+stack, one
 * sweep for recent briefedCallsLog rows, one sweep for the latest
 * auditRunsLog row per engagement, one batched cooldown UPDATE.
 *
 * Metric handlers:
 *   - person_match_confidence: computed live from the last 24h of
 *     briefedCallsLog — this one genuinely needs to be fresh, since brief
 *     quality can drift within a day.
 *   - Everything else (show_rate, email_open_rate, crm_pipeline_win_rate,
 *     brief_delivery_volume, identity_match_accuracy — see
 *     notification-pack.ts's canonical list) is read from the most recent
 *     completed audit run's topIssues array rather than re-pulling
 *     external platform APIs on a 6-hour cycle. Those metrics are already
 *     computed by audit-engine.ts on its own weekly/monthly cadence;
 *     re-fetching them from Calendly/Klaviyo/HubSpot every 6 hours for
 *     every engagement would multiply this app's external API call volume
 *     for no real freshness gain between audit runs.
 */

const AUDIT_METRIC_NAME_MAP: Record<string, string> = {
  show_rate: "Booking show-rate (%)",
  email_open_rate: "Email open rate (%)",
  crm_pipeline_win_rate: "CRM pipeline win-rate (%)",
  brief_delivery_volume: "Brief delivery volume",
  identity_match_accuracy: "Identity match accuracy",
};

export async function evaluateActiveAlertMonitor(): Promise<number> {
  let triggered = 0;
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const cooldownMs = 12 * 60 * 60 * 1000; // 12 hours per alert

  // ── QUERY 1: Fetch alerts + engagement stacks in a single JOIN ──────
  const alertsWithStack = await db
    .select({
      id: activeAlerts.id,
      engagementId: activeAlerts.engagementId,
      metricName: activeAlerts.metricName,
      threshold: activeAlerts.threshold,
      comparison: activeAlerts.comparison,
      evaluationPeriod: activeAlerts.evaluationPeriod,
      severity: activeAlerts.severity,
      source: activeAlerts.source,
      lastFiredAt: activeAlerts.lastFiredAt,
      stack: engagements.stack,
      buyer: engagements.buyer,
    })
    .from(activeAlerts)
    .innerJoin(engagements, eq(activeAlerts.engagementId, engagements.engagementId));

  if (alertsWithStack.length === 0) return 0;

  // ── QUERY 2: Fetch all metric data for the last 24h in one sweep ────
  const recentLogs = await db
    .select({
      engagementId: briefedCallsLog.engagementId,
      personMatchScore: briefedCallsLog.personMatchScore,
    })
    .from(briefedCallsLog)
    .where(gte(briefedCallsLog.createdAt, oneDayAgo));

  const metricsByEngagement = new Map<string, number[]>();
  for (const log of recentLogs) {
    if (log.personMatchScore != null) {
      const scores = metricsByEngagement.get(log.engagementId) ?? [];
      scores.push(log.personMatchScore);
      metricsByEngagement.set(log.engagementId, scores);
    }
  }

  // ── QUERY 3: Most recent completed audit run per engagement ──────────
  // Only fetched for engagements that actually have a non-person-match
  // alert registered, to avoid pulling audit history for tenants that
  // don't need it.
  const engagementIdsNeedingAuditData = [
    ...new Set(
      alertsWithStack.filter((a) => a.metricName !== "person_match_confidence").map((a) => a.engagementId)
    ),
  ];

  const latestAuditByEngagement = new Map<string, Array<{ name: string; current: number; delta: number }>>();
  if (engagementIdsNeedingAuditData.length > 0) {
    const auditRows = await db
      .select()
      .from(auditRunsLog)
      .where(inArray(auditRunsLog.engagementId, engagementIdsNeedingAuditData))
      .orderBy(desc(auditRunsLog.createdAt));

    // First row per engagementId in descending-createdAt order is the
    // latest — a simple pass keeps only the first occurrence.
    for (const row of auditRows) {
      if (!latestAuditByEngagement.has(row.engagementId)) {
        latestAuditByEngagement.set(row.engagementId, (row.topIssues as any[]) ?? []);
      }
    }
  }

  // ── Evaluate & Fan-out ──────────────────────────────────────────────
  const triggeredAlertIds: string[] = [];
  const outboundPromises: Promise<void>[] = [];

  for (const alert of alertsWithStack) {
    if (alert.lastFiredAt) {
      const elapsed = Date.now() - alert.lastFiredAt.getTime();
      if (elapsed < cooldownMs) continue;
    }

    let currentValue: number | null = null;

    if (alert.metricName === "person_match_confidence") {
      const scores = metricsByEngagement.get(alert.engagementId);
      if (!scores || scores.length === 0) continue;
      currentValue = scores.reduce((acc, s) => acc + s, 0) / scores.length;
    } else if (AUDIT_METRIC_NAME_MAP[alert.metricName]) {
      const auditMetrics = latestAuditByEngagement.get(alert.engagementId) ?? [];
      const match = auditMetrics.find((m) => m.name === AUDIT_METRIC_NAME_MAP[alert.metricName]);
      if (!match) continue; // No audit run yet, or this metric had insufficient data last run
      currentValue = match.current;
    } else {
      // Unrecognized metric name — a custom alert the operator defined on
      // something this app doesn't compute. Not an error; just nothing to
      // evaluate it against.
      continue;
    }

    if (currentValue === null) continue;

    const threshold = parseFloat(alert.threshold);
    let breached = false;
    if (alert.comparison === "below" && currentValue < threshold) breached = true;
    if (alert.comparison === "above" && currentValue > threshold) breached = true;
    if (!breached) continue;

    const slackWebhookUrl = (alert.stack as EngagementStack | null)?.slack_webhook_url;
    if (!slackWebhookUrl) {
      console.warn(
        `[alert-monitor] Alert ${alert.id} breached but no slack_webhook_url on engagement ${alert.engagementId}`
      );
    }

    let alertMessage = `Metric \`${alert.metricName}\` is ${currentValue.toFixed(1)} — breaching your ${alert.comparison} ${alert.threshold} threshold.`;

    const llmPromise = callClaude({
      model: MODEL.FAST,
      system:
        "You write urgent but clear operational alert messages for a B2B sales automation platform. " +
        "One paragraph max. Plain text. No markdown. Direct.",
      userMessage: `Metric: ${alert.metricName}
Current value: ${currentValue.toFixed(1)}
Threshold: ${alert.comparison} ${alert.threshold}
Severity: ${alert.severity}
Write a one-paragraph alert for the sales operator.`,
      maxTokens: 200,
    })
      .then((llmResult) => {
        alertMessage = llmResult.text;
      })
      .catch(() => {
        // Swallow error — fallback message ensures the alert still fires
      });

    outboundPromises.push(
      llmPromise.then(async () => {
        if (slackWebhookUrl) {
          // Block Kit — a colored/structured alert card reads far better
          // in a busy ops Slack channel than a single text line, and this
          // is the same rich-message format the OG SKILL.md specified for
          // the audit report itself (see audit-output.ts).
          const severityEmoji = { high: "🔴", medium: "🟠", low: "🟡" }[alert.severity] ?? "⚪";
          await fetchWithTimeout(slackWebhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              blocks: [
                {
                  type: "header",
                  text: { type: "plain_text", text: `${severityEmoji} Leak Map Alert — ${alert.severity.toUpperCase()}`, emoji: true },
                },
                { type: "section", text: { type: "mrkdwn", text: alertMessage } },
                {
                  type: "context",
                  elements: [{ type: "mrkdwn", text: `${alert.buyer ?? "Engagement"} · ${alert.metricName} · ${alert.source === "pack" ? "notification pack" : "custom alert"}` }],
                },
              ],
            }),
          }).catch((e) => {
            console.error(`[alert-monitor] Slack delivery failed for alert ${alert.id}:`, e.message);
          });
        }
      })
    );

    triggeredAlertIds.push(alert.id);
    triggered++;
  }

  await Promise.all(outboundPromises);

  if (triggeredAlertIds.length > 0) {
    await db
      .update(activeAlerts)
      .set({ lastFiredAt: new Date() })
      .where(inArray(activeAlerts.id, triggeredAlertIds));
  }

  return triggered;
}
