import { db } from "@/lib/db";
import { engagements, skillRuns } from "@/models/schema";
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace, isPackageInstalledInWorkspace } from "@/lib/workspace";
import { getQueueItems } from "@/lib/queue";
import { skillIdsForProduct } from "@/lib/product-catalog";
import { getWeekWindows, weeklyTrendLabel, summarizeIssues } from "@/lib/dashboard-stats";
import { latestStepLabel } from "@/lib/run-display";
import { OverviewStatsPanel } from "../overview-stats-panel";
import { QueuePanel } from "../queue-panel";
import { LiveExecutionFeed } from "../live-execution-feed";
import { redirect } from "next/navigation";
import { Link } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SHOWTIME_SKILL_IDS = [...skillIdsForProduct("showtime")];

/**
 * Showtime's dashboard — its own primary-rail badge used to just redirect
 * straight into /dashboard/engagements, so clicking it never actually
 * landed on a "home" the way Work does. Reuses Work's own dashboard
 * pieces exactly (OverviewStatsPanel, QueuePanel, LiveExecutionFeed) —
 * same top-area "vibe" (active accounts / completed this week / issues,
 * each clickable to its own breakdown), scoped down to
 * SHOWTIME_SKILL_IDS and Showtime-enrolled clients (stack IS NOT NULL —
 * see engagements/page.tsx's own comment on why that's the signal)
 * instead of a second, differently-shaped stat row.
 */
export default async function ShowtimePage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const activeWorkspace = await getActiveWorkspace(whopUserId);
  const workspaceId = activeWorkspace.workspaceId;
  if (!(await isPackageInstalledInWorkspace(workspaceId, "showtime"))) redirect("/dashboard/library");

  const { thisWeekStart, lastWeekStart, lastWeekEnd } = getWeekWindows();
  const baseFilter = and(eq(engagements.whopUserId, whopUserId), eq(engagements.workspaceId, workspaceId), isNull(engagements.deletedAt));
  const showtimeFilter = and(baseFilter, isNotNull(engagements.stack));
  const runsBaseFilter = and(baseFilter, inArray(skillRuns.skillName, SHOWTIME_SKILL_IDS));

  const [
    showtimeClientRows,
    totalRunsResult,
    thisWeekResult,
    lastWeekResult,
    runningCountResult,
    recentCompletionsRaw,
    completedThisWeekBySkillRaw,
    queueItems,
    clientRows,
    runRows,
  ] = await Promise.all([
    db.select({ engagementId: engagements.engagementId, pausedAt: engagements.pausedAt }).from(engagements).where(showtimeFilter),
    db.select({ count: sql<number>`count(*)` }).from(skillRuns).innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId)).where(and(runsBaseFilter, eq(skillRuns.status, "success"))),
    db.select({ count: sql<number>`count(*)` }).from(skillRuns).innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId)).where(and(runsBaseFilter, eq(skillRuns.status, "success"), gte(skillRuns.completedAt, thisWeekStart))),
    db.select({ count: sql<number>`count(*)` }).from(skillRuns).innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId)).where(and(runsBaseFilter, eq(skillRuns.status, "success"), gte(skillRuns.completedAt, lastWeekStart), lt(skillRuns.completedAt, lastWeekEnd))),
    db.select({ count: sql<number>`count(*)` }).from(skillRuns).innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId)).where(and(runsBaseFilter, eq(skillRuns.status, "running"))),
    db
      .select({ id: skillRuns.id, skillName: skillRuns.skillName, engagementId: skillRuns.engagementId, buyerName: engagements.buyer, completedAt: skillRuns.completedAt, steps: skillRuns.steps })
      .from(skillRuns)
      .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
      .where(and(runsBaseFilter, eq(skillRuns.status, "success"), gte(skillRuns.completedAt, thisWeekStart)))
      .orderBy(desc(skillRuns.completedAt))
      .limit(8),
    db
      .select({ skillName: skillRuns.skillName, count: sql<number>`count(*)` })
      .from(skillRuns)
      .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
      .where(and(runsBaseFilter, eq(skillRuns.status, "success"), gte(skillRuns.completedAt, thisWeekStart)))
      .groupBy(skillRuns.skillName),
    getQueueItems(whopUserId, workspaceId, { skillIds: SHOWTIME_SKILL_IDS }),
    db.select({ engagementId: engagements.engagementId, buyer: engagements.buyer, pausedAt: engagements.pausedAt }).from(engagements).where(baseFilter),
    db
      .select({
        id: skillRuns.id,
        skillName: skillRuns.skillName,
        status: skillRuns.status,
        phase: skillRuns.phase,
        startedAt: skillRuns.startedAt,
        completedAt: skillRuns.completedAt,
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
      .where(and(baseFilter, inArray(skillRuns.skillName, SHOWTIME_SKILL_IDS)))
      .orderBy(desc(skillRuns.startedAt))
      .limit(8),
  ]);

  const completedThisWeek = Number(thisWeekResult[0]?.count ?? 0);
  const completedLastWeek = Number(lastWeekResult[0]?.count ?? 0);
  const issues = summarizeIssues(queueItems);
  const completedThisWeekBySkill = completedThisWeekBySkillRaw.map((r) => ({ skillName: r.skillName, count: Number(r.count) })).sort((a, b) => b.count - a.count);
  const recentCompletions = recentCompletionsRaw.map(({ steps, completedAt, ...rest }) => ({
    ...rest,
    completedAt: (completedAt ?? new Date()).toISOString(),
    subjectLabel: latestStepLabel(steps),
  }));

  const clients = clientRows.map((c) => ({ engagementId: c.engagementId, buyer: c.buyer, pausedAt: c.pausedAt ? c.pausedAt.toISOString() : null }));
  const runs = runRows.map(({ steps, startedAt, completedAt, engagementPausedAt, ...rest }) => ({
    ...rest,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt ? completedAt.toISOString() : null,
    engagementPausedAt: engagementPausedAt ? engagementPausedAt.toISOString() : null,
    subjectLabel: latestStepLabel(steps),
  }));

  return (
    <div className="relative min-h-screen w-full text-zinc-600 dark:text-zinc-400 font-sans tracking-tight antialiased select-none px-1 transition-colors duration-200 overflow-hidden pb-10">
      <div className="pointer-events-none absolute inset-0 z-0 bg-dot-grid" aria-hidden="true" />

      <div className="relative z-10 space-y-5">
        <div className="border-b border-zinc-200/80 dark:border-zinc-800/80 pb-4">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Showtime</h1>
          <p className="text-sm font-normal text-zinc-500 dark:text-zinc-400">Sales-execution overview for {activeWorkspace.name}.</p>
        </div>

        <OverviewStatsPanel
          activeAccountsCount={showtimeClientRows.length}
          runningCount={Number(runningCountResult[0]?.count ?? 0)}
          pausedCount={showtimeClientRows.filter((e) => e.pausedAt).length}
          completedThisWeek={completedThisWeek}
          completedAllTime={Number(totalRunsResult[0]?.count ?? 0)}
          weeklyTrend={weeklyTrendLabel(completedThisWeek, completedLastWeek)}
          completedThisWeekBySkill={completedThisWeekBySkill}
          recentCompletions={recentCompletions}
          issuesCount={issues.count}
          issuesBreakdown={issues.breakdown ?? null}
          queueItems={queueItems}
        />

        <div className="pt-2">
          <QueuePanel initialItems={queueItems} clients={clients} title="Queue" viewAllHref="/dashboard/queue?product=showtime" apiUrl="/api/queue?product=showtime" />
        </div>

        <div className="pt-2">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 font-mono tracking-wider uppercase">Executions</p>
            {runs.length > 0 && (
              <Link href="/dashboard/runs?product=showtime" className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 transition-colors">
                View all
              </Link>
            )}
          </div>
          <div className="pt-1 border-t border-zinc-200/60 dark:border-zinc-900/20">
            <LiveExecutionFeed initialRuns={runs} storageKey="showtime" apiUrl="/api/skill-runs/recent?product=showtime" />
          </div>
        </div>
      </div>
    </div>
  );
}
