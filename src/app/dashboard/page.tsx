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

  // Calculate total successful background tasks executed
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
    <div className="space-y-5 w-full text-zinc-400 font-sans tracking-tight antialiased select-none px-1">
      
      {/* Consolidated Master Header Panel */}
      <div className="flex flex-col space-y-3 lg:flex-row lg:justify-between lg:items-center lg:space-y-0 border-b border-zinc-900 pb-3">
        <div className="space-y-1">
          <h1 className="text-lg font-medium text-zinc-100 tracking-tight">
            System Telemetry Node
          </h1>
          <p className="text-sm font-normal text-zinc-500">
            Real-time multi-tenant core module orchestration and background execution pipeline tracing.
          </p>
        </div>
        
        {/* Compact Navigation Utility Links */}
        <div className="flex items-center space-x-1.5 self-start lg:self-auto text-sm">
          <a
            href="/dashboard/engagements"
            className="px-2 py-1 font-mono text-zinc-500 hover:text-zinc-200 transition-colors uppercase text-xs"
          >
            [ Accounts ]
          </a>
          <a
            href="/dashboard/credentials"
            className="px-2 py-1 font-mono text-zinc-500 hover:text-zinc-200 transition-colors uppercase text-xs"
          >
            [ Vault ]
          </a>
          <a
            href="/dashboard/engagements/new"
            className="ml-2 inline-flex items-center px-3 py-1 font-mono text-xs border border-zinc-800 text-zinc-400 rounded hover:border-zinc-600 hover:text-zinc-100 transition-colors uppercase tracking-wider"
          >
            Initialize Setup
          </a>
        </div>
      </div>

      {/* SECTION 1: High-Density Horizontal Metric Ribbon */}
      <div className="border-b border-zinc-900 pb-4">
        <p className="text-xs font-mono text-zinc-600 uppercase tracking-widest mb-3">
          [ Metric Summary ]
        </p>
        
        <div className="grid gap-4 sm:grid-cols-3 pt-1 border-t border-zinc-900/20">
          <div className="space-y-1">
            <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Active Accounts</p>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-light text-zinc-100">{userEngagements.length}</span>
              <span className="text-xs font-mono text-zinc-500 uppercase">
                {runningCount > 0 ? `${runningCount} running` : "nominal"}
              </span>
            </div>
          </div>

          <div className="space-y-1 sm:border-l sm:border-zinc-900 sm:pl-4">
            <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Automated Actions</p>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-3xl font-light text-zinc-100">{completedActions}</span>
              <span className="text-xs font-mono text-zinc-500 uppercase">Tasks</span>
            </div>
          </div>

          <div className="space-y-1 sm:border-l sm:border-zinc-900 sm:pl-4">
            <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest">System Integrity</p>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-light text-zinc-100">{criticalAlerts.length}</span>
              <span className={`text-xs font-mono uppercase tracking-wide ${
                criticalAlerts.length > 0 ? "text-rose-400" : "text-zinc-600"
              }`}>
                {criticalAlerts.length > 0 ? "Action Required" : "Zero Errors"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: Borderless Pure Execution Log Section */}
      <div className="pt-2">
        <p className="text-xs font-mono text-zinc-600 uppercase tracking-widest mb-3">
          [ Live Pipeline Stream Log ]
        </p>
        
        <div className="pt-1 border-t border-zinc-900/20">
          <LiveExecutionFeed initialRuns={recentRuns} />
        </div>
      </div>

      {/* Clean Utility Shortcut Grid */}
      {userEngagements.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 pt-4 border-t border-zinc-900">
          <a
            href="/dashboard/engagements"
            className="group block p-4 rounded-lg bg-zinc-900/10 border border-zinc-900/60 hover:border-zinc-800 hover:bg-zinc-900/20 transition-all"
          >
            <p className="text-sm font-medium text-zinc-400 group-hover:text-zinc-100 transition-colors">
              Manage Active Engagements →
            </p>
            <p className="text-xs font-normal text-zinc-600 mt-1">
              Review custom business strategies and configuration matrices per account.
            </p>
          </a>
          <a
            href="/dashboard/credentials"
            className="group block p-4 rounded-lg bg-zinc-900/10 border border-zinc-900/60 hover:border-zinc-800 hover:bg-zinc-900/20 transition-all"
          >
            <p className="text-sm font-medium text-zinc-400 group-hover:text-zinc-100 transition-colors">
              Access Credentials Vault →
            </p>
            <p className="text-xs font-normal text-zinc-600 mt-1">
              Securely deploy or revoke encrypted platform API authorization tokens.
            </p>
          </a>
        </div>
      )}
    </div>
  );
}