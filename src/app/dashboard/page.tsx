// src/app/dashboard/page.tsx

import { db } from "@/lib/db";
import { skillRuns, engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getQueueItems } from "@/lib/queue";
import { eq, desc, sql, and, isNull, gte, lt } from "drizzle-orm";
import { getActiveWorkspace, getPrimaryEngagementIdForWorkspace, getInstalledPackagesByWorkspace } from "@/lib/workspace";
import { getEnabledWorkerIdsForEngagement } from "@/lib/engagement-skills";
import { getUnseenCompletedExecutionCount } from "@/lib/run-log"; // CHANGED: new import
import { UnreadExecutionsPill } from "./unread-executions-pill"; // CHANGED: new import
import { latestStepLabel } from "@/lib/run-display";
import { OverviewStatsPanel } from "./overview-stats-panel";
import { UnifiedActivityPanel } from "./unified-activity-panel";
import { mergeUnifiedActivity } from "@/lib/unified-activity";
import { DASHBOARD_COPY as copy } from "@/lib/copy";
import { getWeekWindows, weeklyTrendLabel, summarizeIssues } from "@/lib/dashboard-stats";
import Link from "next/link";
import { Calendar } from "lucide-react";
import { TourWelcomeNudge } from "@/components/tours/tour-welcome-nudge";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardPage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const activeWorkspace = await getActiveWorkspace(whopUserId);
  const workspaceId = activeWorkspace.workspaceId;

  const { thisWeekStart, lastWeekStart, lastWeekEnd } = getWeekWindows();

  // primaryEngagementId doesn't depend on anything the big query block
  // below produces, so it's kicked off as a sibling of it in one outer
  // Promise.all instead of only starting once that whole block resolves.
  const [
    [
      userEngagements,
      totalRunsResult,
      thisWeekResult,
      lastWeekResult,
      recentRunsRaw,
      queueItems,
      completedThisWeekBySkillRaw,
      recentCompletionsRaw,
      unseenCount, // CHANGED: new 9th slot — MUST stay positionally aligned with the 9th query below
    ],
    primaryEngagementId,
  ] = await Promise.all([
    Promise.all([
    db
      .select()
      .from(engagements)
      .where(
        and(
          eq(engagements.whopUserId, whopUserId),
          eq(engagements.workspaceId, workspaceId),
          isNull(engagements.deletedAt)
        )
      ),

    db
      .select({ count: sql<number>`count(*)` })
      .from(skillRuns)
      .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
      .where(
        and(
          eq(engagements.whopUserId, whopUserId),
          eq(engagements.workspaceId, workspaceId),
          eq(skillRuns.status, "success")
        )
      ),

    db
      .select({ count: sql<number>`count(*)` })
      .from(skillRuns)
      .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
      .where(
        and(
          eq(engagements.whopUserId, whopUserId),
          eq(engagements.workspaceId, workspaceId),
          eq(skillRuns.status, "success"),
          gte(skillRuns.completedAt, thisWeekStart)
        )
      ),

    db
      .select({ count: sql<number>`count(*)` })
      .from(skillRuns)
      .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
      .where(
        and(
          eq(engagements.whopUserId, whopUserId),
          eq(engagements.workspaceId, workspaceId),
          eq(skillRuns.status, "success"),
          gte(skillRuns.completedAt, lastWeekStart),
          lt(skillRuns.completedAt, lastWeekEnd)
        )
      ),

    db
      .select({
        id: skillRuns.id,
        skillName: skillRuns.skillName,
        status: skillRuns.status,
        phase: skillRuns.phase,
        startedAt: skillRuns.startedAt,
        engagementId: skillRuns.engagementId,
        buyerName: engagements.buyer,
        engagementPausedAt: engagements.pausedAt,
        errorMessage: skillRuns.errorMessage,
        steps: skillRuns.steps,
        stepCount: sql<number>`coalesce(jsonb_array_length(${skillRuns.steps}), 0)`,
        summary: skillRuns.summary,
      })
      .from(skillRuns)
      .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
      .where(and(eq(engagements.whopUserId, whopUserId), eq(engagements.workspaceId, workspaceId)))
      .orderBy(desc(skillRuns.startedAt))
      // Bumped from 8: this now backs the merged Queue+Activity panel
      // below (mergeUnifiedActivity), not just an 8-row feed preview —
      // needs enough recent runs for its own status/product filters to
      // have something to filter.
      .limit(50),

    getQueueItems(whopUserId, workspaceId),

    db
      .select({ skillName: skillRuns.skillName, count: sql<number>`count(*)` })
      .from(skillRuns)
      .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
      .where(
        and(
          eq(engagements.whopUserId, whopUserId),
          eq(engagements.workspaceId, workspaceId),
          eq(skillRuns.status, "success"),
          gte(skillRuns.completedAt, thisWeekStart)
        )
      )
      .groupBy(skillRuns.skillName),

    db
      .select({
        id: skillRuns.id,
        skillName: skillRuns.skillName,
        engagementId: skillRuns.engagementId,
        buyerName: engagements.buyer,
        completedAt: skillRuns.completedAt,
        steps: skillRuns.steps,
      })
      .from(skillRuns)
      .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
      .where(
        and(
          eq(engagements.whopUserId, whopUserId),
          eq(engagements.workspaceId, workspaceId),
          eq(skillRuns.status, "success"),
          gte(skillRuns.completedAt, thisWeekStart)
        )
      )
      .orderBy(desc(skillRuns.completedAt))
      .limit(8),

    // CHANGED: new 9th query — pairs with `unseenCount` above.
   getUnseenCompletedExecutionCount(whopUserId, workspaceId),
    ]),
    getPrimaryEngagementIdForWorkspace(workspaceId),
  ]);

  // For the welcome modal only — lets it tell a workspace that already
  // picked products at creation (or already has a worker running) apart
  // from a genuinely blank one, instead of always pointing at "set up
  // your first worker" regardless of what's actually true.
  const [installedPackagesByWorkspace, enabledWorkerIds] = await Promise.all([
    getInstalledPackagesByWorkspace([workspaceId]),
    primaryEngagementId ? getEnabledWorkerIdsForEngagement(primaryEngagementId) : Promise.resolve([]),
  ]);
  const installedProductIds = installedPackagesByWorkspace.get(workspaceId) ?? [];

  const completedThisWeek = Number(thisWeekResult[0]?.count ?? 0);
  const completedLastWeek = Number(lastWeekResult[0]?.count ?? 0);
  const completedAllTime = Number(totalRunsResult[0]?.count ?? 0);
  const weeklyTrend = weeklyTrendLabel(completedThisWeek, completedLastWeek);
  const issues = summarizeIssues(queueItems);

  const completedThisWeekBySkill = completedThisWeekBySkillRaw
    .map((r) => ({ skillName: r.skillName, count: Number(r.count) }))
    .sort((a, b) => b.count - a.count);

  const recentCompletions = recentCompletionsRaw.map(({ steps, completedAt, ...rest }) => ({
    ...rest,
    completedAt: (completedAt ?? new Date()).toISOString(),
    subjectLabel: latestStepLabel(steps),
  }));

  const clients = userEngagements.map((e) => ({
    engagementId: e.engagementId,
    buyer: e.buyer,
    pausedAt: e.pausedAt ? e.pausedAt.toISOString() : null,
  }));

  const recentRuns = recentRunsRaw.map(({ steps, startedAt, engagementPausedAt, ...rest }) => ({
    ...rest,
    startedAt: startedAt.toISOString(),
    engagementPausedAt: engagementPausedAt ? engagementPausedAt.toISOString() : null,
    subjectLabel: latestStepLabel(steps),
  }));

  const { items: activityItems, counts: activityCounts } = mergeUnifiedActivity(queueItems, recentRuns);

  const formattedDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="relative min-h-screen w-full text-zinc-600 dark:text-zinc-400 font-sans tracking-tight antialiased select-none px-1 transition-colors duration-200 overflow-hidden pb-10">

      {/* --- HYPER-MICRO TIGHT DOT GRID (0.5px / 6px grid) --- */}
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-dot-grid"
        aria-hidden="true"
      />

      {/* --- DASHBOARD CONTENT --- */}
      <div className="relative z-10 space-y-5">

        {/* Premium Header */}
        {/* CHANGED: added `relative` so the unread pill can absolutely center against this row */}
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-200/80 dark:border-zinc-800/80 pb-4">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              {copy.pageTitle}
            </h1>
            <p className="text-sm font-normal text-zinc-500 dark:text-zinc-400">
              {copy.pageSubtitle}
            </p>
          </div>

          {/* CHANGED: TOP-CENTER UNREAD PILL — absolute-centers over the header row at sm+;
              stacks naturally below the subtitle on mobile. Component itself hides at count <= 0,
              so the outer check is just a cheap way to skip the wrapper node entirely. */}
          {unseenCount > 0 && (
            <div className="sm:absolute sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2">
              <UnreadExecutionsPill count={unseenCount} targetId="live-executions-section" />
            </div>
          )}

          {/* Date Display */}
          <div className="inline-flex items-center gap-2 self-start sm:self-auto px-3 py-1.5 text-xs font-mono font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100/80 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 rounded-md shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
            <span>{formattedDate}</span>
          </div>
        </div>

        <TourWelcomeNudge installedProductIds={installedProductIds} hasEnabledAnyWorker={enabledWorkerIds.length > 0} />

        {/* Overview stats */}
        <div data-tour="dashboard-overview-stats">
          <OverviewStatsPanel
            completedThisWeek={completedThisWeek}
            completedAllTime={completedAllTime}
            weeklyTrend={weeklyTrend}
            completedThisWeekBySkill={completedThisWeekBySkill}
            recentCompletions={recentCompletions}
            issuesCount={issues.count}
            issuesBreakdown={issues.breakdown ?? null}
            queueItems={queueItems}
          />
        </div>

        {/* Queue + Live Activity — merged into one filterable panel
            (mergeUnifiedActivity) instead of two stacked sections a user
            had to scroll past each other to see. id + scroll-mt kept from
            the old Activity Feed section so UnreadExecutionsPill's
            scrollIntoView target still resolves; data-tour consolidated
            from dashboard-queue + dashboard-live-executions into one step
            (see tour-definitions.ts) since they're now the same element. */}
        <div className="pt-2 scroll-mt-20" id="live-executions-section" data-tour="dashboard-activity">
          <UnifiedActivityPanel items={activityItems} counts={activityCounts} clients={clients} title={copy.activityLogSectionTitle} />
        </div>

        {/* Shortcuts */}
        {primaryEngagementId && (
          <div className="grid gap-4 sm:grid-cols-2 pt-4 border-t border-zinc-200 dark:border-zinc-900">
            <Link
              href={`/dashboard/engagements/${primaryEngagementId}`}
              className="group block p-4 rounded-lg bg-zinc-100/50 dark:bg-zinc-900/10 border border-zinc-200 dark:border-zinc-900/60 hover:border-zinc-300 dark:hover:border-zinc-800 hover:bg-zinc-200/40 dark:hover:bg-zinc-900/20 transition-all shadow-xs"
            >
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-400 group-hover:text-zinc-900 group-hover:dark:text-zinc-100 transition-colors">
                {copy.shortcuts.manageEngagements.title}
              </p>
              <p className="text-xs font-normal text-zinc-400 dark:text-zinc-600 mt-1">
                {copy.shortcuts.manageEngagements.description}
              </p>
            </Link>
            <Link
              href="/dashboard/settings"
              className="group block p-4 rounded-lg bg-zinc-100/50 dark:bg-zinc-900/10 border border-zinc-200 dark:border-zinc-900/60 hover:border-zinc-300 dark:hover:border-zinc-800 hover:bg-zinc-200/40 dark:hover:bg-zinc-900/20 transition-all shadow-xs"
            >
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-400 group-hover:text-zinc-900 group-hover:dark:text-zinc-100 transition-colors">
                Settings & booking sync
              </p>
              <p className="text-xs font-normal text-zinc-400 dark:text-zinc-600 mt-1">
                Manage connected accounts, and switch any engagement between auto-polling and instant webhook sync.
              </p>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}