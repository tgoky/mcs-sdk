import { db } from "@/lib/db";
import { skillRuns, engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getQueueItems } from "@/lib/queue";
import { eq, desc, sql, and, isNull, gte, lt } from "drizzle-orm";
import { getActiveWorkspace } from "@/lib/workspace";
import { LiveExecutionFeed } from "./live-execution-feed";
import { QueuePanel } from "./queue-panel";
import { DASHBOARD_COPY as copy } from "@/lib/copy";
import { getWeekWindows, weeklyTrendLabel, summarizeIssues } from "@/lib/dashboard-stats";
import Link from "next/link";
import { Calendar
 } from "lucide-react";

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

    // All-time total — kept as quiet secondary context under the weekly
    // number below, not the headline anymore (see automatedActionsAllTime).
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

    // This week's completions (Mon 00:00 → now) — the headline number.
    // Resets on its own every Monday since it's always a live window,
    // never a stored/accumulated counter.
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

    // Same Mon–Sun window, one week back — the only baseline this week's
    // number can be meaningfully compared against (see weeklyTrendLabel).
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
      })
      .from(skillRuns)
      .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
      .where(and(eq(engagements.whopUserId, whopUserId), eq(engagements.workspaceId, workspaceId)))
      .orderBy(desc(skillRuns.startedAt))
      .limit(8),

    // Already the tenant's real "needs a human" feed (pending approvals,
    // open blockers, run failures, credential-health alerts) — reused
    // below for the Issues stat instead of the near-always-empty
    // active_alerts rule-definitions table. See summarizeIssues().
    getQueueItems(whopUserId, workspaceId),
  ]);

  const completedThisWeek = Number(thisWeekResult[0]?.count ?? 0);
  const completedLastWeek = Number(lastWeekResult[0]?.count ?? 0);
  const completedAllTime = Number(totalRunsResult[0]?.count ?? 0);
  const weeklyTrend = weeklyTrendLabel(completedThisWeek, completedLastWeek);
  const runningCount = Number(runningCountResult[0]?.count ?? 0);
  const pausedCount = userEngagements.filter((e) => e.pausedAt).length;
  const issues = summarizeIssues(queueItems);

  const clients = userEngagements.map((e) => ({
    engagementId: e.engagementId,
    buyer: e.buyer,
    pausedAt: e.pausedAt ? e.pausedAt.toISOString() : null,
  }));

  const recentRuns = recentRunsRaw.map((r) => ({
    ...r,
    startedAt: r.startedAt.toISOString(),
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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-200/80 dark:border-zinc-800/80 pb-4">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              {copy.pageTitle}
            </h1>
            <p className="text-sm font-normal text-zinc-500 dark:text-zinc-400">
              {copy.pageSubtitle}
            </p>
          </div>

          {/* Date Display */}
          <div className="inline-flex items-center gap-2 self-start sm:self-auto px-3 py-1.5 text-xs font-mono font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100/80 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 rounded-md shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
            <span>{formattedDate}</span>
          </div>
        </div>

        {/* Overview stats */}
        <div className="border-b border-zinc-200 dark:border-zinc-900 pb-4">
          <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 mb-3 font-mono tracking-wider uppercase">
            {copy.overviewSectionTitle}
          </p>

          <div className="grid gap-4 sm:grid-cols-3 pt-1 border-t border-zinc-200/60 dark:border-zinc-900/20">
            <div className="space-y-1">
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">{copy.stat.activeAccounts}</p>
              <div className="flex items-baseline space-x-2">
                <span className="text-3xl font-light text-zinc-900 dark:text-zinc-100">{userEngagements.length}</span>
                <span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">
                  {runningCount > 0 ? copy.stat.activeAccountsRunning(runningCount) : copy.stat.activeAccountsAllGood}
                </span>
              </div>
              {pausedCount > 0 && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 font-mono">
                  {copy.stat.activeAccountsPaused(pausedCount)}
                </p>
              )}
            </div>

            <div className="space-y-1 sm:border-l border-zinc-200 dark:border-zinc-900 sm:pl-4">
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                {copy.stat.automatedActions} <span className="text-zinc-400 dark:text-zinc-600">· {copy.stat.automatedActionsThisWeek}</span>
              </p>
              <div className="flex items-baseline space-x-1.5">
                <span className="text-3xl font-light text-zinc-900 dark:text-zinc-100">{completedThisWeek}</span>
                <span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">{copy.stat.automatedActionsUnit}</span>
              </div>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">
                {weeklyTrend ?? "No completions yet this week"} · {copy.stat.automatedActionsAllTime(completedAllTime)}
              </p>
            </div>

            <div className="space-y-1 sm:border-l border-zinc-200 dark:border-zinc-900 sm:pl-4">
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">{copy.stat.systemIntegrity}</p>
              <div className="flex items-baseline space-x-2">
                <span className="text-3xl font-light text-zinc-900 dark:text-zinc-100">{issues.count}</span>
                <span className={`text-xs font-mono ${
                  issues.count > 0 ? "text-rose-600 dark:text-rose-400 font-bold" : "text-zinc-400 dark:text-zinc-600"
                }`}>
                  {issues.count > 0 ? copy.stat.systemIntegrityFound : copy.stat.systemIntegrityClear}
                </span>
              </div>
              {issues.breakdown && (
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">{issues.breakdown}</p>
              )}
            </div>
          </div>
        </div>

        {/* Queue */}
        <div className="pt-2">
          <QueuePanel initialItems={queueItems} clients={clients} title="Queue" viewAllHref="/dashboard/queue" />
        </div>

        {/* Activity feed */}
        <div className="pt-2">
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
            <LiveExecutionFeed initialRuns={recentRuns} storageKey="overview" />
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