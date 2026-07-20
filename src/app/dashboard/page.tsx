import { db } from "@/lib/db";
import { skillRuns, engagements, activeAlerts } from "@/models/schema";
import { getSession } from "@/lib/session";
import { eq, desc, sql, and } from "drizzle-orm";
import { LiveExecutionFeed } from "./live-execution-feed";
import { DASHBOARD_COPY as copy } from "@/lib/copy";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardPage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;

  // These five queries are all independent of each other — running them
  // sequentially (as this page previously did) meant paying for five DB
  // round trips back-to-back before anything could render. Promise.all
  // fires them concurrently over the same pooled connection instead, which
  // matters most exactly when this page is freshly mounting (e.g. right
  // after navigating back from Home) since there's no cached data to fall
  // back on while they resolve.
  const [
    userEngagements,
    criticalAlerts,
    totalRunsResult,
    runningCountResult,
    recentRunsRaw,
  ] = await Promise.all([
    db.select().from(engagements).where(eq(engagements.whopUserId, whopUserId)),

    db
      .select()
      .from(activeAlerts)
      .innerJoin(engagements, eq(activeAlerts.engagementId, engagements.engagementId))
      .where(
        and(
          eq(activeAlerts.severity, "critical"),
          eq(engagements.whopUserId, whopUserId)
        )
      ),

    db
      .select({ count: sql<number>`count(*)` })
      .from(skillRuns)
      .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
      .where(
        and(
          eq(engagements.whopUserId, whopUserId),
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
      .where(eq(engagements.whopUserId, whopUserId))
      .orderBy(desc(skillRuns.startedAt))
      .limit(8),
  ]);

  const completedActions = totalRunsResult[0]?.count ?? 0;
  const runningCount = Number(runningCountResult[0]?.count ?? 0);

  // LiveExecutionFeed (client component) expects startedAt as an ISO
  // string. Drizzle returns a native Date for the timestamp column —
  // convert at the server/client boundary instead of relying on whatever
  // the RSC flight protocol happens to do with raw Date props.
  const recentRuns = recentRunsRaw.map((r) => ({
    ...r,
    startedAt: r.startedAt.toISOString(),
  }));

  return (
    <div className="space-y-5 w-full text-zinc-600 dark:text-zinc-400 font-sans tracking-tight antialiased select-none px-1 transition-colors duration-200">

      {/* Header */}
      <div className="flex flex-col space-y-3 lg:flex-row lg:justify-between lg:items-center lg:space-y-0 border-b border-zinc-200 dark:border-zinc-900 pb-3">
        <div className="space-y-1">
          <h1 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 tracking-tight">
            {copy.pageTitle}
          </h1>
          <p className="text-sm font-normal text-zinc-400 dark:text-zinc-500">
            {copy.pageSubtitle}
          </p>
        </div>

        {/* Quick links */}
        <div className="flex items-center space-x-1.5 self-start lg:self-auto text-sm">
          <Link
            href="/dashboard/engagements"
            className="px-2 py-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors text-xs font-mono"
          >
            {copy.accountsLink}
          </Link>
          <Link
            href="/dashboard/credentials"
            className="px-2 py-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors text-xs font-mono"
          >
            {copy.credentialsLink}
          </Link>
          <Link
            href="/dashboard/engagements/new"
            className="ml-2 inline-flex items-center px-3 py-1 text-xs border border-zinc-300 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 rounded hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors font-mono"
          >
            {copy.newClientButton}
          </Link>
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
          </div>

          <div className="space-y-1 sm:border-l border-zinc-200 dark:border-zinc-900 sm:pl-4">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">{copy.stat.automatedActions}</p>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-3xl font-light text-zinc-900 dark:text-zinc-100">{completedActions}</span>
              <span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">{copy.stat.automatedActionsUnit}</span>
            </div>
          </div>

          <div className="space-y-1 sm:border-l border-zinc-200 dark:border-zinc-900 sm:pl-4">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">{copy.stat.systemIntegrity}</p>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-light text-zinc-900 dark:text-zinc-100">{criticalAlerts.length}</span>
              <span className={`text-xs font-mono ${
                criticalAlerts.length > 0 ? "text-rose-600 dark:text-rose-400 font-bold" : "text-zinc-400 dark:text-zinc-600"
              }`}>
                {criticalAlerts.length > 0 ? copy.stat.systemIntegrityFound : copy.stat.systemIntegrityClear}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Activity feed */}
      <div className="pt-2">
        <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 mb-3 font-mono tracking-wider uppercase">
          {copy.activityLogSectionTitle}
        </p>

        <div className="pt-1 border-t border-zinc-200/60 dark:border-zinc-900/20">
          <LiveExecutionFeed initialRuns={recentRuns} />
        </div>
      </div>

      {/* Shortcuts */}
      {userEngagements.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 pt-4 border-t border-zinc-200 dark:border-zinc-900">
          <Link
            href="/dashboard/engagements"
            className="group block p-4 rounded-lg bg-zinc-100/50 dark:bg-zinc-900/10 border border-zinc-200 dark:border-zinc-900/60 hover:border-zinc-300 dark:hover:border-zinc-800 hover:bg-zinc-200/40 dark:hover:bg-zinc-900/20 transition-all shadow-sm"
          >
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-400 group-hover:text-zinc-900 group-hover:dark:text-zinc-100 transition-colors">
              {copy.shortcuts.manageEngagements.title} 
            </p>
            <p className="text-xs font-normal text-zinc-400 dark:text-zinc-600 mt-1">
              {copy.shortcuts.manageEngagements.description}
            </p>
          </Link>
          <Link
            href="/dashboard/credentials"
            className="group block p-4 rounded-lg bg-zinc-100/50 dark:bg-zinc-900/10 border border-zinc-200 dark:border-zinc-900/60 hover:border-zinc-300 dark:hover:border-zinc-800 hover:bg-zinc-200/40 dark:hover:bg-zinc-900/20 transition-all shadow-sm"
          >
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-400 group-hover:text-zinc-900 group-hover:dark:text-zinc-100 transition-colors">
              {copy.shortcuts.manageCredentials.title} 
            </p>
            <p className="text-xs font-normal text-zinc-400 dark:text-zinc-600 mt-1">
              {copy.shortcuts.manageCredentials.description}
            </p>
          </Link>
        </div>
      )}
    </div>
  );
}