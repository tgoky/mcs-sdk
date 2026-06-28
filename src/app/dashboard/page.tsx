import { db } from "@/lib/db";
import { skillRuns, engagements, activeAlerts } from "@/models/schema";
import { getSession } from "@/lib/session";
import { eq, desc, sql, and } from "drizzle-orm";
import { LiveExecutionFeed } from "./live-execution-feed";

export const revalidate = 0;

export default async function TelemetryHubPage() {
  const session = await getSession();

  const userEngagements = await db
    .select()
    .from(engagements)
    .where(eq(engagements.whopUserId, session.whopUserId!));

  const criticalAlerts = await db
    .select()
    .from(activeAlerts)
    .where(eq(activeAlerts.severity, "critical"));

  // PRODUCT UPDATE: Count total processed automation tasks instead of showing internal billing
  const totalRunsResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(skillRuns)
    .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
    .where(
      and(
        eq(engagements.whopUserId, session.whopUserId!),
        eq(skillRuns.status, "success")
      )
    );

  const completedActions = totalRunsResult[0]?.count ?? 0;

  const runningCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(skillRuns)
    .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
    .where(
      and(
        eq(engagements.whopUserId, session.whopUserId!), 
        eq(skillRuns.status, "running")
      )
    )
    .then((r) => Number(r[0]?.count ?? 0));

  const recentRuns = await db
    .select({
      id: skillRuns.id,
      skillName: skillRuns.skillName,
      status: skillRuns.status,
      phase: skillRuns.phase,
      startedAt: skillRuns.startedAt,
    })
    .from(skillRuns)
    .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
    .where(eq(engagements.whopUserId, session.whopUserId!))
    .orderBy(desc(skillRuns.startedAt))
    .limit(8);

  return (
    <div className="space-y-10 max-w-5xl tracking-tight">
      {/* Header */}
      <div className="flex flex-col space-y-4 sm:flex-row sm:justify-between sm:items-center sm:space-y-0 border-b border-zinc-900 pb-5">
        <div>
          <h1 className="text-lg font-medium text-zinc-100 tracking-tight">
            System Telemetry Node
          </h1>
          <p className="text-xs font-normal text-zinc-500 mt-0.5">
            Real-time execution performance and automated revenue infrastructure state.
          </p>
        </div>
        <a
          href="/dashboard/engagements/new"
          className="inline-flex items-center px-3 py-1.5 text-[11px] font-sans font-medium bg-zinc-100 text-zinc-950 rounded hover:bg-zinc-200 transition-colors"
        >
          Initialize Setup
        </a>
      </div>

      {/* Flat Minimalist Stat Layout */}
      <div className="grid gap-6 sm:grid-cols-3">
        <div className="space-y-1.5 px-1">
          <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
            Active Accounts
          </p>
          <div className="flex items-baseline space-x-3">
            <span className="text-3xl font-light font-sans text-zinc-100">
              {userEngagements.length}
            </span>
            <span className="text-[10px] font-mono text-zinc-500 uppercase">
              {runningCount > 0 ? `${runningCount} running` : "nominal"}
            </span>
          </div>
        </div>

        {/* SWAPPED: Spent dollars changed to value-centric AI Actions Executed */}
        <div className="space-y-1.5 px-1 sm:border-l sm:border-zinc-900 sm:pl-6">
          <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
            Automated  Actions
          </p>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-light font-sans text-zinc-100">
              {completedActions}
            </span>
            <span className="text-[10px] font-mono text-zinc-500 uppercase">Tasks</span>
          </div>
        </div>

        <div className="space-y-1.5 px-1 sm:border-l sm:border-zinc-900 sm:pl-6">
          <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
            System Integrity
          </p>
          <div className="flex items-baseline space-x-3">
            <span className="text-3xl font-light font-sans text-zinc-100">
              {criticalAlerts.length}
            </span>
            <span
              className={`text-[10px] font-mono uppercase tracking-wide ${
                criticalAlerts.length > 0 ? "text-rose-400" : "text-zinc-500"
              }`}
            >
              {criticalAlerts.length > 0 ? "Attention Required" : "Zero Errors"}
            </span>
          </div>
        </div>
      </div>

      {/* Execution Log */}
      <div className="space-y-4 pt-4">
        <div>
          <h2 className="text-sm font-medium text-zinc-200">Execution Log Feed</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Live pipeline stream parsing current automation runs.
          </p>
        </div>
        <LiveExecutionFeed initialRuns={recentRuns} />
      </div>

      {/* Quick Links */}
      {userEngagements.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 pt-4 border-t border-zinc-900">
          <a
            href="/dashboard/engagements"
            className="group block p-4 rounded-lg bg-zinc-900/10 border border-zinc-900/60 hover:border-zinc-800 hover:bg-zinc-900/20 transition-all"
          >
            <p className="text-xs font-medium text-zinc-300 group-hover:text-zinc-100 transition-colors">
              Manage Active Engagements →
            </p>
            <p className="text-[11px] font-normal text-zinc-500 mt-0.5">
              Review custom business strategies and configuration matrices per account.
            </p>
          </a>
          <a
            href="/dashboard/credentials"
            className="group block p-4 rounded-lg bg-zinc-900/10 border border-zinc-900/60 hover:border-zinc-800 hover:bg-zinc-900/20 transition-all"
          >
            <p className="text-xs font-medium text-zinc-300 group-hover:text-zinc-100 transition-colors">
              Access Credentials Vault →
            </p>
            <p className="text-[11px] font-normal text-zinc-500 mt-0.5">
              Securely deploy or revoke encrypted platform API authorization tokens.
            </p>
          </a>
        </div>
      )}
    </div>
  );
}