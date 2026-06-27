import { db } from "@/lib/db";
import { skillRuns, engagements, activeAlerts } from "@/models/schema";
import { getSession } from "@/lib/session";
import { eq, desc, sql } from "drizzle-orm";
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

  // Real cost: sum of all skill runs across user's engagements
  const totalCostResult = await db
    .select({ total: sql<number>`coalesce(sum(${skillRuns.costInCents}), 0)` })
    .from(skillRuns)
    .innerJoin(
      engagements,
      eq(skillRuns.engagementId, engagements.engagementId)
    )
    .where(eq(engagements.whopUserId, session.whopUserId!));

  const totalSpendCents = totalCostResult[0]?.total ?? 0;
  const formattedSpend = (totalSpendCents / 100).toFixed(2);

  // Running count — skill runs currently in "running" state
  const runningCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(skillRuns)
    .innerJoin(
      engagements,
      eq(skillRuns.engagementId, engagements.engagementId)
    )
    .where(eq(engagements.whopUserId, session.whopUserId!))
    .then((r) => Number(r[0]?.count ?? 0));

  const recentRuns = await db
    .select({
      id: skillRuns.id,
      skillName: skillRuns.skillName,
      status: skillRuns.status,
      phase: skillRuns.phase,
      costInCents: skillRuns.costInCents,
      startedAt: skillRuns.startedAt,
    })
    .from(skillRuns)
    .innerJoin(
      engagements,
      eq(skillRuns.engagementId, engagements.engagementId)
    )
    .where(eq(engagements.whopUserId, session.whopUserId!))
    .orderBy(desc(skillRuns.startedAt))
    .limit(8);

  return (
    <div className="space-y-6 max-w-7xl mx-auto tracking-tight">
      {/* Header */}
      <div className="flex flex-col space-y-3 md:flex-row md:justify-between md:items-center md:space-y-0 pb-2 border-b border-zinc-900">
        <div>
          <h1 className="text-xl font-medium tracking-tighter text-zinc-100">
            System Telemetry Node
          </h1>
          <p className="text-[11px] font-light text-zinc-500">
            Live runtime execution state and billing telemetry.
          </p>
        </div>
        <a
          href="/dashboard/engagements/new"
          className="inline-flex items-center px-3 py-1.5 text-[10px] font-mono font-medium bg-zinc-100 text-zinc-950 rounded hover:bg-zinc-200 transition-colors self-start md:self-auto"
        >
          + RUN PIN-DOWN
        </a>
      </div>

      {/* Stat grid */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded border border-zinc-900 bg-zinc-950/40 p-4 space-y-1">
          <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
            Active Engagements
          </p>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-light font-sans text-zinc-200 tracking-tighter">
              {userEngagements.length}
            </span>
            <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 px-1.5 py-0.5 rounded">
              {runningCount > 0 ? `${runningCount} RUNNING` : "NOMINAL"}
            </span>
          </div>
        </div>

        <div className="rounded border border-zinc-900 bg-zinc-950/40 p-4 space-y-1">
          <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
            Total API Spend
          </p>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-light font-sans text-zinc-200 tracking-tighter">
              ${formattedSpend}
            </span>
            <span className="text-[10px] font-mono text-zinc-600">USD</span>
          </div>
        </div>

        <div className="rounded border border-zinc-900 bg-zinc-950/40 p-4 space-y-1">
          <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
            Active Alerts
          </p>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-light font-sans text-zinc-200 tracking-tighter">
              {criticalAlerts.length}
            </span>
            <span
              className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                criticalAlerts.length > 0
                  ? "bg-rose-500/5 text-rose-400 border-rose-500/10 animate-pulse"
                  : "bg-zinc-900 text-zinc-600 border-zinc-800"
              }`}
            >
              {criticalAlerts.length > 0 ? "INTERRUPT" : "ZERO_ERR"}
            </span>
          </div>
        </div>
      </div>

      {/* Live feed */}
      <div className="rounded border border-zinc-900 bg-zinc-950/10 p-5 space-y-4">
        <div>
          <h2 className="text-sm font-medium text-zinc-300">
            Live Execution Log
          </h2>
          <p className="text-[11px] font-light text-zinc-500">
            Refreshes every 5 seconds. Pause to freeze the view.
          </p>
        </div>
        <LiveExecutionFeed initialRuns={recentRuns} />
      </div>

      {/* Quick links */}
      {userEngagements.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <a
            href="/dashboard/engagements"
            className="rounded border border-zinc-900 bg-zinc-950/40 p-4 hover:border-zinc-700 transition-colors group"
          >
            <p className="text-xs font-medium text-zinc-300 group-hover:text-zinc-100">
              Active Engagements →
            </p>
            <p className="text-[11px] font-light text-zinc-600 mt-0.5">
              View skill status and run history per buyer
            </p>
          </a>
          <a
            href="/dashboard/credentials"
            className="rounded border border-zinc-900 bg-zinc-950/40 p-4 hover:border-zinc-700 transition-colors group"
          >
            <p className="text-xs font-medium text-zinc-300 group-hover:text-zinc-100">
              Credentials Vault →
            </p>
            <p className="text-[11px] font-light text-zinc-600 mt-0.5">
              Add or update platform API keys
            </p>
          </a>
        </div>
      )}
    </div>
  );
}
