import { db } from "@/lib/db";
import { engagements, skillRuns, briefedCallsLog, auditRunsLog } from "@/models/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { callClaudeWithRetry, MODEL } from "@/lib/llm";
import { resolveCredential } from "@/lib/credentials";
import { KlaviyoClient } from "@/lib/platforms/email";
import { CalendlyClient } from "@/lib/platforms/booking";
import { logStep, finishRun, failRun } from "@/lib/run-log";
import crypto from "crypto";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

interface MetricResult {
  name: string;
  current: number;
  prior: number;
  delta: number;
  severity: "high" | "medium" | "low" | "none";
  sampleSize: { current: number; prior: number };
  /** True when min(sampleSize.current, sampleSize.prior) < sample_size_minimum.
   * Severity is forced to "none" and delta is treated as unquantified —
   * this metric must not drive alertsFired/highestSeverity or generate a
   * down-funnel recommendation card. See LEAK-002. */
  insufficientData: boolean;
}

/**
 * 5-Stage Leak Map Audit Pipeline.
 */
export class AuditEngine {
  async runAuditPipeline(
    engagementId: string,
    type: "weekly" | "monthly",
    runId: string,
    step?: StepTools
  ): Promise<string> {
    const lookbackDays = type === "weekly" ? 7 : 30;
    // Wrap each stage in step.run when called from the Inngest worker, so a
    // checkpoint-resumed replay skips stages already completed instead of
    // re-pulling data / re-inserting auditRunsLog rows / re-billing the
    // Claude call. Falls back to running inline when called directly
    // (the still-not-fully-migrated cron routes).
    const run = step
      ? <T,>(id: string, fn: () => Promise<T>) => step.run(id, fn)
      : <T,>(_id: string, fn: () => Promise<T>) => fn();

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
      // logStep calls live INSIDE the step.run callback now, not before/
      // after it. A retry replays the whole function from the top, and
      // any logStep() call sitting outside a step.run boundary fires on
      // every single replay even when the step it surrounds is already
      // memoized — that's what was producing duplicate timeline nodes.
      // Folding the running/success markers into the same memoized unit
      // as the work they describe means the pair either both happened
      // (memoized, never replayed) or neither did.
      const { currentBriefs, priorBriefs } = await run("stage-1-data-pull", async () => {
        await logStep(runId, { phase: "stage_1_data_pull", status: "running" });

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

        await logStep(runId, { phase: "stage_1_data_pull", status: "success", detail: `${currentBriefs.length} brief(s) in current window` });
        return { currentBriefs, priorBriefs };
      });

      // ── STAGE 2 + 4: Compute metrics and overall severity ─────────────
      // Folded together — stage 4 was pure derived computation over
      // stage 2's output with no I/O of its own, so there's no benefit to
      // a separate checkpoint boundary, just another naked-logStep risk.
      const { metrics, gaps, highestSeverity, alertsFired } = await run("stage-2-compute", async () => {
        await logStep(runId, { phase: "stage_2_compute", status: "running" });

        const metrics: MetricResult[] = [];
        const gaps: string[] = [];
        const sampleSizeMinimum: number = stack?.sample_size_minimum ?? 5;

        // Metric A: Brief delivery volume. Its own sample IS the count
        // being compared, so sampleSize == the raw values themselves.
        const deliveryMetric = computeDelta(
          "Brief delivery volume",
          currentBriefs.length,
          priorBriefs.length,
          { highThreshold: -10, medThreshold: -5 },
          { current: currentBriefs.length, prior: priorBriefs.length },
          sampleSizeMinimum
        );
        metrics.push(deliveryMetric);

        // Metric B: Rule 14 accuracy — same underlying sample as Metric A.
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
          { highThreshold: -15, medThreshold: -8 },
          { current: currentBriefs.length, prior: priorBriefs.length },
          sampleSizeMinimum
        );
        metrics.push(accuracyMetric);

        // Metrics C + D: external platform pulls. LEAK-001 — fanned out
        // through a concurrency-capped pool (max 3 in flight) rather than
        // sequential awaits, so adding more external sources later (the
        // stack currently has 2: Calendly show-rate, Klaviyo open-rate)
        // doesn't turn stage 2 into a serial chain of network round trips.
        const externalPulls: Array<{ label: string; fn: () => Promise<MetricResult | null> }> = [];

        if (stack?.booking_platform && stack?.booking_platform !== "unsupported") {
          externalPulls.push({
            label: `booking show-rate from ${stack.booking_platform}`,
            fn: () =>
              pullBookingShowRate(engagementId, stack, currentStart, priorStart, now, sampleSizeMinimum),
          });
        }
        if (stack?.email_platform === "klaviyo") {
          externalPulls.push({
            label: "email open-rate from Klaviyo",
            fn: () => pullKlaviyoOpenRate(engagementId, stack, sampleSizeMinimum),
          });
        }

        const externalResults = await runWithConcurrencyCap(externalPulls, 3);
        for (const r of externalResults) {
          if (r.status === "fulfilled" && r.value) {
            metrics.push(r.value);
          } else if (r.status === "rejected") {
            gaps.push(`Could not pull ${r.label}: ${r.reason?.message ?? r.reason}`);
          }
        }

        // Per-metric data-caveat markers (LEAK-002) — these are the actual
        // gate, not an FYI. A metric flagged insufficientData already has
        // severity forced to "none" by computeDelta, which keeps it out of
        // alertsFired/highestSeverity below; this gaps entry is what tells
        // stage 5 to skip generating a recommendation card for it, instead
        // of just noting a vague low-sample-size caveat at the report level.
        for (const m of metrics) {
          if (m.insufficientData) {
            gaps.push(
              `[insufficient-data] ${m.name}: sample too small (current n=${m.sampleSize.current}, prior n=${m.sampleSize.prior}, floor=${sampleSizeMinimum}). Delta suppressed, no recommendation should be generated for this metric.`
            );
          }
        }

        await logStep(runId, { phase: "stage_2_compute", status: "success" });

        // ── STAGE 4: Overall severity (folded in, see comment above) ────
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

        await logStep(runId, { phase: "stage_4_severity", status: "success", detail: `Overall severity: ${highestSeverity}` });

        return { metrics, gaps, highestSeverity, alertsFired };
      });

      // ── STAGE 5: Claude report synthesis ────────────────────────────
      // Still happens before the auditRunsLog insert (see prior fix —
      // prevents the duplicate-row-on-retry bug your auditor's version
      // also correctly preserved).
      const report = await run("stage-5-report", async () => {
        await logStep(runId, { phase: "stage_5_report", status: "running" });

        let result = "All tracked metrics nominal. No funnel leaks detected.";

        if (highestSeverity !== "none") {
          const userMessage = `Generate a 6-field Leak Map recommendation report for these funnel metrics:
${JSON.stringify(metrics, null, 2)}

Gaps noted: ${gaps.join("; ") || "none"}
Overall severity: ${highestSeverity}

IMPORTANT: Any metric with insufficientData: true must NOT get a
recommendation card. Its sample size is below the statistical floor, so a
delta computed from it is unreliable. For those metrics, add at most one
line to a "Data gaps" note (e.g. "Booking show-rate: not enough bookings
yet to call a trend") and do not speculate about cause, severity, or action.

For each remaining issue (insufficientData: false, severity !== "none"),
structure the response as:
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
          result = llmResult.text;
        }

        await logStep(runId, { phase: "stage_5_report", status: "success" });
        return result;
      });

      // Persist audit record — folded into the same step as nothing else
      // needs to happen after it; still strictly after stage-5 completes,
      // so a retry that's already past this point hits a memoized step
      // and never inserts twice.
      await run("persist-audit-record", async () => {
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
      });

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

/**
 * Runs a list of async tasks with at most `cap` in flight at once — the
 * "traffic controller" from LEAK-001. With today's 2 external sources
 * (Calendly, Klaviyo) this never actually queues anything, but the pool
 * shape means adding a 3rd/4th/5th source (HubSpot, ActiveCampaign, ad
 * platforms) later doesn't turn stage 2 into either an uncapped fan-out
 * that trips rate limits, or a sequential chain that makes the pipeline
 * slower with every new integration.
 */
async function runWithConcurrencyCap<T>(
  tasks: Array<{ label: string; fn: () => Promise<T> }>,
  cap: number
): Promise<Array<{ label: string; status: "fulfilled"; value: T } | { label: string; status: "rejected"; reason: any }>> {
  const results: Array<{ label: string; status: "fulfilled"; value: T } | { label: string; status: "rejected"; reason: any }> = new Array(tasks.length);
  let next = 0;

  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      const task = tasks[i];
      try {
        const value = await task.fn();
        results[i] = { label: task.label, status: "fulfilled", value };
      } catch (reason) {
        results[i] = { label: task.label, status: "rejected", reason };
      }
    }
  }

  const workers = Array.from({ length: Math.min(cap, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function computeDelta(
  name: string,
  current: number,
  prior: number,
  thresholds: { highThreshold: number; medThreshold: number },
  sampleSize: { current: number; prior: number },
  sampleSizeMinimum = 5
): MetricResult {
  const insufficientData = Math.min(sampleSize.current, sampleSize.prior) < sampleSizeMinimum;

  // A percentage/delta computed from a handful of observations swings
  // wildly and produces false alarms — this is the gate itself, not just
  // an advisory note. Below the floor, severity is hard-forced to "none"
  // regardless of how large the raw delta looks, and the caller must
  // exclude this metric from alertsFired / highestSeverity / the LLM's
  // down-funnel recommendation prompt.
  if (insufficientData) {
    return {
      name,
      current,
      prior,
      delta: current - prior,
      severity: "none",
      sampleSize,
      insufficientData: true,
    };
  }

  const delta = current - prior;
  let severity: "high" | "medium" | "low" | "none" = "none";
  if (delta <= thresholds.highThreshold) severity = "high";
  else if (delta <= thresholds.medThreshold) severity = "medium";
  else if (delta < 0) severity = "low";
  return { name, current, prior, delta, severity, sampleSize, insufficientData: false };
}

async function pullBookingShowRate(
  engagementId: string,
  stack: any,
  currentStart: Date,
  priorStart: Date,
  now: Date,
  sampleSizeMinimum: number
): Promise<MetricResult | null> {
  if (stack.booking_platform !== "calendly") return null;

  const apiKey = await resolveCredential(engagementId, "calendly");

  async function getShowRate(start: Date, end: Date): Promise<{ rate: number; n: number }> {
    const res = await fetch(
      `https://api.calendly.com/scheduled_events?min_start_time=${start.toISOString()}&max_start_time=${end.toISOString()}&count=100`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (!res.ok) return { rate: 0, n: 0 };
    const data = await res.json();
    const events: any[] = data.collection ?? [];
    const total = events.length;
    if (total === 0) return { rate: 0, n: 0 };
    const active = events.filter((e) => e.status === "active").length;
    return { rate: Math.round((active / total) * 100), n: total };
  }

  const current = await getShowRate(currentStart, now);
  const priorEnd = currentStart;
  const prior = await getShowRate(priorStart, priorEnd);

  return computeDelta(
    "Booking show-rate (%)",
    current.rate,
    prior.rate,
    { highThreshold: -15, medThreshold: -8 },
    { current: current.n, prior: prior.n },
    sampleSizeMinimum
  );
}

async function pullKlaviyoOpenRate(
  engagementId: string,
  stack: any,
  sampleSizeMinimum: number
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
  // Sample size here is recipient count, not campaign count — a 90% open
  // rate on a campaign sent to 4 people is exactly the kind of noise the
  // sample-size gate exists to catch, even though "2 campaigns" looks
  // like enough data points at a glance.
  const getRecipientCount = (campaign: any): number =>
    campaign.attributes?.statistics?.recipients ?? 0;

  return computeDelta(
    "Email open rate (%)",
    getOpenRate(campaigns[0]),
    getOpenRate(campaigns[1]),
    { highThreshold: -10, medThreshold: -5 },
    { current: getRecipientCount(campaigns[0]), prior: getRecipientCount(campaigns[1]) },
    sampleSizeMinimum
  );
}