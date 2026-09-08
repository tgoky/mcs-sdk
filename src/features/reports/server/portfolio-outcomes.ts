// src/features/reports/server/portfolio-outcomes.ts
//
// Phase 6 of the reports/analytics rework — the actual thing an agency
// owner running many clients would act on: which accounts need
// attention right now, not "is my automation running" (kept, smaller,
// further down the page). Scoped by whopUserId across every engagement
// this operator owns — the same scope /dashboard/analytics's own
// top-of-file query has always used (no workspaceId filter), so this
// isn't new cross-client plumbing, just a real use of data already
// being pulled into scope.

import { getEnabledWorkerIdsForEngagement } from "@/lib/engagement-skills";
import { getReportBlocksForEngagement, attachTrends, type ReportBlockWithTrend } from "@/lib/worker-report-blocks";
import { getPriorSnapshot } from "@/lib/client-metric-snapshots";
import { computeCorrelationFlags, type CorrelationFlag } from "@/lib/report-correlation";
import { startOfWeek } from "@/lib/dashboard-stats";

export interface PortfolioAccountOutcome {
  engagementId: string;
  buyer: string;
  weekBlocks: ReportBlockWithTrend[];
  correlationFlags: CorrelationFlag[];
  /** Any block reading negative/warning this week — the plain "something
   * here needs a look" signal, with or without a cross-product
   * correlation on top of it. */
  atRiskBlocks: ReportBlockWithTrend[];
}

/** One real per-account read for every engagement passed in — small
 * per-tenant query sets, run in parallel, same shape the per-client
 * report page already does for one client at a time. Fine at the scale
 * a single agency's client roster actually runs at; revisit with
 * batching if that stops being true. */
export async function getPortfolioOutcomes(
  engagements: { engagementId: string; buyer: string }[]
): Promise<PortfolioAccountOutcome[]> {
  const weekStart = startOfWeek(new Date());

  const results = await Promise.all(
    engagements.map(async ({ engagementId, buyer }) => {
      const enabledWorkerIds = await getEnabledWorkerIdsForEngagement(engagementId);
      const [rawBlocks, priorWeekSnapshot] = await Promise.all([
        getReportBlocksForEngagement(engagementId, enabledWorkerIds, { start: weekStart }),
        getPriorSnapshot(engagementId, weekStart),
      ]);
      const weekBlocks = attachTrends(rawBlocks, priorWeekSnapshot?.blocks ?? null);
      const correlationFlags = computeCorrelationFlags(weekBlocks);
      const atRiskBlocks = weekBlocks.filter((b) => b.tone === "negative" || b.tone === "warning");
      return { engagementId, buyer, weekBlocks, correlationFlags, atRiskBlocks };
    })
  );

  return results;
}
