import { db } from "@/lib/db";
import { engagements, skillRuns, briefedCallsLog, auditRunsLog } from "@/models/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { callClaudeWithRetry, MODEL } from "@/lib/llm";
import { resolveCredential } from "@/lib/credentials";
import { KlaviyoClient } from "@/lib/platforms/email";
import { CalendlyClient } from "@/lib/platforms/booking";
import { logStep, finishRun, failRun } from "@/lib/run-log";
import crypto from "crypto";

interface MetricResult {
  name: string;
  current: number;
  prior: number;
  delta: number;
  severity: "high" | "medium" | "low" | "none";
}

/**
 * 5-Stage Leak Map Audit Pipeline.
 */
export class AuditEngine {
  async runAuditPipeline(
    engagementId: string,
    type: "weekly" | "monthly",
    runId: string
  ): Promise<string> {
    const lookbackDays = type === "weekly" ? 7 : 30;

    // Push execution state on tracking node
    await logStep(runId, { phase: "stage_1_data_pull", status: "running" });

    try {
      const tenant = await db
        .select()
        .from(engagements)
        .where(eq(engagements.engagementId, engagementId))
        .then((r) => r[0]);

      if (!tenant) throw new Error(`Engagement not found: ${engagementId}`);

      const now = new Date();
      const currentStart = new Date(now.getTime() - lookbackDays * 86_400_000);
      const priorStart = new Date(now.getTime() - lookbackDays * 2 * 86_400_000);
      const stack = tenant.stack as any;

      // ── STAGE 1: Pull internal data ──────────────────────────────────
      const currentBriefs = await db
        .select()
        .from(briefedCallsLog)
        .where(
          and(
            eq(briefedCallsLog.engagementId, engagementId),
            gte(briefedCallsLog.createdAt, currentStart)
          )
        );

      const priorBriefs = await db
        .select()
        .from(briefedCallsLog)
        .where(
          and(
            eq(briefedCallsLog.engagementId, engagementId),
            gte(briefedCallsLog.createdAt, priorStart),
            lte(briefedCallsLog.createdAt, currentStart)
          )
        );

      // ── STAGE 2: Compute metrics ─────────────────────────────────────
      await logStep(runId, { phase: "stage_2_compute", status: "success" });

      const metrics: MetricResult[] = [];
      const gaps: string[] = [];

      // Metric A: Brief delivery volume
      const deliveryMetric = computeDelta(
        "Brief delivery volume",
        currentBriefs.length,
        priorBriefs.length,
        { highThreshold: -10, medThreshold: -5 }
      );
      metrics.push(deliveryMetric);

      if (currentBriefs.length < 5) {
        gaps.push(`Low sample size (${currentBriefs.length} briefs). Deltas may not be statistically significant.`);
      }

      // Metric B: Rule 14 accuracy
      const currentAccuracy =
        currentBriefs.reduce((a, b) => a + (b.personMatchScore ?? 0), 0) /
        (currentBriefs.length || 1);
      const priorAccuracy =
        priorBriefs.reduce((a, b) => a + (b.personMatchScore ?? 0), 0) /
        (priorBriefs.length || 1);

      const accuracyMetric = computeDelta(
        "Identity match accuracy",
        currentAccuracy,
        priorAccuracy,
        { highThreshold: -15, medThreshold: -8 }
      );
      metrics.push(accuracyMetric);

      // Metric C: External booking show-rate
      if (stack?.booking_platform && stack?.booking_platform !== "unsupported") {
        try {
          const showRateMetric = await pullBookingShowRate(
            engagementId,
            stack,
            currentStart,
            priorStart,
            now
          );
          if (showRateMetric) metrics.push(showRateMetric);
        } catch (e: any) {
          gaps.push(`Could not pull booking show-rate from ${stack.booking_platform}: ${e.message}`);
        }
      }

      // Metric D: Email open rate
      if (stack?.email_platform === "klaviyo") {
        try {
          const openRateMetric = await pullKlaviyoOpenRate(engagementId, stack);
          if (openRateMetric) metrics.push(openRateMetric);
        } catch (e: any) {
          gaps.push(`Could not pull email open-rate from Klaviyo: ${e.message}`);
        }
      }

      // ── STAGE 4: Overall severity ────────────────────────────────────
      await logStep(runId, { phase: "stage_4_severity", status: "success" });

      const highestSeverity = metrics.reduce<"high" | "medium" | "low" | "none">(
        (acc, m) => {
          const order = { high: 3, medium: 2, low: 1, none: 0 };
          return order[m.severity] > order[acc] ? m.severity : acc;
        },
        "none"
      );

      const alertsFired = metrics
        .filter((m) => m.severity === "high")
        .map((m) => m.name);

      // Persist audit record
      await db.insert(auditRunsLog).values({
        id: crypto.randomUUID(),
        engagementId: tenant.engagementId,
        runType: type,
        topIssues: metrics.map((m) => ({
          name: m.name,
          current: m.current,
          prior: m.prior,
          delta: m.delta,
          severity: m.severity,
        })),
        alertsFired,
        gaps: gaps.length > 0 ? gaps : ["No data gaps detected."],
        createdAt: new Date(),
      });

      // ── STAGE 5: Claude report synthesis ────────────────────────────
      await logStep(runId, { phase: "stage_5_report", status: "running" });

      let report = "All tracked metrics nominal. No funnel leaks detected.";

      if (highestSeverity !== "none") {
        const userMessage = `Generate a 6-field Leak Map recommendation report for these funnel metrics:
${JSON.stringify(metrics, null, 2)}

Gaps noted: ${gaps.join("; ") || "none"}
Overall severity: ${highestSeverity}

For each issue found, structure the response as:
**Issue** | **Severity** | **Likely Cause** | **Recommended Action** | **Expected Impact** | **Estimated Effort**

Use the brand voice parameters: ${JSON.stringify(tenant.brandVoiceProfile ?? {})}`;

        const llmResult = await callClaudeWithRetry({
          model: MODEL.SYNTHESIS,
          system:
            "You are the Leak Map report synthesis engine. " +
            "You identify and explain funnel performance drops for high-ticket sales operators. " +
            "Be direct, specific, and actionable. Never blame the buyer.",
          userMessage,
          maxTokens: 1500,
          runId,
        });
        report = llmResult.text;
      }

      await logStep(runId, { phase: "stage_5_report", status: "success" });
      
      // Clean terminal execution closeout
      await finishRun(runId);

      return report;
    } catch (err: any) {
      await failRun(runId, err, {
        summary: {
          whatWasAttempted: ["Execute Leak Map audit pipeline."],
          whatWorked: [],
          whatFailed: [err.message],
          openItems: ["Audit engine encountered a pipeline processing error."],
          decisionsMade: [],
        },
      });
      throw err;
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function computeDelta(
  name: string,
  current: number,
  prior: number,
  thresholds: { highThreshold: number; medThreshold: number }
): MetricResult {
  const delta = current - prior;
  let severity: "high" | "medium" | "low" | "none" = "none";
  if (delta <= thresholds.highThreshold) severity = "high";
  else if (delta <= thresholds.medThreshold) severity = "medium";
  else if (delta < 0) severity = "low";
  return { name, current, prior, delta, severity };
}

async function pullBookingShowRate(
  engagementId: string,
  stack: any,
  currentStart: Date,
  priorStart: Date,
  now: Date
): Promise<MetricResult | null> {
  if (stack.booking_platform !== "calendly") return null;

  const apiKey = await resolveCredential(engagementId, "calendly");

  async function getShowRate(start: Date, end: Date): Promise<number> {
    const res = await fetch(
      `https://api.calendly.com/scheduled_events?min_start_time=${start.toISOString()}&max_start_time=${end.toISOString()}&count=100`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (!res.ok) return 0;
    const data = await res.json();
    const events: any[] = data.collection ?? [];
    const total = events.length;
    if (total === 0) return 0;
    const active = events.filter((e) => e.status === "active").length;
    return Math.round((active / total) * 100);
  }

  const currentShowRate = await getShowRate(currentStart, now);
  const priorEnd = currentStart;
  const priorShowRate = await getShowRate(priorStart, priorEnd);

  return computeDelta("Booking show-rate (%)", currentShowRate, priorShowRate, {
    highThreshold: -15,
    medThreshold: -8,
  });
}

async function pullKlaviyoOpenRate(
  engagementId: string,
  stack: any
): Promise<MetricResult | null> {
  const apiKey = await resolveCredential(engagementId, "klaviyo");

  const res = await fetch(
    "https://a.klaviyo.com/api/campaigns/?filter=equals(status,'sent')&sort=-send_time&page[size]=4",
    {
      headers: {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        Revision: "2024-10-15",
      },
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const campaigns: any[] = data.data ?? [];
  if (campaigns.length < 2) return null;

  const getOpenRate = (campaign: any): number =>
    campaign.attributes?.statistics?.open_rate
      ? Math.round(campaign.attributes.statistics.open_rate * 100)
      : 0;

  const currentOpenRate = getOpenRate(campaigns[0]);
  const priorOpenRate = getOpenRate(campaigns[1]);

  return computeDelta("Email open rate (%)", currentOpenRate, priorOpenRate, {
    highThreshold: -10,
    medThreshold: -5,
  });
}