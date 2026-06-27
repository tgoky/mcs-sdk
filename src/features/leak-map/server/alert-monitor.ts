import { db } from "@/lib/db";
import { activeAlerts, briefedCallsLog, engagements } from "@/models/schema";
import { eq, and, gte } from "drizzle-orm";
import { callClaude, MODEL } from "@/lib/llm";

/**
 * 6-Hour Active Alert Monitor.
 * Evaluates all registered alerts across all engagements.
 * Cooldown is tracked via activeAlerts.lastFiredAt — no skillRuns abuse.
 * Slack delivery uses per-engagement webhook, never a global env var.
 */
export async function evaluateActiveAlertMonitor(): Promise<number> {
  let triggered = 0;
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const cooldownMs = 12 * 60 * 60 * 1000; // 12 hours per alert

  const configuredAlerts = await db.select().from(activeAlerts);

  for (const alert of configuredAlerts) {
    // ── Cooldown gate: per-alert, per-engagement ─────────────────────
    // lastFiredAt lives on the activeAlerts row — no shared state between alerts
    if (alert.lastFiredAt) {
      const elapsed = Date.now() - alert.lastFiredAt.getTime();
      if (elapsed < cooldownMs) continue;
    }

    // ── Fetch relevant metric data ────────────────────────────────────
    let currentValue: number | null = null;

    if (alert.metricName === "person_match_confidence") {
      const logs = await db
        .select()
        .from(briefedCallsLog)
        .where(
          and(
            eq(briefedCallsLog.engagementId, alert.engagementId),
            gte(briefedCallsLog.createdAt, oneDayAgo)
          )
        );

      if (logs.length === 0) continue;
      currentValue =
        logs.reduce((acc, l) => acc + (l.personMatchScore ?? 0), 0) / logs.length;
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

    // ── Fetch tenant for Slack webhook URL ────────────────────────────
    // Alert's Slack destination is on the engagement stack, not the alert row
    const tenant = await db
      .select()
      .from(engagements)
      .where(eq(engagements.engagementId, alert.engagementId))
      .then((r) => r[0]);

    const slackWebhookUrl = (tenant?.stack as any)?.slack_webhook_url;
    if (!slackWebhookUrl) {
      console.warn(
        `[alert-monitor] Alert ${alert.id} breached but no slack_webhook_url on engagement ${alert.engagementId}`
      );
    }

    // ── Generate alert message via Claude Haiku (fast, cheap) ─────────
    let alertMessage = `Metric \`${alert.metricName}\` is ${currentValue.toFixed(1)} — breaching your ${alert.comparison} ${alert.threshold} threshold.`;

    try {
      const llmResult = await callClaude({
        model: MODEL.FAST, // Haiku — this is a short classification/formatting task
        system:
          "You write urgent but clear operational alert messages for a B2B sales automation platform. " +
          "One paragraph max. Plain text. No markdown. Direct.",
        userMessage: `Metric: ${alert.metricName}
Current value: ${currentValue.toFixed(1)}
Threshold: ${alert.comparison} ${alert.threshold}
Severity: ${alert.severity}
Write a one-paragraph alert for the sales operator.`,
        maxTokens: 200,
        // No runId — alert messages aren't tracked as skill runs
      });
      alertMessage = llmResult.text;
    } catch {
      // If LLM call fails, use the fallback message — alert must still fire
    }

    // ── Deliver to Slack ──────────────────────────────────────────────
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

    // ── Update lastFiredAt to lock cooldown ───────────────────────────
    // This is the correct pattern: timestamp on the alert row itself,
    // scoped to this specific alert, not a shared skillRuns entry.
    await db
      .update(activeAlerts)
      .set({ lastFiredAt: new Date() })
      .where(eq(activeAlerts.id, alert.id));

    triggered++;
  }

  return triggered;
}