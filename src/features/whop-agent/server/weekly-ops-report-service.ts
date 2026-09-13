// src/features/whop-agent/server/weekly-ops-report-service.ts
//
// Playbook 5.4 — every reported number comes from the stats engine, no
// client-side aggregation (Section 9.1). Reuses this app's existing
// client_metric_snapshots table (clientMetricSnapshots/client-metric-
// snapshots.ts) for prior-period comparison rather than inventing a
// parallel snapshot mechanism — that table's `blocks: WorkerReportBlock[]`
// shape already fits "one row per worker per metric, diffable week over
// week," which is exactly what Section 9.7 asks for.
import crypto from "crypto";
import { startOfWeek } from "@/lib/dashboard-stats";
import { startRun, logStep, finishRun, failRun } from "@/lib/run-log";
import { recordWeeklySnapshot, getPriorSnapshot } from "@/lib/client-metric-snapshots";
import type { WorkerReportBlock } from "@/lib/worker-report-blocks";
import { WhopAgentClient } from "@/lib/whop-agent/client";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

type MetricFormat = "currency_cents" | "percent" | "count";

// Section 5.4's own metric table, verbatim resource strings — Appendix A
// is the full 26-metric catalog; this is the subset 5.4 actually reports.
const REPORT_METRICS: Array<{ key: string; label: string; resource: string; format: MetricFormat }> = [
  { key: "netRevenue", label: "Net revenue", resource: "receipts:gross_revenue", format: "currency_cents" },
  { key: "mrr", label: "MRR", resource: "mrr_history_records:monthly_recurring_revenue", format: "currency_cents" },
  { key: "arr", label: "ARR", resource: "mrr_history_records:annual_recurring_revenue", format: "currency_cents" },
  { key: "churnRate", label: "Churn rate", resource: "vw_member_statuses:churn_rate", format: "percent" },
  { key: "newSubscribers", label: "New subscribers", resource: "members:new_users", format: "count" },
  { key: "newMemberships", label: "New memberships", resource: "memberships:new_memberships", format: "count" },
  { key: "trialConversion", label: "Trial conversion rate", resource: "memberships:trial_conversion_rate", format: "percent" },
  { key: "arpu", label: "Average revenue per user", resource: "receipts:average_revenue_per_user", format: "currency_cents" },
  { key: "refundRate", label: "Refund rate", resource: "receipts/refunds:refund_rate", format: "percent" },
  { key: "disputeRate", label: "Dispute rate", resource: "receipts/disputes:dispute_rate", format: "percent" },
  { key: "processingFees", label: "Processing fees", resource: "receipt_fees:processing_fees", format: "currency_cents" },
];

function formatValue(value: number, format: MetricFormat): string {
  if (format === "currency_cents") return `$${(value / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (format === "percent") return `${(value * 100).toFixed(1)}%`;
  return value.toLocaleString();
}

function latestValue(response: { data: Array<[string, ...(number | string)[]]> }): number | null {
  if (!response.data?.length) return null;
  const lastRow = response.data[response.data.length - 1];
  const value = lastRow[1];
  return typeof value === "number" ? value : Number(value);
}

/** Playbook 5.4's own executor — dispatched through the generic
 * whop-agent-skill-registry.ts execute path, same as any other worker's
 * scheduled/manual run. */
export async function runWeeklyOpsReport(tenant: any, runId: string, step: StepTools | undefined): Promise<void> {
  const engagementId = tenant.engagementId as string;
  // Same inline-generic shape as recovery-service.ts's own `run` helper —
  // declared locally, not as a shared top-level function, so TS infers the
  // return type from each call site instead of trying to force Inngest's
  // step.run() (which returns Jsonify<Awaited<T>>, not literally T) into
  // an explicit Promise<T> annotation.
  const runStep = step
    ? <R,>(id: string, fn: () => Promise<R>) => step.run(id, fn)
    : <R,>(_id: string, fn: () => Promise<R>) => fn();

  try {
    const client = await WhopAgentClient.forEngagement(engagementId);
    const weekStart = startOfWeek(new Date());
    const blocks: WorkerReportBlock[] = [];
    const failedMetrics: string[] = [];

    for (const metric of REPORT_METRICS) {
      await logStep(runId, { phase: `metric_${metric.key}`, status: "running" });
      try {
        const response = await runStep(`fetch-${metric.key}`, () => client.statsMetric(metric.resource, { granularity: "weekly" }));
        const value = latestValue(response);

        await logStep(runId, {
          phase: `metric_${metric.key}`,
          status: value === null ? "skipped" : "success",
          // Section 9.3: debug.sql stored alongside every computed metric —
          // this run's own step log IS that audit trail, per this app's
          // existing convention (skillRuns.steps is what Run History
          // renders), not a second, separate audit table.
          detail: value === null ? "No data points returned this week." : `${formatValue(value, metric.format)} — debug.sql: ${response.debug?.sql ?? "not returned by Whop"}`,
        });

        if (value !== null) {
          blocks.push({ workerId: "whop-weekly-ops-report", label: metric.label, value, displayValue: formatValue(value, metric.format) });
        }
      } catch (err) {
        // Section 9's fail-open table: "A single metric query fails — the
        // rest of the report renders; the failed section is flagged
        // in-line rather than blocking the run."
        const message = err instanceof Error ? err.message : String(err);
        failedMetrics.push(metric.label);
        await logStep(runId, { phase: `metric_${metric.key}`, status: "failed", detail: message });
      }
    }

    const prior = await runStep("load-prior-snapshot", () => getPriorSnapshot(engagementId, weekStart));
    await runStep("record-snapshot", () => recordWeeklySnapshot(engagementId, weekStart, blocks));

    const deltas: string[] = [];
    if (prior) {
      const priorByLabel = new Map(prior.blocks.filter((b) => b.workerId === "whop-weekly-ops-report").map((b) => [b.label, b.value]));
      for (const block of blocks) {
        const priorValue = priorByLabel.get(block.label);
        if (priorValue !== undefined && priorValue !== null && block.value !== null) {
          const pctChange = priorValue === 0 ? null : ((block.value - priorValue) / Math.abs(priorValue)) * 100;
          deltas.push(`${block.label}: ${pctChange === null ? "n/a (prior was 0)" : `${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(1)}%`} vs last week`);
        }
      }
    }

    await finishRun(runId, {
      summary: {
        whatWasAttempted: [`Queried ${REPORT_METRICS.length} stats-engine metrics for the week of ${weekStart.toISOString().slice(0, 10)}`],
        whatWorked: blocks.map((b) => `${b.label}: ${b.displayValue}`),
        whatFailed: failedMetrics.length ? failedMetrics.map((m) => `${m} — query failed, see step detail`) : [],
        openItems: prior ? [] : ["No prior-week snapshot yet — deltas will start appearing next week."],
        decisionsMade: deltas,
      },
    });
  } catch (err) {
    await failRun(runId, err).catch(() => {});
    throw err;
  }
}

/** Manual on-demand trigger — mirrors dispatchSkillRun's shape for skills
 * that don't run on setup. Scheduled weekly dispatch lands in
 * src/inngest/whop-agent.ts once the cron cadence/staggering (Section
 * 9.8) is wired for the whole Whop Agent product together, not per-skill. */
export async function dispatchWeeklyOpsReportRun(engagementId: string): Promise<string> {
  const { inngest, skillRunExecute } = await import("@/lib/inngest");
  const runId = crypto.randomUUID();
  await startRun({ id: runId, engagementId, skillName: "whop-weekly-ops-report", phase: "metric_netRevenue", label: "Weekly Ops Report" });
  await inngest.send(skillRunExecute.create({ runId, engagementId, skillName: "whop-weekly-ops-report" }));
  return runId;
}
