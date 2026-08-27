// src/app/dashboard/page.tsx

import { db } from "@/lib/db";
import { skillRuns, engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getQueueItems } from "@/lib/queue";
import { eq, desc, sql, and, isNull, gte, lt } from "drizzle-orm";
import { getActiveWorkspace } from "@/lib/workspace";
import { getUnseenCompletedExecutionCount } from "@/lib/run-log"; // CHANGED: new import
import { LiveExecutionFeed } from "./live-execution-feed";
import { UnreadExecutionsPill } from "./unread-executions-pill"; // CHANGED: new import
import { latestStepLabel } from "@/lib/run-display";
import { QueuePanel } from "./queue-panel";
import { OverviewStatsPanel } from "./overview-stats-panel";
import { DASHBOARD_COPY as copy } from "@/lib/copy";
import { getWeekWindows, weeklyTrendLabel, summarizeIssues } from "@/lib/dashboard-stats";
import Link from "next/link";
import { Calendar } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardPage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const activeWorkspace = await getActiveWorkspace(whopUserId);
  const workspaceId = activeWorkspace.workspaceId;

  const { thisWeekStart, lastWeekStart, lastWeekEnd } = getWeekWindows();

  const [
    userEngagements,
    totalRunsResult,
    thisWeekResult,
    lastWeekResult,
    runningCountResult,
    recentRunsRaw,
    queueItems,
    completedThisWeekBySkillRaw,
    recentCompletionsRaw,
    unseenCount, // CHANGED: new 10th slot — MUST stay positionally aligned with the 10th query below
  ] = await Promise.all([
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
      .select({ count: sql<number>`count(*)` })
      .from(skillRuns)
      .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
      .where(
        and(
          eq(engagements.whopUserId, whopUserId),
          eq(engagements.workspaceId, workspaceId),
          eq(skillRuns.status, "running")
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
      .limit(8),

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

    // CHANGED: new 10th query — pairs with `unseenCount` above.
    getUnseenCompletedExecutionCount(whopUserId),
  ]);

  const completedThisWeek = Number(thisWeekResult[0]?.count ?? 0);
  const completedLastWeek = Number(lastWeekResult[0]?.count ?? 0);
  const completedAllTime = Number(totalRunsResult[0]?.count ?? 0);
  const weeklyTrend = weeklyTrendLabel(completedThisWeek, completedLastWeek);
  const runningCount = Number(runningCountResult[0]?.count ?? 0);
  const pausedCount = userEngagements.filter((e) => e.pausedAt).length;
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

        {/* Overview stats */}
        <OverviewStatsPanel
          activeAccountsCount={userEngagements.length}
          runningCount={runningCount}
          pausedCount={pausedCount}
          completedThisWeek={completedThisWeek}
          completedAllTime={completedAllTime}
          weeklyTrend={weeklyTrend}
          completedThisWeekBySkill={completedThisWeekBySkill}
          recentCompletions={recentCompletions}
          issuesCount={issues.count}
          issuesBreakdown={issues.breakdown ?? null}
          queueItems={queueItems}
        />

        {/* Queue */}
        <div className="pt-2">
          <QueuePanel initialItems={queueItems} clients={clients} title="Queue" viewAllHref="/dashboard/queue" />
        </div>

        {/* Activity feed */}
        {/* CHANGED: id + scroll-mt so the pill's scrollIntoView lands correctly even
            under any future sticky/fixed nav; unseenCount seeds the highlight state */}
        <div className="pt-2 scroll-mt-20" id="live-executions-section">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 font-mono tracking-wider uppercase">
              {copy.activityLogSectionTitle}
            </p>
            {recentRuns.length > 0 && (
              <Link
                href="/dashboard/runs"
                className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 transition-colors"
              >
                View all
              </Link>
            )}
          </div>

          <div className="pt-1 border-t border-zinc-200/60 dark:border-zinc-900/20">
            <LiveExecutionFeed
              initialRuns={recentRuns}
              storageKey="overview"
              unseenCount={unseenCount}
            />
          </div>
        </div>

        {/* Shortcuts */}
        {userEngagements.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 pt-4 border-t border-zinc-200 dark:border-zinc-900">
            <Link
              href="/dashboard/engagements"
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