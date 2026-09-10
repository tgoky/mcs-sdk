// src/components/overview-stats-panel.tsx

"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  X,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Check,
  UserX,
  UserCheck,
  CalendarClock,
  RotateCcw,
  ArrowUpRight,
} from "lucide-react";
import { DASHBOARD_COPY as copy, QUEUE_COPY as queueCopy, skillName } from "@/lib/copy";
import { VerboseTime } from "@/components/relative-time";
import { useQueueItemActions } from "./use-queue-item-actions";
import { getRepairAction } from "@/lib/queue-repair-action";
import { triggerSkillRun } from "@/lib/quick-actions";
import type { QueueItem } from "@/lib/queue";

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
  queueItems = [],
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
  queueItems?: QueueItem[];
}) {
  const [expandedSection, setExpandedSection] = useState<"tasks" | "issues" | null>(null);
  const maxSkillCount = Math.max(1, ...completedThisWeekBySkill.map((s) => s.count));

  // Real, actionable mutations for the issues list below — the same hook
  // queue-panel.tsx uses, so "Needs attention" offers the actual fix
  // instead of only a link to go find it elsewhere. This panel gets
  // queueItems as a one-shot server-rendered prop (no live polling like
  // QueuePanel has), so a resolved item is tracked locally and filtered
  // out immediately rather than waiting on a refetch that never comes
  // without a full page reload.
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [triggerErrorId, setTriggerErrorId] = useState<string | null>(null);
  const { busyId, errorId, errorText, decide, resolveSweepNoShow, dismissSyncSetup, dismissRunFailure, runMutation } =
    useQueueItemActions((id) => setResolvedIds((prev) => new Set(prev).add(id)));

  async function runRepairTrigger(item: QueueItem, engagementId: string, skillNameToRun: string) {
    setTriggeringId(item.id);
    setTriggerErrorId(null);
    const result = await triggerSkillRun(engagementId, skillNameToRun);
    setTriggeringId(null);
    if (!result.ok) setTriggerErrorId(item.id);
  }

  // Actionable issue items (excluding fyi-only and anything just resolved)
  const actionableIssues = queueItems.filter((i) => i.category !== "fyi" && !resolvedIds.has(i.id));

  // Breakdown counts for expanded issues view
  const approveCount = actionableIssues.filter((i) => i.category === "approve").length;
  const actionNeededCount = actionableIssues.filter((i) => i.category === "action_needed").length;
  const alertCount = actionableIssues.filter((i) => i.category === "alert").length;

  if (expandedSection === "tasks") {
    return (
      <div className="border-b border-zinc-200 dark:border-zinc-900 pb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 font-mono tracking-wider uppercase">
            {copy.stat.automatedActions} · {copy.stat.automatedActionsThisWeek}
          </p>
          <button
            type="button"
            onClick={() => setExpandedSection(null)}
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

          {/* Recent completions */}
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

  if (expandedSection === "issues") {
    return (
      <div className="border-b border-zinc-200 dark:border-zinc-900 pb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 font-mono tracking-wider uppercase flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
            {copy.stat.systemIntegrity} · Breakdown
          </p>
          <button
            type="button"
            onClick={() => setExpandedSection(null)}
            className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" /> Close
          </button>
        </div>

        <div className="pt-1 border-t border-zinc-200/60 dark:border-zinc-900/20 grid gap-4 sm:grid-cols-[auto_1fr]">
          {/* Headline count + category summary */}
          <div className="space-y-3 sm:min-w-[220px]">
            <div>
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
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono mt-0.5">
                {issuesBreakdown ?? "All systems operating normally"}
              </p>
            </div>

            {issuesCount > 0 && (
              <div className="space-y-1.5 text-[11px] font-mono">
                {approveCount > 0 && (
                  <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400">
                    <span>Pending approvals</span>
                    <span className="text-amber-600 dark:text-amber-400 font-bold">{approveCount}</span>
                  </div>
                )}
                {actionNeededCount > 0 && (
                  <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400">
                    <span>Action required</span>
                    <span className="text-rose-600 dark:text-rose-400 font-bold">{actionNeededCount}</span>
                  </div>
                )}
                {alertCount > 0 && (
                  <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400">
                    <span>Alerts & failures</span>
                    <span className="text-rose-500 dark:text-rose-400 font-medium">{alertCount}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Actionable issues list */}
          <div className="space-y-1 sm:border-l border-zinc-200 dark:border-zinc-900 sm:pl-4 min-w-0">
            {actionableIssues.length === 0 ? (
              <div className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-600 font-mono py-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                <span>No active issues or pending actions right now.</span>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                {actionableIssues.slice(0, 6).map((item) => {
                  const repair = getRepairAction(item);
                  const itemHref =
                    item.fixHref ?? (item.engagementId ? `/dashboard/engagements/${item.engagementId}` : "/dashboard/queue");
                  const isBusy = busyId === item.id;
                  const isTriggering = triggeringId === item.id;
                  const btnBase =
                    "hover-lift press-settle inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-60";
                  const btnGhost =
                    "hover-lift press-settle inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-lg border border-amber-200 dark:border-amber-500/30 bg-white dark:bg-transparent text-zinc-700 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-60";

                  return (
                    <div key={item.id} className="py-1.5 space-y-1.5">
                      <Link
                        href={itemHref}
                        className="flex items-start justify-between gap-3 group hover:bg-zinc-50 dark:hover:bg-zinc-900/40 -mx-1.5 px-1.5 rounded-md transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                item.category === "approve"
                                  ? "bg-amber-500 dark:bg-amber-400"
                                  : "bg-rose-500 dark:bg-rose-400"
                              }`}
                            />
                            <span className="truncate">{item.title}</span>
                            {item.buyer && (
                              <span className="text-zinc-400 dark:text-zinc-600 font-normal shrink-0">· {item.buyer}</span>
                            )}
                          </div>
                          {item.subtitle && (
                            <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 truncate pl-3">{item.subtitle}</p>
                          )}
                        </div>
                        <VerboseTime
                          isoString={item.createdAt}
                          showFreshIndicator={false}
                          className="text-[11px] shrink-0 whitespace-nowrap"
                        />
                      </Link>

                      {/* Real inline actions — the same mutations the Queue
                          panel's row buttons call, always rendered (no
                          hover-only visibility) so tapping works on mobile,
                          not just clicking on desktop. */}
                      <div className="flex items-center gap-1.5 flex-wrap pl-3">
                        {item.category === "approve" && item.sweepNoShowReview ? (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => decide(item, "approved")}
                              className={`${btnBase} bg-rose-600 dark:bg-rose-500 text-white hover:bg-rose-700 dark:hover:bg-rose-400`}
                              title="Confirm no-show and start Win-Back recovery"
                            >
                              <UserX size={11} /> Confirm no-show
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => resolveSweepNoShow(item, "showed")}
                              className={`${btnBase} bg-emerald-600 dark:bg-emerald-500 text-white dark:text-zinc-950 hover:bg-emerald-700 dark:hover:bg-emerald-400`}
                              title="Log that they actually showed — no Win-Back"
                            >
                              <UserCheck size={11} /> Showed
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => resolveSweepNoShow(item, "rescheduled")}
                              className={`${btnBase} bg-amber-500 text-zinc-950 hover:bg-amber-400`}
                              title="Log that they rescheduled — no Win-Back"
                            >
                              <CalendarClock size={11} /> Rescheduled
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => decide(item, "rejected")}
                              className="text-[10.5px] font-medium text-zinc-500 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 underline cursor-pointer disabled:opacity-60"
                            >
                              Not sure — dismiss
                            </button>
                          </>
                        ) : item.category === "approve" ? (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => decide(item, "approved")}
                              className={`${btnBase} bg-emerald-600 dark:bg-emerald-500 text-white dark:text-zinc-950 hover:bg-emerald-700 dark:hover:bg-emerald-400`}
                            >
                              <Check size={11} /> {queueCopy.actions.approve}
                            </button>
                            <button type="button" disabled={isBusy} onClick={() => decide(item, "rejected")} className={btnGhost}>
                              <X size={11} /> {queueCopy.actions.reject}
                            </button>
                          </>
                        ) : item.category === "action_needed" && item.source === "sync_setup" ? (
                          <>
                            {(repair?.kind === "link" ? repair.href : itemHref) && (
                              <Link
                                href={repair?.kind === "link" ? repair.href : itemHref}
                                className={`${btnBase} bg-amber-400 text-white dark:text-zinc-950 hover:bg-amber-500`}
                              >
                                <ArrowUpRight size={11} /> {repair?.label ?? "Review"}
                              </Link>
                            )}
                            <button type="button" disabled={isBusy} onClick={() => dismissSyncSetup(item)} className={btnGhost}>
                              <X size={11} /> Not now
                            </button>
                          </>
                        ) : item.category === "action_needed" && item.source === "run_failure" ? (
                          <>
                            {repair?.kind === "trigger" ? (
                              <button
                                type="button"
                                disabled={isBusy || isTriggering}
                                onClick={() => runRepairTrigger(item, repair.engagementId, repair.skillName)}
                                className={`${btnBase} bg-amber-400 text-white dark:text-zinc-950 hover:bg-amber-500`}
                              >
                                <RotateCcw size={11} /> {isTriggering ? "Running…" : repair.label}
                              </button>
                            ) : (repair?.kind === "link" ? repair.href : itemHref) ? (
                              <Link
                                href={repair?.kind === "link" ? repair.href : itemHref}
                                className={`${btnBase} bg-amber-400 text-white dark:text-zinc-950 hover:bg-amber-500`}
                              >
                                <ArrowUpRight size={11} /> {repair?.label ?? "Fix now"}
                              </Link>
                            ) : null}
                            <button type="button" disabled={isBusy} onClick={() => dismissRunFailure(item)} className={btnGhost}>
                              <X size={11} /> Not now
                            </button>
                            {triggerErrorId === item.id && (
                              <p className="w-full text-[10.5px] text-rose-600 dark:text-rose-400 font-mono">
                                Couldn&apos;t start the run — try again from the Queue.
                              </p>
                            )}
                          </>
                        ) : item.category === "action_needed" ? (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => decide(item, "resolved")}
                              className={`${btnBase} bg-emerald-600 dark:bg-emerald-500 text-white dark:text-zinc-950 hover:bg-emerald-700 dark:hover:bg-emerald-400`}
                            >
                              <Check size={11} /> {queueCopy.actions.resolve}
                            </button>
                            <button type="button" disabled={isBusy} onClick={() => decide(item, "abandoned")} className={btnGhost}>
                              <X size={11} /> {queueCopy.actions.dismiss}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => runMutation(item, `/api/notifications/${item.id}/read`)}
                            className={btnGhost}
                          >
                            <X size={11} /> {queueCopy.actions.dismiss}
                          </button>
                        )}
                      </div>

                      {errorId === item.id && errorText && (
                        <p className="text-[10.5px] text-rose-600 dark:text-rose-400 font-mono pl-3">{errorText}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <Link
              href="/dashboard/queue"
              className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors pt-2"
            >
              View full Queue <ArrowRight className="w-3 h-3" />
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
        {/* Active Accounts */}
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

        {/* Tasks Completed (Clickable) */}
        <button
          type="button"
          onClick={() => setExpandedSection("tasks")}
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

        {/* System Integrity / Issues (Clickable) */}
        <button
          type="button"
          onClick={() => setExpandedSection("issues")}
          className="group space-y-1 text-left sm:border-l border-zinc-200 dark:border-zinc-900 sm:pl-4 cursor-pointer rounded-md -m-1 p-1 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors"
        >
          <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium flex items-center gap-1">
            {copy.stat.systemIntegrity}
            <ChevronRight className="w-3 h-3 text-zinc-300 dark:text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity" />
          </p>
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
          {issuesBreakdown ? (
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">{issuesBreakdown}</p>
          ) : (
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">Click to view breakdown</p>
          )}
        </button>
      </div>
    </div>
  );
}