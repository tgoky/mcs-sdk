// src/features/whop-agent/server/portfolio-rollup-service.ts
//
// Playbook 5.5, reframed for this app's one-workspace-one-client model
// (confirmed mid-build): the spec's own example — several Whop businesses
// under one operator — maps onto "several of this account's workspaces,
// each with its own Whop Agent connection," not onto multiple engagements
// inside one workspace (there's only ever one). Section 5.5's own
// rationale still holds exactly: "no cross-account endpoint... joined at
// the aggregation layer."
import crypto from "crypto";
import { db } from "@/lib/db";
import { whopAgentConnections } from "@/models/schema";
import { and, eq, isNull } from "drizzle-orm";
import { listWorkspaces, getPrimaryEngagementIdForWorkspace } from "@/lib/workspace";
import { startOfWeek } from "@/lib/dashboard-stats";
import { startRun, logStep, finishRun, failRun } from "@/lib/run-log";
import { recordWeeklySnapshot, getPriorSnapshot } from "@/lib/client-metric-snapshots";
import type { WorkerReportBlock } from "@/lib/worker-report-blocks";
import { WhopAgentClient } from "@/lib/whop-agent/client";
import { WHOP_METRICS, formatMetricValue, lastFullWeek, type WhopMetricId } from "@/lib/whop-agent/stats";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

// The subset of 5.4's metrics 5.5 explicitly names: "Combined MRR, ARR,
// new-subscriber count, churn count, revenue-by-product across every
// connected account, and a per-account share breakdown." Per-product
// breakdown needs the `breakdowns` param on a receipts metric (Section
// 5.4's own table) — out of scope for this pass; flagged, not silently
// omitted (see the summary's openItems below).
const ROLLUP_METRICS: { key: WhopMetricId; label: string; summable: boolean }[] = [
  { key: "netRevenue", label: "Net revenue", summable: true },
  { key: "mrr", label: "MRR", summable: true },
  { key: "arr", label: "ARR", summable: true },
  { key: "newMembers", label: "New subscribers", summable: true },
  { key: "churnRate", label: "Churn rate", summable: false },
];

interface AccountResult {
  workspaceId: string;
  workspaceName: string;
  engagementId: string;
  metrics: Record<string, number | null>;
  error?: string;
}

/**
 * Every other workspace on this account with a live, non-disconnected
 * Whop connection — the fan-out list for the rollup, resolved fresh on
 * every run rather than cached, since which workspaces are connected can
 * change between runs.
 */
async function listConnectedAccountWorkspaces(whopUserId: string): Promise<Array<{ workspaceId: string; workspaceName: string; engagementId: string }>> {
  const workspaces = await listWorkspaces(whopUserId);
  const results: Array<{ workspaceId: string; workspaceName: string; engagementId: string }> = [];

  for (const workspace of workspaces) {
    const engagementId = await getPrimaryEngagementIdForWorkspace(workspace.workspaceId);
    if (!engagementId) continue;
    const [connection] = await db
      .select({ engagementId: whopAgentConnections.engagementId, circuitBreakerState: whopAgentConnections.circuitBreakerState })
      .from(whopAgentConnections)
      .where(and(eq(whopAgentConnections.engagementId, engagementId), isNull(whopAgentConnections.disconnectedAt)))
      .limit(1);
    if (!connection || connection.circuitBreakerState === "open") continue;
    results.push({ workspaceId: workspace.workspaceId, workspaceName: workspace.name, engagementId });
  }
  return results;
}

export async function runPortfolioRollup(tenant: any, runId: string, step: StepTools | undefined): Promise<void> {
  const runningEngagementId = tenant.engagementId as string;
  const runStep = step
    ? <R,>(id: string, fn: () => Promise<R>) => step.run(id, fn)
    : <R,>(_id: string, fn: () => Promise<R>) => fn();

  try {
    const accounts = await runStep("list-connected-account-workspaces", () => listConnectedAccountWorkspaces(tenant.whopUserId));

    if (accounts.length === 0) {
      await finishRun(runId, {
        status: "skipped",
        summary: {
          whatWasAttempted: ["Looked for other connected Whop Agent workspaces on this account"],
          whatWorked: [],
          whatFailed: [],
          openItems: ["No connected Whop Agent workspaces found. Portfolio Rollup needs at least one."],
          decisionsMade: [],
        },
      });
      return;
    }

    await logStep(runId, { phase: "fan_out", status: "success", detail: `Found ${accounts.length} connected workspace(s): ${accounts.map((a) => a.workspaceName).join(", ")}` });

    const results: AccountResult[] = [];
    const missingByName: string[] = [];

    for (const account of accounts) {
      await logStep(runId, { phase: `account_${account.workspaceId}`, status: "running", detail: account.workspaceName });
      try {
        const client = await WhopAgentClient.forEngagement(account.engagementId);
        const metrics: Record<string, number | null> = {};
        const window = lastFullWeek(new Date());
        for (const metric of ROLLUP_METRICS) {
          const result = await runStep(`fetch-${account.workspaceId}-${metric.key}`, () => client.statsValue(metric.key, { ...window, interval: "week" }));
          metrics[metric.key] = result?.value ?? null;
        }
        results.push({ workspaceId: account.workspaceId, workspaceName: account.workspaceName, engagementId: account.engagementId, metrics });
        await logStep(runId, { phase: `account_${account.workspaceId}`, status: "success" });
      } catch (err) {
        // Section 5.5's fail-open table: "One account returns no data —
        // report includes accounts that returned; missing accounts
        // flagged by name." A 429 honoring the Try-again hint literally is
        // WhopAgentClient's own job (Section 5.5's rate-limit correction);
        // this catch is the report-level fallback if that still fails.
        const message = err instanceof Error ? err.message : String(err);
        missingByName.push(account.workspaceName);
        results.push({ workspaceId: account.workspaceId, workspaceName: account.workspaceName, engagementId: account.engagementId, metrics: {}, error: message });
        await logStep(runId, { phase: `account_${account.workspaceId}`, status: "failed", detail: message });
      }
    }

    const combined: Record<string, number> = {};
    for (const metric of ROLLUP_METRICS.filter((m) => m.summable)) {
      combined[metric.key] = results.reduce((sum, r) => sum + (r.metrics[metric.key] ?? 0), 0);
    }

    const revenueShare = results
      .filter((r) => !r.error)
      .map((r) => ({
        workspaceName: r.workspaceName,
        share: combined.netRevenue > 0 ? ((r.metrics.netRevenue ?? 0) / combined.netRevenue) * 100 : 0,
      }));

    const weekStart = startOfWeek(new Date());
    const blocks: WorkerReportBlock[] = ROLLUP_METRICS.filter((m) => m.summable).map((metric) => ({
      workerId: "whop-portfolio-rollup",
      label: metric.label,
      value: combined[metric.key],
      // Whop reports money as decimal amounts, not cents.
      displayValue: formatMetricValue(combined[metric.key], WHOP_METRICS[metric.key].unit),
    }));

    const prior = await runStep("load-prior-portfolio-snapshot", () => getPriorSnapshot(runningEngagementId, weekStart));
    await runStep("record-portfolio-snapshot", () => recordWeeklySnapshot(runningEngagementId, weekStart, blocks));

    await finishRun(runId, {
      summary: {
        whatWasAttempted: [`Rolled up ${accounts.length} connected Whop Agent workspace(s)`],
        whatWorked: [
          ...blocks.map((b) => `${b.label}: ${b.displayValue}`),
          ...revenueShare.map((s) => `${s.workspaceName}: ${s.share.toFixed(1)}% of portfolio revenue`),
        ],
        whatFailed: missingByName.length ? [`Missing data for: ${missingByName.join(", ")}`] : [],
        openItems: [
          ...(prior ? [] : ["No prior-week portfolio snapshot yet. Deltas start next week."]),
          "Per-product breakdown across accounts not yet built. Needs the stats engine's breakdowns param on a receipts metric.",
        ],
        decisionsMade: [],
      },
    });
  } catch (err) {
    await failRun(runId, err).catch(() => {});
    throw err;
  }
}

export async function dispatchPortfolioRollupRun(engagementId: string): Promise<string> {
  const { inngest, skillRunExecute } = await import("@/lib/inngest");
  const runId = crypto.randomUUID();
  await startRun({ id: runId, engagementId, skillName: "whop-portfolio-rollup", phase: "fan_out", label: "Portfolio Rollup Report" });
  await inngest.send(skillRunExecute.create({ runId, engagementId, skillName: "whop-portfolio-rollup" }));
  return runId;
}
