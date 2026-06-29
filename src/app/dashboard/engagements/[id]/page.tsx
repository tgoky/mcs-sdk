import { db } from "@/lib/db";
import { engagements, skillRuns, credentials } from "@/models/schema";
import { getSession } from "@/lib/session";
import { eq, and, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { TriggerSkillButton } from "./trigger-skill-button";
import { CheckCircle2, XCircle, Loader2, AlertCircle, ChevronLeft } from "lucide-react";
import {
  SKILL_INFO,
  SKILLS,
  skillName,
  phaseLabel,
  runStatusLabel,
  runStatusColor,
  bookingPlatformLabel,
  emailPlatformLabel,
  type SkillName,
  type ModuleStatus,
  MODULE_STATUS_LABELS,
  MODULE_STATUS_COLORS,
} from "@/lib/copy";

export const revalidate = 0;

function deriveModuleStatus(
  runs: { status: string }[]
): ModuleStatus {
  if (runs.length === 0) return "not_run";
  const latest = runs[0];
  const s = latest.status.toLowerCase();
  if (s === "success") return "live";
  if (s === "failed") return "failed";
  return "not_run";
}

function RunStatusIcon({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === "success" || s === "completed") {
    return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  }
  if (s === "failed" || s === "error") {
    return <XCircle className="w-4 h-4 text-zinc-500" />;
  }
  if (s === "running" || s === "in_progress") {
    return <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />;
  }
  return <AlertCircle className="w-4 h-4 text-zinc-600" />;
}

// Shows the phase the OG skill is currently in, or the last completed phase
function PhaseTag({ phase, status }: { phase: string | null; status: string }) {
  const label = phaseLabel(phase);
  const isRunning = status.toLowerCase() === "running";
  return (
    <span
      className={`text-[11px] font-normal ${
        isRunning ? "text-zinc-300 italic" : "text-zinc-500"
      }`}
    >
      {label}
    </span>
  );
}

export default async function EngagementDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getSession();
  const { id } = params;

  const [engagement] = await db
    .select()
    .from(engagements)
    .where(
      and(
        eq(engagements.engagementId, id),
        eq(engagements.whopUserId, session.whopUserId!)
      )
    );

  if (!engagement) notFound();

  // All runs for this engagement, most recent first
  const runs = await db
    .select()
    .from(skillRuns)
    .where(eq(skillRuns.engagementId, id))
    .orderBy(desc(skillRuns.startedAt));

  const stack = engagement.stack as Record<string, string> | null;
  const offerDetails = engagement.offerDetails as Record<string, string | boolean> | null;

  // Group runs by skill for the module status grid
  const runsBySkill = Object.fromEntries(
    SKILLS.map((skill) => [
      skill,
      runs.filter((r) => r.skillName === skill),
    ])
  ) as Record<SkillName, typeof runs>;

  return (
    <div className="space-y-6 w-full mx-auto tracking-tight antialiased px-1 text-zinc-400">

      {/* Back + header */}
      <div className="space-y-4 border-b border-zinc-900 pb-5">
        <Link
          href="/dashboard/engagements"
          className="inline-flex items-center text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors gap-0.5"
        >
          <ChevronLeft size={14} />
          All Clients
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-zinc-100 tracking-tight">
              {engagement.buyer}
            </h1>
            <p className="text-[11px] font-mono text-zinc-600">
              {engagement.engagementId}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 self-start">
            <span className="text-xs text-zinc-400 bg-zinc-900/60 px-2.5 py-1 rounded-md border border-zinc-800/80 font-medium">
              {bookingPlatformLabel(stack?.booking_platform)}
            </span>
            <span className="text-xs text-zinc-400 bg-zinc-900/60 px-2.5 py-1 rounded-md border border-zinc-800/80 font-medium">
              {emailPlatformLabel(stack?.email_platform)}
            </span>
            {offerDetails?.traffic_temperature && (
              <span className="text-xs text-zinc-400 bg-zinc-900/60 px-2.5 py-1 rounded-md border border-zinc-800/80 font-medium capitalize">
                {String(offerDetails.traffic_temperature)} traffic
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Offer summary row */}
      {offerDetails && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Offer", value: String(offerDetails.name ?? "—") },
            { label: "Price", value: String(offerDetails.price ?? "—") },
            { label: "Ideal Customer", value: String(offerDetails.icp ?? "—") },
            {
              label: "AI Personalization",
              value: offerDetails.hybrid_mode_enabled ? "On" : "Off",
            },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-lg border border-zinc-900 bg-zinc-950/20 p-3 space-y-1"
            >
              <p className="text-[11px] text-zinc-600 font-normal">{label}</p>
              <p className="text-xs text-zinc-300 font-normal leading-snug">
                {value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Module grid — one card per skill */}
      <div className="space-y-2">
        <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
          Modules
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {SKILLS.map((skill) => {
            const info = SKILL_INFO[skill];
            const skillRunList = runsBySkill[skill];
            const status = deriveModuleStatus(skillRunList);
            const latestRun = skillRunList[0] ?? null;

            return (
              <div
                key={skill}
                className="rounded-lg border border-zinc-900 bg-zinc-950/20 p-4 space-y-3"
              >
                {/* Module name + status */}
                <div className="flex items-start justify-between">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-zinc-200">
                      {info.name}
                    </p>
                    <p className="text-[11px] font-normal text-zinc-500 leading-snug">
                      {info.description}
                    </p>
                  </div>
                  <span
                    className={`text-[11px] font-normal shrink-0 ml-2 ${MODULE_STATUS_COLORS[status]}`}
                  >
                    {MODULE_STATUS_LABELS[status]}
                  </span>
                </div>

                {/* Latest run phase / step */}
                {latestRun && (
                  <div className="border-t border-zinc-900/50 pt-2.5 space-y-1">
                    <p className="text-[11px] text-zinc-600">Last run</p>
                    <div className="flex items-center justify-between">
                      <PhaseTag
                        phase={latestRun.phase}
                        status={latestRun.status}
                      />
                      <span className="text-[11px] text-zinc-600">
                        {new Date(latestRun.startedAt).toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric" }
                        )}
                      </span>
                    </div>
                    {latestRun.status.toLowerCase() === "failed" && (
                      <p className="text-[11px] text-rose-400/80 leading-snug pt-0.5">
                        This module needs attention. Trigger it again or check your credentials.
                      </p>
                    )}
                  </div>
                )}

                {/* Trigger button */}
                <TriggerSkillButton
                  engagementId={engagement.engagementId}
                  skillName={skill}
                  label={`Run ${info.name}`}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Run history */}
      {runs.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
            Run History
          </h2>

          <div className="w-full overflow-hidden border border-zinc-900 rounded-lg bg-zinc-950/10">
            <table className="w-full text-left border-collapse text-xs font-sans tracking-tight">
              <thead>
                <tr className="border-b border-zinc-900 bg-zinc-900/20 text-zinc-500 text-[11px] uppercase tracking-wide">
                  <th className="p-3 font-normal">Module</th>
                  <th className="p-3 font-normal">Step</th>
                  <th className="p-3 font-normal">Result</th>
                  <th className="p-3 font-normal text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900/50">
                {runs.slice(0, 20).map((run) => (
                  <tr
                    key={run.id}
                    className="hover:bg-zinc-900/10 transition-colors duration-150"
                  >
                    <td className="p-3 text-zinc-200 font-medium">
                      {skillName(run.skillName)}
                    </td>
                    <td className="p-3 text-zinc-500">
                      {phaseLabel(run.phase)}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <RunStatusIcon status={run.status} />
                        <span className="text-zinc-400 text-xs font-normal">
                          {runStatusLabel(run.status)}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-right text-zinc-600">
                      {new Date(run.startedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty run state */}
      {runs.length === 0 && (
        <div className="h-32 border border-dashed border-zinc-900 rounded-lg flex flex-col items-center justify-center space-y-1.5">
          <p className="text-sm font-normal text-zinc-500">
            No modules have run yet for this client.
          </p>
          <p className="text-xs text-zinc-600">
            Pick a module above to get started.
          </p>
        </div>
      )}
    </div>
  );
}