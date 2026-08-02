import { db } from "@/lib/db";
import { skillRuns, engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getModuleClientSummaries } from "@/lib/module-overview";
import { and, eq, desc, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  Loader2,
  PauseCircle,
} from "lucide-react";
import { SKILLS, SKILL_INFO, type SkillName } from "@/lib/copy";
import { LiveExecutionFeed } from "../../live-execution-feed";
import { ModuleRowActions } from "./module-row-actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageStatus = "live" | "running" | "failed" | "not_run";

function deriveStatus(lastStatus: string | null): PageStatus {
  if (!lastStatus) return "not_run";
  const s = lastStatus.toLowerCase();
  if (s === "success") return "live";
  if (s === "running") return "running";
  if (s === "failed" || s === "timed_out") return "failed";
  return "not_run";
}

function StatusDot({ status }: { status: PageStatus }) {
  if (status === "live") return <CheckCircle2 size={14} className="text-gold shrink-0" />;
  if (status === "running") return <Loader2 size={14} className="text-zinc-500 dark:text-zinc-400 animate-spin shrink-0" />;
  if (status === "failed") return <AlertCircle size={14} className="text-rose-500 dark:text-rose-400 shrink-0" />;
  return <Circle size={14} className="text-zinc-300 dark:text-zinc-700 shrink-0" />;
}

const STATUS_LABEL: Record<PageStatus, string> = {
  live: "Running fine",
  running: "In progress",
  failed: "Needs attention",
  not_run: "Not started yet",
};

/** Static, render-time-only age string — this table isn't live-polled, unlike the runs feed below it. */
function formatAge(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function ModulePage({
  params,
}: {
  params: Promise<{ skill: string }>;
}) {
  const { skill: rawSkill } = await params;

  if (!SKILLS.includes(rawSkill as SkillName)) {
    notFound();
  }
  const skill = rawSkill as SkillName;
  const info = SKILL_INFO[skill];

  const session = await getSession();
  const whopUserId = session.whopUserId!;

  const [clientSummaries, recentRunsRaw] = await Promise.all([
    getModuleClientSummaries(whopUserId, skill),
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
        errorMessage: skillRuns.errorMessage,
        stepCount: sql<number>`coalesce(jsonb_array_length(${skillRuns.steps}), 0)`,
      })
      .from(skillRuns)
      .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
      .where(and(eq(engagements.whopUserId, whopUserId), eq(skillRuns.skillName, skill)))
      .orderBy(desc(skillRuns.startedAt))
      .limit(50),
  ]);

  const recentRuns = recentRunsRaw.map((r) => ({
    ...r,
    startedAt: r.startedAt.toISOString(),
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  }));

  const clientsWithHistory = clientSummaries.filter((c) => c.totalRuns > 0);
  const activeCount = clientSummaries.filter((c) => deriveStatus(c.lastStatus) === "live" || deriveStatus(c.lastStatus) === "running").length;
  // The whole reason this page exists: clients stuck re-failing the same
  // way run after run, with no other action in between. A single failed
  // run is normal and shows up in the table below like anything else —
  // this section is specifically for the ones that will fail again
  // tonight unless someone steps in, same as the Mudd Ventures / GHL case
  // that prompted building this page.
  const repeatFailures = clientSummaries.filter(
    (c) => c.consecutiveFailures >= 2 && !c.pausedAt && c.skillEnabled
  );

  return (
    <div className="space-y-6 w-full text-zinc-600 dark:text-zinc-400 font-sans tracking-tight antialiased select-none px-1 transition-colors duration-200">
      <div className="border-b border-zinc-200 dark:border-zinc-900 pb-3 space-y-2">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
        >
          <ArrowLeft size={12} /> Dashboard
        </Link>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 tracking-tight">
              {info.name}
            </h1>
            <p className="text-sm font-normal text-zinc-400 dark:text-zinc-500">
              {info.description}
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-zinc-500">
              <span className="text-zinc-700 dark:text-zinc-300 font-semibold">{clientsWithHistory.length}</span> client{clientsWithHistory.length === 1 ? "" : "s"} have run this
            </span>
            <span className="text-zinc-500">
              <span className="text-gold-hover dark:text-gold font-semibold">{activeCount}</span> active
            </span>
            {repeatFailures.length > 0 && (
              <span className="text-rose-600 dark:text-rose-400 font-semibold">
                {repeatFailures.length} failing repeatedly
              </span>
            )}
          </div>
        </div>
      </div>

      {repeatFailures.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
            <AlertCircle size={13} /> Failing repeatedly — needs a decision
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {repeatFailures.map((c) => (
              <div
                key={c.engagementId}
                className="border border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20 rounded-lg p-3 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                    {c.buyerName}
                  </span>
                  <span className="text-xs font-mono text-rose-600 dark:text-rose-400 font-semibold whitespace-nowrap">
                    {c.consecutiveFailures} nights straight
                  </span>
                </div>
                {c.lastErrorMessage && (
                  <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-500 line-clamp-2" title={c.lastErrorMessage}>
                    {c.lastErrorMessage}
                  </p>
                )}
                <div className="flex items-center gap-3 pt-1">
                  <Link
                    href={`/dashboard/engagements/${c.engagementId}`}
                    className="text-xs font-mono font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-colors inline-flex items-center gap-1"
                  >
                    <PauseCircle size={12} /> Pause or fix credentials
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {clientsWithHistory.length > 0 && (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white/40 dark:bg-zinc-950/30 overflow-hidden shadow-sm">
          <div className="px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50">
            <h3 className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider font-mono">
              By client
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left border-collapse text-xs font-sans tracking-tight">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800/50 text-zinc-400 dark:text-zinc-600 uppercase tracking-wider font-mono text-[10px]">
                  <th className="px-4 py-2 font-normal">Client</th>
                  <th className="px-4 py-2 font-normal">Status</th>
                  <th className="px-4 py-2 font-normal">Runs</th>
                  <th className="px-4 py-2 font-normal">Last run</th>
                  <th className="w-16 px-2 font-normal text-right">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/30">
                {clientsWithHistory.map((c) => {
                  const status = deriveStatus(c.lastStatus);
                  return (
                    <tr key={c.engagementId} className="group hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors">
                      <td className="px-4 py-2.5">
                        <Link href={`/dashboard/engagements/${c.engagementId}`} className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white transition-colors">
                          {c.buyerName}
                        </Link>
                        {c.pausedAt && (
                          <span className="ml-2 text-[10px] font-mono text-amber-600 dark:text-amber-400">paused</span>
                        )}
                        {!c.skillEnabled && (
                          <span className="ml-2 text-[10px] font-mono text-zinc-400 dark:text-zinc-600">disabled</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <StatusDot status={status} />
                          <span className={`text-xs font-mono ${status === "failed" ? "text-rose-600 dark:text-rose-400" : "text-zinc-500 dark:text-zinc-400"}`}>
                            {STATUS_LABEL[status]}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-zinc-500">{c.totalRuns}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-zinc-400 dark:text-zinc-600">{formatAge(c.lastRunAt)}</td>
                      <td className="pr-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <ModuleRowActions
                            engagementId={c.engagementId}
                            buyerName={c.buyerName}
                            skillId={skill}
                            skillLabel={info.name}
                            skillEnabled={c.skillEnabled}
                            pausedAt={c.pausedAt}
                          />
                          <ArrowRight className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-700" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {clientsWithHistory.length === 0 && (
        <div className="h-32 flex items-center justify-center border border-dashed border-zinc-300 dark:border-zinc-800 rounded-lg bg-zinc-50/50 dark:bg-zinc-950/50">
          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-zinc-500">No runs yet</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-600 max-w-sm font-mono">
              {info.name} hasn&apos;t run for any client yet.
            </p>
          </div>
        </div>
      )}

      <LiveExecutionFeed
        initialRuns={recentRuns}
        apiUrl={`/api/skill-runs/recent?skill=${skill}`}
        title={`${info.name} history`}
        lockedSkill={skill}
        storageKey={skill}
      />
    </div>
  );
}
