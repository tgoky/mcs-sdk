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

function statusTooltip(status: SkillStatus): string {
  if (status === "running") return "Executing now";
  return MODULE_STATUS_LABELS[status as ModuleStatus] ?? "Not started yet";
}

function StatusIcon({ status }: { status: SkillStatus }) {
  const tooltip = statusTooltip(status);

  switch (status) {
    case "live":
      return (
        <span className="relative group/icon shrink-0">
          <CheckCircle2 size={14} className="text-gold" />
             <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 text-[10px] text-zinc-800 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-1.5 py-0.5 rounded-sm opacity-0 group-hover/icon:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-md dark:shadow-xl z-10 font-mono">
            {tooltip}
          </span>
        </span>
      );
    case "running":
      return (
        <span className="relative group/icon shrink-0">
          <Loader2 size={14} className="text-zinc-500 dark:text-zinc-400 animate-spin" />
  <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 text-[10px] text-zinc-800 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-1.5 py-0.5 rounded-sm opacity-0 group-hover/icon:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-md dark:shadow-xl z-10 font-mono">
            {tooltip}
          </span>
        </span>
      );
    case "failed":
      return (
        <span className="relative group/icon shrink-0">
          <AlertCircle size={14} className="text-rose-500 dark:text-rose-400" />
      <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 text-[10px] text-zinc-800 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-1.5 py-0.5 rounded-sm opacity-0 group-hover/icon:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-md dark:shadow-xl z-10 font-mono">
            {tooltip}
          </span>
        </span>
      );
    case "not_run":
      return (
        <span className="relative group/icon shrink-0">
          <Circle size={14} className="text-zinc-300 dark:text-zinc-700" />
     <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 text-[10px] text-zinc-800 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-1.5 py-0.5 rounded-sm opacity-0 group-hover/icon:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-md dark:shadow-xl z-10 font-mono">
            {tooltip}
          </span>
        </span>
      );
  }
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
 *
 * Rows are intentionally single-line/minimal here — the full description +
 * two-line meta block this used to render made five rows read as the
 * tallest thing in the whole sidebar for information most people only
 * glance at (a status dot + last-run time). The description now lives in
 * the row's title tooltip instead of always being on screen; hover it or
 * open the module page for the full explanation.
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
      <div className="px-1 mb-2 flex items-center justify-between">
        <p className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
          Executions
        </p>
        <span className="text-[10px] font-mono text-zinc-500">
          <span className="text-zinc-600 dark:text-zinc-400">{activeCount} active</span>
          {failedCount > 0 && (
            <span className="text-rose-600 dark:text-rose-400 font-medium"> · {failedCount} issue{failedCount !== 1 ? "s" : ""}</span>
          )}
        </span>
      </div>

      <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-900 rounded-lg overflow-hidden divide-y divide-zinc-200 dark:divide-zinc-900 transition-colors duration-200">
        {SKILLS.map((skill) => {
          const status = skillStatuses[skill];
          const info = SKILL_INFO[skill];
          const lastRun = skillLastRun[skill];
          const runCount = skillRunCounts[skill];

          return (
            <Link
              key={skill}
              href={`/dashboard/modules/${skill}`}
              title={info.description}
              className="flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors group"
            >
              <StatusIcon status={status} />
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 group-hover:text-zinc-950 dark:group-hover:text-zinc-100 truncate transition-colors">
                {info.name}
              </span>
              <span className="ml-auto shrink-0 flex items-center gap-1.5 font-mono text-[10px] text-zinc-400 dark:text-zinc-600 tabular-nums">
                {status === "running" ? (
                  <span className="text-zinc-500 dark:text-zinc-400 animate-pulse">Running…</span>
                ) : lastRun ? (
                  <LiveTime isoString={lastRun.toISOString()} />
                ) : (
                  "Never run"
                )}
                {runCount > 0 && <span className="opacity-70">· {runCount}</span>}
              </span>
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
      <div className="px-1 mb-2 space-y-1">
        <p className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
          Executions
        </p>
      </div>
      <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-900 rounded-lg overflow-hidden divide-y divide-zinc-200 dark:divide-zinc-900">
        {SKILLS.map((skill) => (
          <div key={skill} className="px-2.5 py-1.5 flex items-center gap-2">
            <div className="w-3.5 h-3.5 rounded-full bg-zinc-200 dark:bg-zinc-800 shrink-0" />
        <div className="h-2.5 w-20 rounded-sm bg-zinc-100 dark:bg-zinc-900" />        
          </div>
        ))}
      </div>
    </div>
  );
}