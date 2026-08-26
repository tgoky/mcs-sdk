"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, X, ArrowRight } from "lucide-react";
import { DASHBOARD_COPY as copy, skillName } from "@/lib/copy";
import { VerboseTime } from "@/components/relative-time";

interface SkillBreakdown {
  skillName: string;
  count: number;
}

interface RecentCompletion {
  id: string;
  skillName: string;
  engagementId: string;
  buyerName: string;
  completedAt: string;
  subjectLabel: string | null;
}

export function OverviewStatsPanel({
  activeAccountsCount,
  runningCount,
  pausedCount,
  completedThisWeek,
  completedAllTime,
  weeklyTrend,
  completedThisWeekBySkill,
  recentCompletions,
  issuesCount,
  issuesBreakdown,
}: {
  activeAccountsCount: number;
  runningCount: number;
  pausedCount: number;
  completedThisWeek: number;
  completedAllTime: number;
  weeklyTrend: string | null;
  completedThisWeekBySkill: SkillBreakdown[];
  recentCompletions: RecentCompletion[];
  issuesCount: number;
  issuesBreakdown: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const maxSkillCount = Math.max(1, ...completedThisWeekBySkill.map((s) => s.count));

  if (expanded) {
    return (
      <div className="border-b border-zinc-200 dark:border-zinc-900 pb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 font-mono tracking-wider uppercase">
            {copy.stat.automatedActions} · {copy.stat.automatedActionsThisWeek}
          </p>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" /> Close
          </button>
        </div>

        <div className="pt-1 border-t border-zinc-200/60 dark:border-zinc-900/20 grid gap-4 sm:grid-cols-[auto_1fr]">
          {/* Headline number + per-skill breakdown */}
          <div className="space-y-3 sm:min-w-[220px]">
            <div>
              <div className="flex items-baseline space-x-1.5">
                <span className="text-3xl font-light text-zinc-900 dark:text-zinc-100">{completedThisWeek}</span>
                <span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">{copy.stat.automatedActionsUnit}</span>
              </div>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">
                {weeklyTrend ?? "No completions yet this week"} · {copy.stat.automatedActionsAllTime(completedAllTime)}
              </p>
            </div>

            {completedThisWeekBySkill.length > 0 && (
              <div className="space-y-1.5">
                {completedThisWeekBySkill.map((s) => (
                  <div key={s.skillName} className="space-y-0.5">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-zinc-600 dark:text-zinc-400">{skillName(s.skillName)}</span>
                      <span className="text-zinc-400 dark:text-zinc-500">{s.count}</span>
                    </div>
                    <div className="h-1 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-zinc-400 dark:bg-zinc-600"
                        style={{ width: `${(s.count / maxSkillCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent completions — the "briefly and easily, without going to executions" list */}
          <div className="space-y-1 sm:border-l border-zinc-200 dark:border-zinc-900 sm:pl-4 min-w-0">
            {recentCompletions.length === 0 ? (
              <p className="text-xs text-zinc-400 dark:text-zinc-600 font-mono">Nothing completed yet this week.</p>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                {recentCompletions.map((r) => (
                  <Link
                    key={r.id}
                    href={`/dashboard/engagements/${r.engagementId}`}
                    className="flex items-start justify-between gap-3 py-1.5 group hover:bg-zinc-50 dark:hover:bg-zinc-900/40 -mx-1.5 px-1.5 rounded-md transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">
                        {skillName(r.skillName)} <span className="text-zinc-400 dark:text-zinc-600 font-normal">· {r.buyerName}</span>
                      </p>
                      {r.subjectLabel && (
                        <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 truncate">{r.subjectLabel}</p>
                      )}
                    </div>
                    <VerboseTime
                      isoString={r.completedAt}
                      showFreshIndicator={false}
                      className="text-[11px] shrink-0 whitespace-nowrap"
                    />
                  </Link>
                ))}
              </div>
            )}

            <Link
              href="/dashboard/runs"
              className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors pt-2"
            >
              View all executions <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-zinc-200 dark:border-zinc-900 pb-4">
      <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 mb-3 font-mono tracking-wider uppercase">
        {copy.overviewSectionTitle}
      </p>

      <div className="grid gap-4 sm:grid-cols-3 pt-1 border-t border-zinc-200/60 dark:border-zinc-900/20">
        <div className="space-y-1">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">{copy.stat.activeAccounts}</p>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-light text-zinc-900 dark:text-zinc-100">{activeAccountsCount}</span>
            <span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">
              {runningCount > 0 ? copy.stat.activeAccountsRunning(runningCount) : copy.stat.activeAccountsAllGood}
            </span>
          </div>
          {pausedCount > 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 font-mono">
              {copy.stat.activeAccountsPaused(pausedCount)}
            </p>
          )}
        </div>

        {/* Fix: this used to be a plain div identical to its neighbors —
            clicking it did nothing, so the only way to see what actually
            made up this week's count was to go dig through Executions.
            Now a button that swaps this whole stats row in place for a
            per-skill breakdown + recent list (see the `expanded` branch
            above) — explicitly not a modal/drawer per direct request,
            just a second view of this same space. Chevron only shows on
            hover, as the "there's more here" indication asked for. */}
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="group space-y-1 text-left sm:border-l border-zinc-200 dark:border-zinc-900 sm:pl-4 cursor-pointer rounded-md -m-1 p-1 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors"
        >
          <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium flex items-center gap-1">
            {copy.stat.automatedActions} <span className="text-zinc-400 dark:text-zinc-600">· {copy.stat.automatedActionsThisWeek}</span>
            <ChevronRight className="w-3 h-3 text-zinc-300 dark:text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity" />
          </p>
          <div className="flex items-baseline space-x-1.5">
            <span className="text-3xl font-light text-zinc-900 dark:text-zinc-100">{completedThisWeek}</span>
            <span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">{copy.stat.automatedActionsUnit}</span>
          </div>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">
            {weeklyTrend ?? "No completions yet this week"} · {copy.stat.automatedActionsAllTime(completedAllTime)}
          </p>
        </button>

        <div className="space-y-1 sm:border-l border-zinc-200 dark:border-zinc-900 sm:pl-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">{copy.stat.systemIntegrity}</p>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-light text-zinc-900 dark:text-zinc-100">{issuesCount}</span>
            <span
              className={`text-xs font-mono ${
                issuesCount > 0 ? "text-rose-600 dark:text-rose-400 font-bold" : "text-zinc-400 dark:text-zinc-600"
              }`}
            >
              {issuesCount > 0 ? copy.stat.systemIntegrityFound : copy.stat.systemIntegrityClear}
            </span>
          </div>
          {issuesBreakdown && (
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">{issuesBreakdown}</p>
          )}
        </div>
      </div>
    </div>
  );
}
