import Link from "next/link";
import { ArrowRight, Building2 } from "lucide-react";
import { db } from "@/lib/db";
import { engagements, skillRuns } from "@/models/schema";
import { and, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace, isPackageInstalledInWorkspace } from "@/lib/workspace";
import { getQueueItems } from "@/lib/queue";
import { skillIdsForProduct } from "@/lib/product-catalog";
import { getWeekWindows } from "@/lib/dashboard-stats";
import { latestStepLabel } from "@/lib/run-display";
import { QueuePanel } from "../queue-panel";
import { LiveExecutionFeed } from "../live-execution-feed";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SHOWTIME_SKILL_IDS = [...skillIdsForProduct("showtime")];

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900/60">
      <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{label}</p>
      <p className="text-2xl font-bold mt-1 text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  );
}

/**
 * Showtime's dashboard — its own primary-rail badge used to just redirect
 * straight into /dashboard/engagements, so clicking it never actually
 * landed on a "home" the way Work and (now) Reputation Manager do. Same
 * shell and the same QueuePanel/LiveExecutionFeed as Work's own dashboard
 * and Reputation Manager's, scoped to SHOWTIME_SKILL_IDS / Showtime-
 * enrolled clients (stack IS NOT NULL — see engagements/page.tsx's own
 * comment on why that's the Showtime-enrollment signal) instead of
 * duplicating Work's combined numbers.
 */
export default async function ShowtimePage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const activeWorkspace = await getActiveWorkspace(whopUserId);
  const workspaceId = activeWorkspace.workspaceId;
  if (!(await isPackageInstalledInWorkspace(workspaceId, "showtime"))) redirect("/dashboard/library");

  const { thisWeekStart } = getWeekWindows();
  const baseFilter = and(eq(engagements.whopUserId, whopUserId), eq(engagements.workspaceId, workspaceId), isNull(engagements.deletedAt));

  const [showtimeClients, showtimeClientCountResult, runningCountResult, completedThisWeekResult, queueItems, clientRows, runRows] = await Promise.all([
    db.select({ engagementId: engagements.engagementId, buyer: engagements.buyer, label: engagements.label, createdAt: engagements.createdAt }).from(engagements).where(and(baseFilter, isNotNull(engagements.stack))).orderBy(desc(engagements.createdAt)).limit(5),
    db.select({ count: sql<number>`count(*)` }).from(engagements).where(and(baseFilter, isNotNull(engagements.stack))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(skillRuns)
      .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
      .where(and(baseFilter, inArray(skillRuns.skillName, SHOWTIME_SKILL_IDS), eq(skillRuns.status, "running"))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(skillRuns)
      .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
      .where(and(baseFilter, inArray(skillRuns.skillName, SHOWTIME_SKILL_IDS), eq(skillRuns.status, "success"), gte(skillRuns.completedAt, thisWeekStart))),
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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-200/80 dark:border-zinc-800/80 pb-4">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Showtime</h1>
            <p className="text-sm font-normal text-zinc-500 dark:text-zinc-400">Sales-execution overview for {activeWorkspace.name}.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard label="Clients" value={Number(showtimeClientCountResult[0]?.count ?? 0)} />
          <StatCard label="Running now" value={Number(runningCountResult[0]?.count ?? 0)} />
          <StatCard label="Completed this week" value={Number(completedThisWeekResult[0]?.count ?? 0)} />
        </div>

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

        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-900">
          <div className="flex items-center justify-between mb-2 pt-2">
            <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 font-mono tracking-wider uppercase">Clients</p>
            {showtimeClients.length > 0 && (
              <Link href="/dashboard/engagements?product=showtime" className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 transition-colors flex items-center gap-1">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </div>

          {showtimeClients.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 p-10 text-center">
              <Building2 className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">Add your first client to start running Showtime's skills.</p>
              <Link
                href="/dashboard/engagements/new"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer border bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Add Client
              </Link>
            </div>
          ) : (
            <div className="space-y-1.5">
              {showtimeClients.map((row) => (
                <Link
                  key={row.engagementId}
                  href={`/dashboard/engagements/${row.engagementId}`}
                  className="flex items-center justify-between rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5 bg-white dark:bg-zinc-900/60 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">{row.buyer}</p>
                    {row.label && <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">{row.label}</p>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
