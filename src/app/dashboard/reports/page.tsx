// src/app/dashboard/reports/page.tsx
//
// Dynamic rebuild — replaces the old ClientReportCard/RepClientReportCard
// split (two components each hand-shaped around one product's fixed
// metric set, gated on unrelated flags, never both looked at together)
// with one merged view: whichever workers are actually enabled for this
// client each contribute their own real block (worker-report-blocks.ts),
// rendered together. A newly-enabled skill — Showtime, Reputation
// Manager, or a future third product — starts appearing here the first
// week it has data, with nothing on this page to touch.
//
// Trend ("+6pts vs last week") is real, not decorative: client_metric_
// snapshots (schema.ts) persists one row per engagement per week via the
// weeklySnapshotCron (src/inngest/crons.ts), so "This week" can compare
// against an actual prior week instead of three disconnected tab
// snapshots.

import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace, getPrimaryEngagementIdForWorkspace } from "@/lib/workspace";
import { getEnabledWorkerIdsForEngagement } from "@/lib/engagement-skills";
import { getReportBlocksForEngagement, attachTrends, type ReportBlockWithTrend } from "@/lib/worker-report-blocks";
import { getPriorSnapshot } from "@/lib/client-metric-snapshots";
import { startOfWeek } from "@/lib/dashboard-stats";
import type { ReportPeriod } from "@/features/reports/server/report-service";
import { getRecentAccountReviews } from "@/features/reports/server/account-advisor";
import { DynamicClientReport } from "@/components/reports/dynamic-client-report";
import { AccountAdvisorPanel } from "@/components/reports/account-advisor-panel";
import { FileText } from "lucide-react";

export const revalidate = 0;

function periodStart(period: ReportPeriod, reference: Date): Date | null {
  if (period === "week") return startOfWeek(reference);
  if (period === "month") return new Date(reference.getFullYear(), reference.getMonth(), 1);
  return null;
}

export default async function ReportsPage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const activeWorkspace = await getActiveWorkspace(whopUserId);
  const engagementId = await getPrimaryEngagementIdForWorkspace(activeWorkspace.workspaceId);

  const [engagement] = engagementId
    ? await db
        .select({ buyer: engagements.buyer, offerDetails: engagements.offerDetails })
        .from(engagements)
        .where(eq(engagements.engagementId, engagementId))
        .limit(1)
    : [];

  const enabledWorkerIds = engagementId ? await getEnabledWorkerIdsForEngagement(engagementId) : [];

  const now = new Date();
  const periods: ReportPeriod[] = ["week", "month", "all_time"];

  const [weekBlocks, monthBlocks, allTimeBlocks, priorWeekSnapshot] = engagementId
    ? await Promise.all([
        getReportBlocksForEngagement(engagementId, enabledWorkerIds, { start: periodStart("week", now) }),
        getReportBlocksForEngagement(engagementId, enabledWorkerIds, { start: periodStart("month", now) }),
        getReportBlocksForEngagement(engagementId, enabledWorkerIds, { start: periodStart("all_time", now) }),
        getPriorSnapshot(engagementId, startOfWeek(now)),
      ])
    : [[], [], [], null];

  const blocksByPeriod: Record<ReportPeriod, ReportBlockWithTrend[]> = {
    week: attachTrends(weekBlocks, priorWeekSnapshot?.blocks ?? null),
    // Trend is only meaningful week-over-week against the real snapshot
    // grain — month/all_time show the same real numbers, just without a
    // fabricated delta next to them.
    month: attachTrends(monthBlocks, null),
    all_time: attachTrends(allTimeBlocks, null),
  };

  const hasAnyBlocks = periods.some((p) => blocksByPeriod[p].length > 0);

  const recentReviews = engagementId ? await getRecentAccountReviews(engagementId) : [];
  const initialReviews = recentReviews.map((r) => ({ ...r, generatedAt: r.generatedAt.toISOString() }));

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Reports</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-2xl">
          How this client is doing, across whatever&apos;s enabled — Showtime, Reputation Manager, or both. Comparing
          across skills? See Analytics.
        </p>
      </div>

      {!engagement ? (
        <div className="text-center py-8">
          <FileText className="w-6 h-6 text-zinc-300 dark:text-zinc-700 mx-auto mb-2" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No client yet in this workspace.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{engagement.buyer}</p>

          {!hasAnyBlocks ? (
            <div className="text-center py-8">
              <FileText className="w-6 h-6 text-zinc-300 dark:text-zinc-700 mx-auto mb-2" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {engagement.buyer} doesn&apos;t have any enabled skills reporting data yet.
              </p>
            </div>
          ) : (
            <DynamicClientReport
              offerDetails={engagement.offerDetails as Record<string, string | boolean> | null}
              blocksByPeriod={blocksByPeriod}
            />
          )}

          {engagementId && (
            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800/80">
              <AccountAdvisorPanel engagementId={engagementId} initialReviews={initialReviews} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
