import { db } from "@/lib/db";
import { engagements, skillRuns } from "@/models/schema";
import { getSession } from "@/lib/session";
import { eq, and, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { TriggerSkillButton } from "./trigger-skill-button";
import { CheckCircle2, XCircle, Loader2, AlertCircle, ArrowRight } from "lucide-react";
import {
  SKILL_INFO,
  SKILLS,
  skillName,
  phaseLabel,
  runStatusLabel,
  bookingPlatformLabel,
  emailPlatformLabel,
  type SkillName,
  type ModuleStatus,
  MODULE_STATUS_LABELS,
  MODULE_STATUS_COLORS,
} from "@/lib/copy";

export const revalidate = 0;

function deriveModuleStatus(runs: { status: string }[]): ModuleStatus {
  if (runs.length === 0) return "not_run";
  const s = runs[0].status.toLowerCase();
  if (s === "success") return "live";
  if (s === "failed") return "failed";
  return "not_run";
}

function RunStatusIcon({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === "success" || s === "completed") return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
  if (s === "failed" || s === "error") return <XCircle className="w-4 h-4 text-rose-500 shrink-0" />;
  if (s === "running" || s === "in_progress") return <Loader2 className="w-4 h-4 text-zinc-400 dark:text-zinc-500 animate-spin shrink-0" />;
  return <AlertCircle className="w-4 h-4 text-zinc-400 dark:text-zinc-600 shrink-0" />;
}

function PhaseTag({ phase, status }: { phase: string | null; status: string }) {
  const label = phaseLabel(phase);
  const isRunning = status.toLowerCase() === "running";
  return (
    <span className={`text-[11px] font-mono tracking-tight ${isRunning ? "text-zinc-600 dark:text-zinc-300 italic animate-pulse" : "text-zinc-400 dark:text-zinc-500"}`}>
      {label}
    </span>
  );
}

export default async function EngagementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  const { id } = await params;

  const [engagement] = await db
    .select()
    .from(engagements)
    .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session.whopUserId!)));

  if (!engagement) notFound();

  const runs = await db
    .select({
      id: skillRuns.id,
      skillName: skillRuns.skillName,
      status: skillRuns.status,
      phase: skillRuns.phase,
      errorMessage: skillRuns.errorMessage,
      startedAt: skillRuns.startedAt,
      completedAt: skillRuns.completedAt,
      stepCount: sql<number>`coalesce(jsonb_array_length(${skillRuns.steps}), 0)`,
    })
    .from(skillRuns)
    .where(eq(skillRuns.engagementId, id))
    .orderBy(desc(skillRuns.startedAt));

  const stack = engagement.stack as Record<string, string> | null;
  const offerDetails = engagement.offerDetails as Record<string, string | boolean> | null;

  const runsBySkill = Object.fromEntries(
    SKILLS.map((skill) => [skill, runs.filter((r) => r.skillName === skill)])
  ) as Record<SkillName, typeof runs>;

  return (
    <div className="space-y-6 w-full mx-auto tracking-tight antialiased px-1 text-zinc-600 dark:text-zinc-400 transition-colors duration-200">

      {/* Back + header navigation anchor strip */}
      <div className="space-y-3 border-b border-zinc-200 dark:border-zinc-900 pb-4">
        <Link
          href="/dashboard/engagements"
          className="inline-flex items-center text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors gap-1 font-mono"
        >
          <span className="text-zinc-400 dark:text-zinc-500 mr-1">←</span>All Clients
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">{engagement.buyer}</h1>
            <p className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600">{engagement.engagementId}</p>
          </div>
          <div className="flex flex-wrap gap-2 self-start font-mono">
            <span className="text-xs text-zinc-600 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-900/40 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-900/60">
              {bookingPlatformLabel(stack?.booking_platform)}
            </span>
            <span className="text-xs text-zinc-600 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-900/40 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-900/60">
              {emailPlatformLabel(stack?.email_platform)}
            </span>
            {offerDetails?.traffic_temperature && (
              <span className="text-xs text-zinc-600 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-900/40 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-900/60 capitalize">
                {String(offerDetails.traffic_temperature)} traffic
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Offer metric metadata summaries */}
      {offerDetails && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Offer", value: String(offerDetails.name ?? "—") },
            { label: "Price", value: String(offerDetails.price ?? "—") },
            { label: "Ideal Customer", value: String(offerDetails.icp ?? "—") },
            { label: "AI Personalization", value: offerDetails.hybrid_mode_enabled ? "On" : "Off" },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-zinc-200 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-950/20 p-3 space-y-1 shadow-sm">
              <p className="text-[11px] text-zinc-400 dark:text-zinc-600 font-mono uppercase tracking-wider">{label}</p>
              <p className="text-xs text-zinc-800 dark:text-zinc-300 font-semibold leading-snug">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Module skill selector grid */}
      <div className="space-y-2">
        <h2 className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-mono">Modules</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {SKILLS.map((skill) => {
            const info = SKILL_INFO[skill];
            const skillRunList = runsBySkill[skill];
            const status = deriveModuleStatus(skillRunList);
            const latestRun = skillRunList[0] ?? null;

            return (
              <div key={skill} className="rounded-lg border border-zinc-200 dark:border-zinc-900 bg-white/40 dark:bg-zinc-950/20 p-4 flex flex-col justify-between min-h-[190px] shadow-sm">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5 min-w-0">
                      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">{info.name}</p>
                      <p className="text-[11px] font-normal text-zinc-500 dark:text-zinc-500 leading-snug">{info.description}</p>
                    </div>
                    <span className={`text-[11px] font-mono font-bold shrink-0 p-1 bg-zinc-100 dark:bg-zinc-900/40 rounded border border-zinc-200/60 dark:border-zinc-800/40 ml-2 ${MODULE_STATUS_COLORS[status]}`}>
                      {MODULE_STATUS_LABELS[status]}
                    </span>
                  </div>

                  {latestRun && (
                    <div className="border-t border-zinc-200 dark:border-zinc-900/50 pt-2.5 space-y-1">
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <p className="text-zinc-400 dark:text-zinc-600">Last execution</p>
                        <Link
                          href={`/dashboard/runs/${latestRun.id}`}
                          className="text-[10px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors flex items-center gap-0.5 font-bold"
                        >
                          View run <ArrowRight className="w-2.5 h-2.5" />
                        </Link>
                      </div>
                      <div className="flex items-center justify-between">
                        <PhaseTag phase={latestRun.phase} status={latestRun.status} />
                        <span className="text-[11px] text-zinc-400 dark:text-zinc-600 font-mono">
                          {new Date(latestRun.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                      </div>
                      {latestRun.status.toLowerCase() === "failed" && latestRun.errorMessage && (
                        <p className="text-[11px] text-rose-600 dark:text-rose-400/80 leading-snug pt-0.5 font-mono break-all">
                          {latestRun.errorMessage.length < 100
                            ? latestRun.errorMessage
                            : latestRun.errorMessage.slice(0, 97) + "…"}
                        </p>
                      )}
                      {latestRun.status.toLowerCase() === "failed" && !latestRun.errorMessage && (
                        <p className="text-[11px] text-rose-600 dark:text-rose-400/80 leading-snug pt-0.5 font-medium">
                          This module needs attention. Click "View run" for details.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-zinc-100 dark:border-zinc-900/40 mt-3">
                  <TriggerSkillButton
                    engagementId={engagement.engagementId}
                    skillName={skill}
                    label={`Run ${info.name}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Historic executions grid table */}
      {runs.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-mono">Run History</h2>

          <div className="w-full overflow-hidden border border-zinc-200 dark:border-zinc-900 rounded-lg bg-white/40 dark:bg-zinc-950/10 shadow-sm transition-colors">
            <table className="w-full text-left border-collapse text-xs font-sans tracking-tight">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-900 bg-zinc-50 dark:bg-zinc-900/20 text-zinc-400 dark:text-zinc-500 text-[11px] uppercase tracking-wide font-mono select-none">
                  <th className="p-3 font-normal">Module</th>
                  <th className="p-3 font-normal">Last Phase</th>
                  <th className="p-3 font-normal">Steps</th>
                  <th className="p-3 font-normal">Result</th>
                  <th className="p-3 font-normal text-right">Date</th>
                  <th className="w-10 px-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-900/50">
                {runs.slice(0, 20).map((run) => {
                  const isFailed = run.status.toLowerCase() === "failed";
                  return (
                    <tr
                      key={run.id}
                      className="group hover:bg-zinc-100 dark:hover:bg-zinc-900/20 transition-colors duration-150 relative"
                    >
                      <td className="p-3 text-zinc-800 dark:text-zinc-200 font-semibold">
                        {/* full-row link semantics remain completely balanced and preserved */}
                        <Link
                          href={`/dashboard/runs/${run.id}`}
                          className="absolute inset-0 z-10"
                          aria-label={`View run details for ${skillName(run.skillName)}`}
                        />
                        <span className="relative z-0">{skillName(run.skillName)}</span>
                      </td>
                      <td className="p-3">
                        <div className="space-y-0.5 relative z-0">
                          <div className="text-zinc-500 dark:text-zinc-400 font-medium">{phaseLabel(run.phase)}</div>
                          {isFailed && run.errorMessage && (
                            <div className="text-[10px] text-rose-600 dark:text-rose-400/80 font-mono leading-relaxed max-w-[200px] truncate" title={run.errorMessage}>
                              {run.errorMessage}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-3 font-mono text-zinc-400 dark:text-zinc-600">
                        {run.stepCount > 0 ? run.stepCount : "—"}
                      </td>
                      <td className="p-3 relative z-0">
                        <div className="flex items-center gap-2">
                          <RunStatusIcon status={run.status} />
                          <span className="text-zinc-600 dark:text-zinc-400 text-xs font-normal font-mono">{runStatusLabel(run.status)}</span>
                        </div>
                      </td>
                      <td className="p-3 text-right text-zinc-400 dark:text-zinc-600 font-mono">
                        {new Date(run.startedAt).toLocaleDateString(undefined, {
                          month: "short", day: "numeric", year: "numeric",
                        })}
                      </td>
                      <td className="pr-3 text-right">
                        <ArrowRight className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty run log parameter box */}
      {runs.length === 0 && (
        <div className="h-32 border border-dashed border-zinc-200 dark:border-zinc-900 bg-zinc-50/50 dark:bg-transparent rounded-lg flex flex-col items-center justify-center space-y-1.5 transition-colors">
          <p className="text-sm font-normal text-zinc-400 dark:text-zinc-500">No modules have run yet for this client.</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-600 font-mono">Pick a module above to get started.</p>
        </div>
      )}
    </div>
  );
}