"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, Clock, PauseCircle } from "lucide-react";
import { StatusPill } from "@/app/dashboard/runs/[id]/_shared/status-pill";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import type { SkillManifestEntry, SkillId } from "@/lib/skill-manifest";
import type { ModuleClientSummary } from "@/lib/module-overview";

// Skills with a dedicated "every run this client has ever had" page under
// the engagement (engagements/[id]/skills/[skill]). Pin-Down has no
// equivalent by design — it's a one-time onboarding bridge, not an
// ongoing per-call skill (see skill-manifest.ts's runOnSetup) — so its
// rows go to the client's own engagement page instead, where its
// status/config actually lives.
const HAS_SKILL_DETAIL_PAGE: Partial<Record<SkillId, true>> = {
  "pile-on": true,
  "pre-call-read": true,
  "win-back": true,
  "leak-map": true,
};

function hrefFor(skill: SkillId, engagementId: string): string {
  return HAS_SKILL_DETAIL_PAGE[skill]
    ? `/dashboard/engagements/${engagementId}/skills/${skill}`
    : `/dashboard/engagements/${engagementId}`;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "Never run";
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

// Matches the real skillRuns.status vocabulary used elsewhere (see
// runs/[id]/page.tsx's isFailed/isCancelled/isTimedOut and
// module-overview.ts's FAILURE_STATUSES) rather than guessing at values
// like "error" or "in_progress" that don't actually appear in this schema.
function statusTone(status: string | null): "success" | "danger" | "warning" | "neutral" {
  if (!status) return "neutral";
  if (status === "success") return "success";
  if (status === "failed" || status === "timed_out") return "danger";
  if (status === "cancelled") return "neutral";
  if (status === "running") return "warning";
  return "neutral";
}

function statusLabel(status: string | null): string {
  if (!status) return "Not run yet";
  if (status === "success") return "Healthy";
  if (status === "failed") return "Failed";
  if (status === "timed_out") return "Timed out";
  if (status === "cancelled") return "Cancelled";
  if (status === "running") return "Running";
  return status;
}

/**
 * The Library's real "holistic" entry point for one skill: one row per
 * CLIENT, not one row per run. Before this existed, opening a skill from
 * the Library dropped you into a flat, cross-client feed of the 50 most
 * recent runs, and clicking any of them jumped straight to a single run
 * with no way back to "show me everything this client has ever had for
 * this skill." Clicking a row here goes straight to the page that already
 * builds that full history: engagements/[id]/skills/[skill].
 *
 * Includes clients with zero runs of this skill too (status "Not run
 * yet") — getModuleClientSummaries deliberately doesn't limit to whoever
 * happened to run most recently, so a client isn't invisible here just
 * because 50 other clients ran more recently.
 */
export function ModuleClientRoster({
  summaries,
  skill,
}: {
  summaries: ModuleClientSummary[];
  manifest: SkillManifestEntry;
  skill: SkillId;
}) {
  const router = useRouter();

  if (summaries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center">
        <p className="text-sm font-semibold text-zinc-400">No clients yet</p>
        <p className="text-xs text-zinc-600 mt-1">Add a client to get started.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800/80 overflow-hidden font-sans">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800/80 bg-zinc-900/40 text-left text-[10.5px] font-mono uppercase tracking-wide text-zinc-500">
            <th className="px-4 py-2.5 font-medium">Client</th>
            <th className="px-4 py-2.5 font-medium text-center">Skill</th>
            <th className="px-4 py-2.5 font-medium">Last run</th>
            <th className="px-4 py-2.5 font-medium text-right">Runs</th>
            <th className="px-4 py-2.5 font-medium text-right">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/60">
          {summaries.map((s) => (
            <tr
              key={s.engagementId}
              onClick={() => router.push(hrefFor(skill, s.engagementId))}
              className="group hover:bg-zinc-900/40 transition-colors cursor-pointer"
            >
              <td className="px-4 py-3 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors truncate">
                    {s.buyerName}
                  </span>
                  {s.pausedAt && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-500 shrink-0" title={s.pausedReason ?? "Paused"}>
                      <PauseCircle size={11} />
                      paused
                    </span>
                  )}
                  {!s.skillEnabled && (
                    <span className="text-[10px] font-mono text-zinc-600 shrink-0">off</span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-center">
                <div className="flex justify-center">
                  <SquishySkillBadge skill={skill} size={20} enabled={s.skillEnabled} />
                </div>
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-zinc-400">
                  <Clock size={11} className="text-zinc-600 shrink-0" />
                  {relativeTime(s.lastRunAt)}
                </span>
              </td>
              <td className="px-4 py-3 text-right text-[11px] font-mono text-zinc-400">{s.totalRuns}</td>
              <td className="px-4 py-3 text-right">
                <div className="inline-flex items-center gap-2 justify-end">
                  {s.consecutiveFailures > 0 && (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-mono text-rose-400"
                      title={`${s.consecutiveFailures} failures in a row`}
                    >
                      <AlertTriangle size={11} />
                      {s.consecutiveFailures}
                    </span>
                  )}
                  <StatusPill tone={statusTone(s.lastStatus)}>{statusLabel(s.lastStatus)}</StatusPill>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
