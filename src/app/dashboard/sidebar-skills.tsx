import { db } from "@/lib/db";
import { engagements, skillRuns } from "@/models/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { CheckCircle2, AlertCircle, Circle, Loader2 } from "lucide-react";
import {
  SKILL_INFO,
  SKILLS,
  MODULE_STATUS_LABELS,
  type SkillName,
  type ModuleStatus,
} from "@/lib/copy";
import { LiveTime } from "./live-time";

type SkillStatus = "live" | "failed" | "not_run" | "running";

function getStatusTooltip(status: SkillStatus): string {
  if (status === "running") return "Executing now";
  return MODULE_STATUS_LABELS[status as ModuleStatus] ?? "Not started yet";
}

/**
 * Everything in the sidebar that depends on a database round trip — the
 * per-module status list and the "N active / N issues" summary line.
 *
 * Pulled out of DashboardLayout on purpose: that layout is a shared ancestor
 * for every /dashboard/* route, so if this query lived directly in the
 * layout function body, EVERY navigation into the dashboard from outside it
 * (e.g. clicking "Home" and coming back) would block the entire sidebar —
 * logo, nav links, sign-out — behind this fetch before anything painted.
 * Wrapping just this piece in <Suspense> (see layout.tsx) means the static
 * shell renders immediately and this panel streams in a moment later,
 * with its own skeleton instead of a blank sidebar.
 */
export async function SidebarSkills({ whopUserId }: { whopUserId: string }) {
  const skillStatuses: Record<SkillName, SkillStatus> = {
    "pin-down": "not_run",
    "pile-on": "not_run",
    "pre-call-read": "not_run",
    "win-back": "not_run",
    "leak-map": "not_run",
  };

  const skillLastRun: Record<SkillName, Date | null> = {
    "pin-down": null,
    "pile-on": null,
    "pre-call-read": null,
    "win-back": null,
    "leak-map": null,
  };

  const skillRunCounts: Record<SkillName, number> = {
    "pin-down": 0,
    "pile-on": 0,
    "pre-call-read": 0,
    "win-back": 0,
    "leak-map": 0,
  };

  const userEngagements = await db
    .select({ engagementId: engagements.engagementId })
    .from(engagements)
    .where(eq(engagements.whopUserId, whopUserId));

  if (userEngagements.length > 0) {
    const recentRuns = await db
      .select({
        skillName: skillRuns.skillName,
        status: skillRuns.status,
        startedAt: skillRuns.startedAt,
      })
      .from(skillRuns)
      .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
      .where(eq(engagements.whopUserId, whopUserId)) // Strict tenant boundary
      .orderBy(desc(skillRuns.startedAt))
      .limit(100);

    for (const run of recentRuns) {
      const skill = run.skillName as SkillName;
      if (SKILLS.includes(skill)) {
        skillRunCounts[skill]++;
        if (!skillLastRun[skill] && run.startedAt) {
          skillLastRun[skill] = new Date(run.startedAt);
        }
        if (skillStatuses[skill] === "not_run") {
          if (run.status === "running") {
            skillStatuses[skill] = "running";
          } else if (run.status === "success") {
            skillStatuses[skill] = "live";
          } else if (run.status === "failed" || run.status === "timed_out") {
            skillStatuses[skill] = "failed";
          }
        }
      }
    }
  }

  const activeCount = Object.values(skillStatuses).filter((s) => s === "live" || s === "running").length;
  const failedCount = Object.values(skillStatuses).filter((s) => s === "failed").length;

  return (
    <div className="pt-4 border-t border-zinc-200 dark:border-zinc-900">
      <div className="px-1 mb-3 space-y-1">
        <p className="text-xs font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
          EXECUTIONS
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-zinc-500">
            <span className="text-zinc-700 dark:text-zinc-400">{activeCount} active</span>
            {failedCount > 0 && <span className="text-zinc-300 dark:text-zinc-600 mx-1">·</span>}
            {failedCount > 0 && <span className="text-rose-600 dark:text-rose-400 font-medium">{failedCount} issue{failedCount !== 1 ? 's' : ''}</span>}
          </span>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-900 rounded-lg overflow-hidden transition-colors duration-200">
        {SKILLS.map((skill, index) => {
          const status = skillStatuses[skill];
          const info = SKILL_INFO[skill];
          const lastRun = skillLastRun[skill];
          const runCount = skillRunCounts[skill];

          return (
            <Link
              key={skill}
              href={`/dashboard/modules/${skill}`}
              className={`
                block px-3 py-2.5 transition-colors
                hover:bg-zinc-100 dark:hover:bg-zinc-800/80 cursor-pointer
                group relative
                ${index !== SKILLS.length - 1 ? 'border-b border-zinc-200 dark:border-zinc-900' : ''}
              `}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 group-hover:text-zinc-950 group-hover:dark:text-zinc-100 transition-colors truncate">
                    {info.name}
                  </span>
                  <svg
                    className="w-3 h-3 opacity-0 group-hover:opacity-100 text-zinc-400 dark:text-zinc-500 shrink-0 transition-all duration-200"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>

                <div className="flex items-center shrink-0 relative group/icon">
                  {status === "live" && (
                    <>
                      <CheckCircle2 size={15} className="text-gold" />
                      <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] text-zinc-800 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-1.5 py-0.5 rounded opacity-0 group-hover/icon:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-md dark:shadow-xl z-10 font-mono">
                        {getStatusTooltip(status)}
                      </span>
                    </>
                  )}
                  {status === "running" && (
                    <>
                      <Loader2 size={15} className="text-zinc-500 dark:text-zinc-400 animate-spin" />
                      <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] text-zinc-800 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-1.5 py-0.5 rounded opacity-0 group-hover/icon:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-md dark:shadow-xl z-10 font-mono">
                        {getStatusTooltip(status)}
                      </span>
                    </>
                  )}
                  {status === "failed" && (
                    <>
                      <AlertCircle size={15} className="text-rose-500 dark:text-rose-400" />
                      <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] text-zinc-800 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-1.5 py-0.5 rounded opacity-0 group-hover/icon:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-md dark:shadow-xl z-10 font-mono">
                        {getStatusTooltip(status)}
                      </span>
                    </>
                  )}
                  {status === "not_run" && (
                    <>
                      <Circle size={15} className="text-zinc-300 dark:text-zinc-700" />
                      <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] text-zinc-800 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-1.5 py-0.5 rounded opacity-0 group-hover/icon:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-md dark:shadow-xl z-10 font-mono">
                        {getStatusTooltip(status)}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-snug mt-0.5">
                {info.description}
              </p>

              <div className="flex items-center gap-3 mt-1 font-mono">
                {status === "running" ? (
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400 tabular-nums animate-pulse">
                    Running...
                  </span>
                ) : lastRun ? (
                  <LiveTime isoString={lastRun.toISOString()} />
                ) : (
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-700">
                    Never run
                  </span>
                )}
                {runCount > 0 && (
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-700 tabular-nums">
                    {runCount} run{runCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** Static placeholder shown while SidebarSkills resolves its query. */
export function SidebarSkillsSkeleton() {
  return (
    <div className="pt-4 border-t border-zinc-200 dark:border-zinc-900">
      <div className="px-1 mb-3 space-y-1">
        <p className="text-xs font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
          EXECUTIONS
        </p>
        <div className="h-3 w-20 rounded bg-zinc-100 dark:bg-zinc-900" />
      </div>
      <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-900 rounded-lg overflow-hidden divide-y divide-zinc-200 dark:divide-zinc-900">
        {SKILLS.map((skill) => (
          <div key={skill} className="px-3 py-2.5 space-y-1.5">
            <div className="h-3 w-24 rounded bg-zinc-100 dark:bg-zinc-900" />
            <div className="h-2.5 w-full max-w-[160px] rounded bg-zinc-100 dark:bg-zinc-900" />
          </div>
        ))}
      </div>
    </div>
  );
}
