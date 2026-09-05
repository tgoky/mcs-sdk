import Link from "next/link";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import {
  engagements,
  repIdentityGraphs,
  repIncidents,
  skillRuns,
} from "@/models/schema";
import { and, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace, isPackageInstalledInWorkspace } from "@/lib/workspace";
import { getRepEnrolledEngagementIds } from "@/lib/rep-engagements";
import { getQueueItems } from "@/lib/queue";
import { skillIdsForProduct } from "@/lib/product-catalog";
import { getWeekWindows, weeklyTrendLabel, summarizeIssues } from "@/lib/dashboard-stats";
import { latestStepLabel } from "@/lib/run-display";
import { REP_SKILL_MANIFEST, type RepSkillId } from "@/lib/rep-skill-manifest";
import { OverviewStatsPanel } from "../overview-stats-panel";
import { QueuePanel } from "../queue-panel";
import { LiveExecutionFeed } from "../live-execution-feed";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const REP_SKILL_IDS_ARR = [...skillIdsForProduct("reputation-manager")];

/** OverviewStatsPanel calls its own skillName() lookup internally, which only knows Showtime's SKILL_INFO — falls back to whatever raw string it's given, so pre-resolving to the real display name here (instead of the raw skill id) is what makes that fallback show something readable for RM. */
function repSkillDisplayName(id: string): string {
  return REP_SKILL_MANIFEST[id as RepSkillId]?.name ?? id;
}

/**
 * Reputation Manager's dashboard. Reuses Work's own dashboard pieces
 * exactly (OverviewStatsPanel, QueuePanel, LiveExecutionFeed) — same
 * top-area "vibe" (active accounts / completed this week / issues, each
 * clickable to its own breakdown) — scoped to REP_SKILL_IDS and RM-
 * enrolled clients instead of a bespoke, differently-shaped stat row.
 * Recent incidents is the one section with no Work equivalent (rep-
 * crisis-response's own output, rep_incidents) — real RM-only content,
 * not a stand-in for anything Work already shows.
 */
export default async function ReputationManagerHomePage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const activeWorkspace = await getActiveWorkspace(whopUserId);
  const workspaceId = activeWorkspace.workspaceId;
  if (!(await isPackageInstalledInWorkspace(workspaceId, "reputation-manager"))) {
    redirect("/dashboard/library");
  }

  const engagementIds = await getRepEnrolledEngagementIds(whopUserId, workspaceId);
  const { thisWeekStart, lastWeekStart, lastWeekEnd } = getWeekWindows();
  const baseFilter = and(eq(engagements.whopUserId, whopUserId), eq(engagements.workspaceId, workspaceId), isNull(engagements.deletedAt));
  const runsBaseFilter = and(baseFilter, inArray(skillRuns.skillName, REP_SKILL_IDS_ARR));

  const [
    repClientRows,
    totalRunsResult,
    thisWeekResult,
    lastWeekResult,
    runningCountResult,
    recentCompletionsRaw,
    completedThisWeekBySkillRaw,
    recentIncidents,
    queueItems,
    clientRows,
    runRows,
  ] = await Promise.all([
    db
      .select({ engagementId: engagements.engagementId, pausedAt: engagements.pausedAt })
      .from(repIdentityGraphs)
      .innerJoin(engagements, eq(repIdentityGraphs.engagementId, engagements.engagementId))
      .where(baseFilter),
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
    engagementIds.length
      ? db
          .select({ id: repIncidents.id, engagementId: repIncidents.engagementId, severityScore: repIncidents.severityScore, summary: repIncidents.summary, status: repIncidents.status, buyer: engagements.buyer })
          .from(repIncidents)
          .innerJoin(engagements, eq(engagements.engagementId, repIncidents.engagementId))
          .where(and(inArray(repIncidents.engagementId, engagementIds), eq(repIncidents.status, "open")))
          .orderBy(desc(repIncidents.declaredAt))
          .limit(3)
      : [],
    getQueueItems(whopUserId, workspaceId, { skillIds: REP_SKILL_IDS_ARR }),
    // Bug fix: this was querying every engagement in the workspace with
    // no RM scope at all — a leftover from copying Work's own dashboard
    // page, which is right for Work (every engagement belongs there) but
    // wrong here (most workspace engagements were never onboarded onto
    // RM — see rep-engagements.ts). Left unscoped, a pure Showtime
    // client would show up as a filter option in this page's own Queue
    // panel, which makes no sense on a page scoped to Reputation Manager.
    engagementIds.length
      ? db
          .select({ engagementId: engagements.engagementId, buyer: engagements.buyer, pausedAt: engagements.pausedAt })
          .from(engagements)
          .where(and(baseFilter, inArray(engagements.engagementId, engagementIds)))
      : [],
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
      .where(and(baseFilter, inArray(skillRuns.skillName, REP_SKILL_IDS_ARR)))
      .orderBy(desc(skillRuns.startedAt))
      .limit(8),
  ]);

  const completedThisWeek = Number(thisWeekResult[0]?.count ?? 0);
  const completedLastWeek = Number(lastWeekResult[0]?.count ?? 0);
  const issues = summarizeIssues(queueItems);
  const completedThisWeekBySkill = completedThisWeekBySkillRaw
    .map((r) => ({ skillName: repSkillDisplayName(r.skillName), count: Number(r.count) }))
    .sort((a, b) => b.count - a.count);
  const recentCompletions = recentCompletionsRaw.map(({ steps, completedAt, skillName, ...rest }) => ({
    ...rest,
    skillName: repSkillDisplayName(skillName),
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
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Reputation Manager</h1>
          <p className="text-sm font-normal text-zinc-500 dark:text-zinc-400">Monitoring overview for {activeWorkspace.name}.</p>
        </div>

        <OverviewStatsPanel
          activeAccountsCount={repClientRows.length}
          runningCount={Number(runningCountResult[0]?.count ?? 0)}
          pausedCount={repClientRows.filter((e) => e.pausedAt).length}
          completedThisWeek={completedThisWeek}
          completedAllTime={Number(totalRunsResult[0]?.count ?? 0)}
          weeklyTrend={weeklyTrendLabel(completedThisWeek, completedLastWeek)}
          completedThisWeekBySkill={completedThisWeekBySkill}
          recentCompletions={recentCompletions}
          issuesCount={issues.count}
          issuesBreakdown={issues.breakdown ?? null}
          queueItems={queueItems}
        />

        {recentIncidents.length > 0 ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 font-mono tracking-wider uppercase">Open incidents</p>
              <Link href="/dashboard/reputation-manager/incidents" className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 transition-colors">
                View all
              </Link>
            </div>
            <div className="space-y-1.5">
              {recentIncidents.map((incident) => (
                <Link
                  key={incident.id}
                  href={`/dashboard/engagements/${incident.engagementId}`}
                  className="flex items-center gap-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 bg-white dark:bg-zinc-900/60 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                >
                  <AlertTriangle className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{incident.buyer}</p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{incident.summary}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          repClientRows.length > 0 && (
            <p className="flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> No open incidents across any monitored client.
            </p>
          )
        )}

        <div className="pt-2">
          <QueuePanel initialItems={queueItems} clients={clients} title="Queue" viewAllHref="/dashboard/queue?product=reputation-manager" apiUrl="/api/queue?product=reputation-manager" />
        </div>

        <div className="pt-2">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 font-mono tracking-wider uppercase">Executions</p>
            {runs.length > 0 && (
              <Link href="/dashboard/runs?product=reputation-manager" className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 transition-colors">
                View all
              </Link>
            )}
          </div>
          <div className="pt-1 border-t border-zinc-200/60 dark:border-zinc-900/20">
            <LiveExecutionFeed initialRuns={runs} storageKey="reputation-manager" apiUrl="/api/skill-runs/recent?product=reputation-manager" />
          </div>
        </div>
      </div>
    </div>
  );
}
