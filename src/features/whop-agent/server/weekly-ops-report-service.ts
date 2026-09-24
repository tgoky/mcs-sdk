// src/features/whop-agent/server/weekly-ops-report-service.ts
//
// Playbook 5.4 — every reported number comes from Whop's Stats API, no
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
import { WHOP_METRICS, formatMetricValue, lastFullWeek, type WhopMetricId } from "@/lib/whop-agent/stats";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

// Section 5.4's metric set, read from Whop's Stats API (see stats.ts).
const REPORT_METRICS: WhopMetricId[] = ["netRevenue", "mrr", "arr", "churnRate", "newMembers", "newMemberships", "trialConversion", "arpu", "refundRate", "disputeRate", "processingFees"];

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

    // Last full week, Monday to Sunday (UTC). Weekly points for rates.
    const window = { ...lastFullWeek(new Date()), interval: "week" as const };
    const unavailable: string[] = [];

    for (const id of REPORT_METRICS) {
      const label = WHOP_METRICS[id].label;
      await logStep(runId, { phase: `metric_${id}`, status: "running" });
      try {
        const result = await runStep(`fetch-${id}`, () => client.statsValue(id, { from: window.from, to: window.to, interval: window.interval }));
        if (!result) {
          unavailable.push(label);
          await logStep(runId, { phase: `metric_${id}`, status: "skipped", detail: "Whop's stats catalog for this account has no such metric." });
          continue;
        }
        const value = result.value;
        await logStep(runId, {
          phase: `metric_${id}`,
          status: value === null ? "skipped" : "success",
          // Provenance: the exact Whop metric key each number came from.
          detail: value === null ? `No data points returned last week (Whop metric ${result.key}).` : `${formatMetricValue(value, result.unit, result.currency)} from Whop metric ${result.key}.`,
        });

        if (value !== null) {
          blocks.push({ workerId: "whop-weekly-ops-report", label, value, displayValue: formatMetricValue(value, result.unit, result.currency) });
        }
      } catch (err) {
        // Section 9's fail-open table: "A single metric query fails — the
        // rest of the report renders; the failed section is flagged
        // in-line rather than blocking the run."
        const message = err instanceof Error ? err.message : String(err);
        failedMetrics.push(label);
        await logStep(runId, { phase: `metric_${id}`, status: "failed", detail: message });
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
        whatWasAttempted: [`Queried ${REPORT_METRICS.length} Whop stats metrics for ${window.from.toISOString().slice(0, 10)} to ${window.to.toISOString().slice(0, 10)}`],
        whatWorked: blocks.map((b) => `${b.label}: ${b.displayValue}`),
        whatFailed: failedMetrics.length ? failedMetrics.map((m) => `${m} (query failed, see step detail)`) : [],
        openItems: [...(unavailable.length ? [`Not offered by Whop's stats for this account: ${unavailable.join(", ")}`] : []), ...(prior ? [] : ["No prior-week snapshot yet. Deltas will start appearing next week."])],
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
