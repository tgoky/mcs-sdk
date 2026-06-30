import { db } from "@/lib/db";
import { activeAlerts, briefedCallsLog, engagements, type EngagementStack } from "@/models/schema";
import { eq, gte, inArray } from "drizzle-orm"; // Added inArray
import { callClaude, MODEL } from "@/lib/llm";

/**
 * 6-Hour Active Alert Monitor.
 * Evaluates all registered alerts across all engagements.
 * Cooldown is tracked via activeAlerts.lastFiredAt — no skillRuns abuse.
 * Slack delivery uses per-engagement webhook, never a global env var.
 * 
 * PERFORMANCE: Reduced from O(1 + 3N) DB queries to exactly 3 queries.
 */
export async function evaluateActiveAlertMonitor(): Promise<number> {
  let triggered = 0;
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const cooldownMs = 12 * 60 * 60 * 1000; // 12 hours per alert

  // ── QUERY 1: Fetch alerts + engagement stacks in a single JOIN ──────
  // Eliminates the N+1 lookup for the Slack webhook URL inside the loop.
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
      // Pull the stack directly from the joined engagement row
      stack: engagements.stack, 
    })
    .from(activeAlerts)
    .innerJoin(engagements, eq(activeAlerts.engagementId, engagements.engagementId));

  if (alertsWithStack.length === 0) return 0;

  // ── QUERY 2: Fetch all metric data for the last 24h in one sweep ────
  // Eliminates the N+1 lookup for briefedCallsLog inside the loop.
  const recentLogs = await db
    .select({
      engagementId: briefedCallsLog.engagementId,
      personMatchScore: briefedCallsLog.personMatchScore,
    })
    .from(briefedCallsLog)
    .where(gte(briefedCallsLog.createdAt, oneDayAgo));

  // Aggregate metrics in memory (instantaneous vs sequential DB hits)
  const metricsByEngagement = new Map<string, number[]>();
  for (const log of recentLogs) {
    if (log.personMatchScore != null) {
      const scores = metricsByEngagement.get(log.engagementId) ?? [];
      scores.push(log.personMatchScore);
      metricsByEngagement.set(log.engagementId, scores);
    }
  }

  // ── Evaluate & Fan-out ──────────────────────────────────────────────
  const triggeredAlertIds: string[] = [];
  const outboundPromises: Promise<void>[] = [];

  for (const alert of alertsWithStack) {
    // ── Cooldown gate: per-alert, per-engagement ─────────────────────
    if (alert.lastFiredAt) {
      const elapsed = Date.now() - alert.lastFiredAt.getTime();
      if (elapsed < cooldownMs) continue;
    }

    // ── Resolve metric value from in-memory map ──────────────────────
    let currentValue: number | null = null;

    if (alert.metricName === "person_match_confidence") {
      const scores = metricsByEngagement.get(alert.engagementId);
      if (!scores || scores.length === 0) continue; // No data to evaluate
      currentValue = scores.reduce((acc, s) => acc + s, 0) / scores.length;
    }

    // Add more metric handlers here as needed:
    // if (alert.metricName === "show_rate") { ... }
    // if (alert.metricName === "email_open_rate") { ... }

    if (currentValue === null) continue;

    // ── Threshold evaluation ──────────────────────────────────────────
    const threshold = parseFloat(alert.threshold);
    let breached = false;
    if (alert.comparison === "below" && currentValue < threshold) breached = true;
    if (alert.comparison === "above" && currentValue > threshold) breached = true;
    if (!breached) continue;

    // ── Extract Slack URL directly from joined stack (no DB call) ─────
    const slackWebhookUrl = (alert.stack as EngagementStack | null)?.slack_webhook_url;
    if (!slackWebhookUrl) {
      console.warn(
        `[alert-monitor] Alert ${alert.id} breached but no slack_webhook_url on engagement ${alert.engagementId}`
      );
    }

    // ── Generate alert message via Claude Haiku ───────────────────────
    let alertMessage = `Metric \`${alert.metricName}\` is ${currentValue.toFixed(1)} — breaching your ${alert.comparison} ${alert.threshold} threshold.`;

    // Fire LLM call (non-blocking to the loop)
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

    // Chain Slack delivery after LLM finishes, push to concurrent pool
    outboundPromises.push(
      llmPromise.then(async () => {
        if (slackWebhookUrl) {
          await fetch(slackWebhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: `*[LEAK MAP ALERT — ${alert.severity.toUpperCase()}]*\n${alertMessage}`,
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

  // ── Await all LLM + Slack network calls concurrently ────────────────
  await Promise.all(outboundPromises);

  // ── QUERY 3: Lock cooldowns for ALL triggered alerts in one UPDATE ──
  // Replaces N individual UPDATE queries with a single `WHERE id IN (...)`
  if (triggeredAlertIds.length > 0) {
    await db
      .update(activeAlerts)
      .set({ lastFiredAt: new Date() })
      .where(inArray(activeAlerts.id, triggeredAlertIds));
  }

  return triggered;
}