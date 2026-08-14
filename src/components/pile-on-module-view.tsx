"use client";

import { useMemo, useState, useEffect, useCallback, Fragment } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  List,
  ChevronDown,
  LayoutList,
  Kanban,
  Clock,
  Maximize2,
  ArrowUpRight,
  Ban,
  PauseCircle,
  Play, Pause,
  PlayCircle,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/app/dashboard/runs/[id]/_shared/status-pill";
import type { SkillManifestEntry } from "@/lib/skill-manifest";
import { ActionPanel, useQuickActions, type ActionPanelSection } from "@/components/action-panel";
import { cancelSkillRun, pauseEngagement, resumeEngagement, copyToClipboard } from "@/lib/quick-actions";
import { groupBySignature, normalizeForSignature } from "@/lib/list-grouping";
import { GroupCountToggle } from "@/components/group-toggle";
import { phaseLabel } from "@/lib/copy";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import { formatVerboseDate } from "@/components/relative-time";

export interface SkillRun {
  id: string;
  skillName: string;
  status: string;
  phase: string | null;
  startedAt: string;
  completedAt?: string | null;
  engagementId?: string | null;
  buyerName?: string | null;
  errorMessage?: string | null;
  stepCount?: number;
  subjectLabel?: string | null;
  engagementPausedAt?: string | null;
}

type FilterStatus = "all" | "running" | "needs_attention" | "completed";

// ---------------------------------------------------------------------------
// Action & Diagnostic Summaries for Pile-On
// ---------------------------------------------------------------------------
function actionSummary(run: SkillRun): string {
  const s = run.status.toLowerCase();
  if (s === "running" || s === "in_progress") return phaseLabel(run.phase);
  if (s === "failed" || s === "error") {
    if (run.errorMessage && run.errorMessage.length < 90) return run.errorMessage;
    return "Sequence enrollment failed — click to view diagnostic log";
  }
  if (s === "timed_out") return "Timed out — exceeded max execution runtime";
  if (s === "cancelled") return "Cancelled by operator";
  return "Pre-call follow-up sequence enrolled & active";
}

function deriveTone(status: string): "success" | "danger" | "warning" | "neutral" {
  const s = status.toLowerCase();
  if (s === "success" || s === "completed") return "success";
  if (s === "failed" || s === "error" || s === "timed_out") return "danger";
  if (s === "running" || s === "in_progress") return "warning";
  return "neutral";
}

function deriveLabel(status: string): string {
  const s = status.toLowerCase();
  if (s === "success" || s === "completed") return "Done";
  if (s === "failed" || s === "error") return "Failed";
  if (s === "timed_out") return "Timed Out";
  if (s === "running" || s === "in_progress") return "Running";
  return "Pending";
}

function runSignature(run: SkillRun): string {
  const detail = normalizeForSignature(run.errorMessage ?? run.subjectLabel);
  if (!detail) return `solo:${run.id}`;
  return [run.engagementId ?? "no-engagement", run.skillName, run.status.toLowerCase(), detail].join("|");
}

function RelativeTime({ isoString }: { isoString: string }) {
  const compute = useCallback(() => {
    const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }, [isoString]);

  const [label, setLabel] = useState(compute);

  useEffect(() => {
    const id = setInterval(() => setLabel(compute()), 1000);
    return () => clearInterval(id);
  }, [compute]);

  return <span>{label}</span>;
}

// ---------------------------------------------------------------------------
// Quick-Action Builder
// ---------------------------------------------------------------------------
function buildRunSections(
  run: SkillRun,
  dispatch: ReturnType<typeof useQuickActions>["run"],
  closePanel: () => void,
  onDone: () => void
): ActionPanelSection[] {
  const isRunning = run.status.toLowerCase() === "running";
  const isPaused = !!run.engagementPausedAt;

  const primary: ActionPanelSection["items"] = [
    { key: "view", icon: ArrowUpRight, label: "View full run detail", href: `/dashboard/runs/${run.id}` },
  ];

  if (run.engagementId && run.buyerName) {
    primary.push({
      key: "open-engagement",
      icon: ArrowUpRight,
      label: "Open client settings",
      href: `/dashboard/engagements/${run.engagementId}`,
    });
  }

  const runControl: ActionPanelSection["items"] = [];

  if (isRunning) {
    runControl.push({
      key: "cancel",
      icon: Ban,
      label: "Cancel this sequence run",
      tone: "danger",
      onSelect: () => dispatch("cancel", () => cancelSkillRun(run.id), () => { onDone(); closePanel(); }),
    });
  }

  if (run.engagementId) {
    runControl.push(
      isPaused
        ? {
            key: "resume",
            icon: PlayCircle,
            label: "Resume client automations",
            onSelect: () =>
              dispatch("resume", () => resumeEngagement(run.engagementId as string), () => { onDone(); closePanel(); }),
          }
        : {
            key: "pause",
            icon: PauseCircle,
            label: "Pause client automations",
            onSelect: () =>
              dispatch("pause", () => pauseEngagement(run.engagementId as string), () => { onDone(); closePanel(); }),
          }
    );
  }

  const utility: ActionPanelSection["items"] = [
    { key: "copy", icon: Copy, label: "Copy run ID", onSelect: () => dispatch("copy", () => copyToClipboard(run.id)) },
  ];

  const sections: ActionPanelSection[] = [{ label: "Actions", items: primary }];
  if (runControl.length > 0) sections.push({ label: "Run control", items: runControl });
  sections.push({ label: "Utility", items: utility });
  return sections;
}

export function PileOnModuleView({
  runs: initialRuns = [],
  manifest,
}: {
  runs: SkillRun[];
  manifest: SkillManifestEntry;
}) {
  const router = useRouter();
  const [runs, setRuns] = useState<SkillRun[]>(initialRuns);
  const [polling, setPolling] = useState(true);
  const [mode, setMode] = useState<"list" | "board">("list");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [groupRepeats, setGroupRepeats] = useState(true);
  const [pageSize, setPageSize] = useState<10 | 25 | 50>(10);
  const [page, setPage] = useState(0);

  const { busyKey, error, run: dispatch } = useQuickActions();

  // ---------------------------------------------------------------------------
  // Live Background Polling
  // ---------------------------------------------------------------------------
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/skill-runs/recent?skill=pile-on&limit=100", { cache: "no-store", signal });
      if (!res.ok) return;
      const data = await res.json();
      if (data.runs) setRuns(data.runs);
    } catch {
      // Ignored
    }
  }, []);

  useEffect(() => {
    if (!polling) return;
    const controller = new AbortController();
    const interval = setInterval(() => refresh(controller.signal), 5000);
    return () => {
      clearInterval(interval);
      controller.abort();
    };
  }, [polling, refresh]);

  // Dynamic Real-time Status Counts
  const counts = useMemo(() => {
    let running = 0;
    let needsAttention = 0;
    let completed = 0;

    for (const r of runs) {
      const s = r.status.toLowerCase();
      if (s === "running" || s === "in_progress") running++;
      else if (s === "failed" || s === "error" || s === "timed_out") needsAttention++;
      else if (s === "success" || s === "completed") completed++;
    }

    return { all: runs.length, running, needs_attention: needsAttention, completed };
  }, [runs]);

  // Filtered Runs
  const filteredRuns = useMemo(() => {
    return runs.filter((r) => {
      const s = r.status.toLowerCase();
      let matchesStatus = true;
      if (statusFilter === "running") matchesStatus = s === "running" || s === "in_progress";
      if (statusFilter === "needs_attention") matchesStatus = s === "failed" || s === "error" || s === "timed_out";
      if (statusFilter === "completed") matchesStatus = s === "success" || s === "completed";

      return matchesStatus;
    });
  }, [runs, statusFilter]);

  // Grouping Repeats
  const runGroups = useMemo(() => {
    if (!groupRepeats) {
      return filteredRuns.map((r) => ({ signature: r.id, items: [r], latest: r, count: 1 }));
    }
    return groupBySignature(filteredRuns, runSignature, (r) => r.startedAt);
  }, [filteredRuns, groupRepeats]);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  // Quick-action gear menu fix: this was hardcoded open={false} /
  // onOpenChange={() => {}} — a controlled Popover that could never open.
  // One openPanelId tracks which row's menu is open at a time (opening a
  // second one closes the first, same as any menu-bar pattern).
  const [openPanelId, setOpenPanelId] = useState<string | null>(null);
  function toggleGroupExpanded(sig: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(sig)) next.delete(sig);
      else next.add(sig);
      return next;
    });
  }

  // Pagination
  const pageCount = Math.max(1, Math.ceil(runGroups.length / pageSize));
  const clampedPage = Math.min(page, pageCount - 1);
  const pagedGroups = runGroups.slice(clampedPage * pageSize, clampedPage * pageSize + pageSize);

  // Board Mode
  const board = useMemo(() => {
    const cols = { running: [] as SkillRun[], needs_attention: [] as SkillRun[], completed: [] as SkillRun[] };
    for (const r of filteredRuns) {
      const s = r.status.toLowerCase();
      if (s === "running" || s === "in_progress") cols.running.push(r);
      else if (s === "failed" || s === "error" || s === "timed_out") cols.needs_attention.push(r);
      else cols.completed.push(r);
    }
    return cols;
  }, [filteredRuns]);

  return (
    <div className="space-y-3 font-sans antialiased text-zinc-100">
      {/* ----------------------------------------------------------------- */}
      {/* TOOLBAR: STATUS PILLS + LIVE CONTROLS                             */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        {/* Transparent Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto py-0.5">
          {(["all", "running", "needs_attention", "completed"] as FilterStatus[]).map((tab) => {
            const isActive = statusFilter === tab;
            const labels: Record<FilterStatus, string> = {
              all: `All ${counts.all}`,
              running: `Running ${counts.running}`,
              needs_attention: `Needs attention ${counts.needs_attention}`,
              completed: `Completed ${counts.completed}`,
            };

            return (
              <button
                key={tab}
                type="button"
                onClick={() => { setStatusFilter(tab); setPage(0); }}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer whitespace-nowrap bg-transparent",
                  isActive
                    ? "border-zinc-400 text-white font-semibold"
                    : "border-zinc-800/90 text-zinc-400 hover:text-white hover:border-zinc-600"
                )}
              >
                <span>{labels[tab]}</span>
                <ChevronDown size={13} className="text-zinc-400 shrink-0" />
              </button>
            );
          })}
        </div>

        {/* Live Controls + View Switcher */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setPolling((p) => !p)}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer select-none",
              polling
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                : "border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
            )}
            title={polling ? "Pause live polling" : "Resume live polling"}
          >
            {polling ? (
              <>
                <Pause size={12} className="fill-current shrink-0" />
                <span>Live</span>
              </>
            ) : (
              <>
                <Play size={12} className="fill-current shrink-0 ml-0.5" />
                <span>Paused</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => setGroupRepeats((g) => !g)}
            className={cn(
              "px-2.5 py-1 rounded-full text-[11px] font-mono border transition-colors cursor-pointer bg-transparent",
              groupRepeats ? "border-zinc-600 text-zinc-300" : "border-zinc-800 text-zinc-500"
            )}
          >
            Group Repeats {groupRepeats ? "ON" : "OFF"}
          </button>

          <div className="flex items-center rounded-full border border-zinc-800/90 bg-transparent p-0.5">
            <button
              type="button"
              onClick={() => setMode("list")}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer bg-transparent",
                mode === "list" ? "text-white font-semibold border border-zinc-600" : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              <LayoutList size={13} />
              <span>List</span>
            </button>

            <button
              type="button"
              onClick={() => setMode("board")}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer bg-transparent",
                mode === "board" ? "text-white font-semibold border border-zinc-600" : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              <Kanban size={13} />
              <span>Board</span>
            </button>
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* TRANSPARENT LIST VIEW                                             */}
      {/* ----------------------------------------------------------------- */}
      {mode === "list" && (
        <div className="w-full font-sans border-t border-b border-zinc-800/80 pt-1">
          <table className="w-full text-left text-xs font-sans">
            <thead>
              <tr className="border-b border-zinc-800/80 text-[11px] text-zinc-400">
                <th className="px-4 py-3 font-normal">Name & Diagnostic Action</th>
                <th className="px-4 py-3 font-normal text-center w-24">Skill</th>
                <th className="px-4 py-3 font-normal text-right">Status</th>
                <th className="w-10 px-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {pagedGroups.map((group) => {
                const r = group.latest;
                const tone = deriveTone(r.status);
                const statusLabel = deriveLabel(r.status);
                const isFailed = r.status.toLowerCase() === "failed" || r.status.toLowerCase() === "timed_out";
                const expanded = expandedGroups.has(group.signature);

                return (
                  <Fragment key={group.signature}>
                    <tr
                      onClick={() => router.push(`/dashboard/runs/${r.id}`)}
                      className="group hover:bg-zinc-800/30 transition-colors cursor-pointer"
                    >
                      {/* Name Column: Mint Container + Title + Green/Red Subtext */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-mint text-accent-mint-foreground shrink-0 font-bold">
                            <List size={15} strokeWidth={2.5} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-semibold text-white group-hover:text-amber-300 transition-colors truncate">
                                {r.buyerName ?? "Client"}
                              </p>
                              {r.subjectLabel && (
                                <span className="text-[11px] font-mono text-zinc-400 truncate">
                                  ({r.subjectLabel})
                                </span>
                              )}
                            </div>
                            <p
                              className={cn(
                                "text-[11px] font-sans font-medium truncate mt-0.5",
                                isFailed ? "text-rose-400 font-mono" : "text-emerald-400"
                              )}
                            >
                           {actionSummary(r)} · <span title={formatVerboseDate(r.startedAt).full}>{formatVerboseDate(r.startedAt).absolute}</span>
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Skill Member Badge: SquishySkillBadge for Pile-On */}
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex justify-center">
                          <SquishySkillBadge skill="pile-on" size={24} enabled={true} />
                        </div>
                      </td>

                      {/* Status + Group Count Toggle */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          <StatusPill tone={tone}>{statusLabel}</StatusPill>
                          {group.count > 1 && (
                            <GroupCountToggle
                              count={group.count}
                              expanded={expanded}
                              onToggle={() => toggleGroupExpanded(group.signature)}
                            />
                          )}
                        </div>
                      </td>

                      {/* Quick-Action Gear Menu */}
                      <td className="pr-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <ActionPanel
                          open={openPanelId === r.id}
                          onOpenChange={(next) => setOpenPanelId(next ? r.id : null)}
                          sections={buildRunSections(r, dispatch, () => setOpenPanelId(null), refresh)}
                          errorText={error}
                          busyKey={busyKey}
                          triggerLabel={`Quick actions for ${r.buyerName ?? "run"}`}
                        />
                      </td>
                    </tr>

                    {/* Expanded Duplicate Group Rows */}
                    {expanded &&
                      group.items.slice(1).map((subRun) => (
                        <tr
                          key={subRun.id}
                          onClick={() => router.push(`/dashboard/runs/${subRun.id}`)}
                          className="group bg-zinc-950/40 hover:bg-zinc-800/30 transition-colors cursor-pointer border-l-2 border-l-purple-400/50"
                        >
                          <td className="px-4 py-2.5 pl-12">
                            <p className="text-[11px] font-mono text-zinc-400 truncate">
                           {actionSummary(subRun)} · <span title={formatVerboseDate(subRun.startedAt).full}>{formatVerboseDate(subRun.startedAt).absolute}</span>
                            </p>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <span className="text-[10px] font-mono text-zinc-600">repeat</span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <StatusPill tone={deriveTone(subRun.status)}>{deriveLabel(subRun.status)}</StatusPill>
                          </td>
                          <td />
                        </tr>
                      ))}
                  </Fragment>
                );
              })}

              {pagedGroups.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-xs text-zinc-500 italic">
                    No run history matches your filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Bottom Pagination Controls */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800/80">
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500">
              {([10, 25, 50] as const).map((size) => (
                <button
                  key={size}
                  onClick={() => setPageSize(size)}
                  className={cn(
                    "px-2 py-0.5 rounded border transition-colors cursor-pointer",
                    pageSize === size ? "border-zinc-600 bg-zinc-800 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  {size}/page
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
              <span>Page {clampedPage + 1} of {pageCount}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={clampedPage === 0}
                  className="px-2 py-1 rounded border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={clampedPage >= pageCount - 1}
                  className="px-2 py-1 rounded border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* KANBAN BOARD VIEW                                                 */}
      {/* ----------------------------------------------------------------- */}
      {mode === "board" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 font-sans pt-2">
          {(["running", "needs_attention", "completed"] as const).map((colKey) => {
            const colTitles = { running: "In Progress", needs_attention: "Needs Attention", completed: "Completed" };

            return (
              <div key={colKey} className="rounded-2xl border border-zinc-800/80 bg-transparent p-3 flex flex-col gap-2 font-sans">
                <div className="mb-1 flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-zinc-300">{colTitles[colKey]}</span>
                  <span className="text-[10px] font-mono text-zinc-500 border border-zinc-800 px-2 py-0.5 rounded-md font-bold">
                    {board[colKey].length}
                  </span>
                </div>

                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-0.5">
                  {board[colKey].map((r) => (
                    <div
                      key={r.id}
                      onClick={() => router.push(`/dashboard/runs/${r.id}`)}
                      className="w-full text-left rounded-xl border border-zinc-800/80 bg-transparent hover:border-zinc-700 p-3 transition-all cursor-pointer group flex flex-col gap-2 font-sans"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <SquishySkillBadge skill="pile-on" size={24} enabled={true} />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors truncate">
                              {r.buyerName ?? "Client"}
                            </p>
                          </div>
                        </div>

                        <Maximize2 size={12} className="text-zinc-600 group-hover:text-zinc-300 shrink-0 mt-0.5" />
                      </div>

                      <p className="text-xs text-zinc-300 line-clamp-2 leading-relaxed">
                        {actionSummary(r)}
                      </p>

                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-800/80 text-[10.5px] text-zinc-400 font-mono">
                     <span title={formatVerboseDate(r.startedAt).full} className="text-[10.5px]">
  {formatVerboseDate(r.startedAt).absolute}
</span>

                        <StatusPill tone={deriveTone(r.status)}>{deriveLabel(r.status)}</StatusPill>
                      </div>
                    </div>
                  ))}

                  {board[colKey].length === 0 && (
                    <div className="rounded-xl border border-dashed border-zinc-800 p-4 text-center text-[10px] text-zinc-600">
                      No runs in this column
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}