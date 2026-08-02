"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  List,
  Edit2,
  Clock,
  Maximize2,
  ChevronDown,
  LayoutList,
  Kanban,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/app/dashboard/runs/[id]/_shared/status-pill";
import type { SkillManifestEntry } from "@/lib/skill-manifest";

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
}

type FilterStatus = "all" | "running" | "needs_attention" | "completed";

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "Just now";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
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

export function PreCallReadModuleView({
  runs = [],
  manifest,
}: {
  runs: SkillRun[];
  manifest: SkillManifestEntry;
}) {
  const router = useRouter();
  // Strictly List (default) and Board — Calendar removed completely
  const [mode, setMode] = useState<"list" | "board">("list");
  const [filterText, setFilterText] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");

  // ---------------------------------------------------------------------------
  // FILTERED RUN EXECUTIONS
  // ---------------------------------------------------------------------------
  const filteredRuns = useMemo(() => {
    return runs.filter((r) => {
      const q = filterText.toLowerCase().trim();
      const matchesSearch =
        !q ||
        (r.buyerName ?? "").toLowerCase().includes(q) ||
        (r.subjectLabel ?? "").toLowerCase().includes(q) ||
        (r.id ?? "").toLowerCase().includes(q);

      const s = r.status.toLowerCase();
      let matchesStatus = true;
      if (statusFilter === "running") matchesStatus = s === "running" || s === "in_progress";
      if (statusFilter === "needs_attention") matchesStatus = s === "failed" || s === "error" || s === "timed_out";
      if (statusFilter === "completed") matchesStatus = s === "success" || s === "completed";

      return matchesSearch && matchesStatus;
    });
  }, [runs, filterText, statusFilter]);

  // Board Mode Grouping
  const board = useMemo(() => {
    const cols = {
      running: [] as SkillRun[],
      needs_attention: [] as SkillRun[],
      completed: [] as SkillRun[],
    };
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
      {/* ASANA-STYLE TOOLBAR: SEARCH + PILL FILTERS (PUSHED ALL THE WAY UP)  */}
      {/* ----------------------------------------------------------------- */}
      <div className="space-y-3">
        {/* Full-width Seamless Pill Search Input */}
        <div className="relative w-full">
          <Search size={15} className="absolute left-3.5 top-3 text-zinc-400" />
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Find a project or client..."
            className="w-full rounded-full border border-[#2e3035] bg-[#161719] py-2.5 pl-10 pr-4 text-xs text-zinc-200 font-sans placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none transition-colors"
          />
        </div>

        {/* Filter Pills with Chevron Down + List/Board Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 overflow-x-auto py-0.5">
            {(["all", "running", "needs_attention", "completed"] as FilterStatus[]).map((tab) => {
              const isActive = statusFilter === tab;
              const labels: Record<FilterStatus, string> = {
                all: "Status: All",
                running: "Status: Running",
                needs_attention: "Status: Needs attention",
                completed: "Status: Completed",
              };

              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatusFilter(tab)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer whitespace-nowrap",
                    isActive
                      ? "bg-[#282a2e] border-zinc-400 text-white font-semibold shadow-xs"
                      : "bg-[#161719] border-[#2e3035] text-zinc-300 hover:text-white hover:border-zinc-600"
                  )}
                >
                  <span>{labels[tab]}</span>
                  <ChevronDown size={13} className="text-zinc-400 shrink-0" />
                </button>
              );
            })}
          </div>

          {/* List & Board Switcher Capsule */}
          <div className="flex items-center rounded-full border border-[#2e3035] bg-[#161719] p-0.5">
            <button
              type="button"
              onClick={() => setMode("list")}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer",
                mode === "list"
                  ? "bg-[#282a2e] text-white font-semibold border border-zinc-600"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              <LayoutList size={13} />
              <span>List</span>
            </button>

            <button
              type="button"
              onClick={() => setMode("board")}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer",
                mode === "board"
                  ? "bg-[#282a2e] text-white font-semibold border border-zinc-600"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              <Kanban size={13} />
              <span>Board</span>
            </button>
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* ASANA-STYLE CURATED LIST VIEW (TRANSPARENT, NO CARD CONTAINER)     */}
      {/* ----------------------------------------------------------------- */}
      {mode === "list" && (
        <div className="w-full font-sans border-t border-b border-zinc-800/80 pt-1">
          <table className="w-full text-left text-xs font-sans">
            <thead>
              <tr className="border-b border-zinc-800/80 text-[11px] text-zinc-400">
                <th className="px-4 py-3 font-normal">Name</th>
                <th className="px-4 py-3 font-normal text-center w-28">Members</th>
                <th className="px-4 py-3 font-normal text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filteredRuns.map((r) => {
                const tone = deriveTone(r.status);
                const statusLabel = deriveLabel(r.status);
                const title = r.subjectLabel || r.buyerName || "Pre-Call Brief Execution";

                return (
                  <tr
                    key={r.id}
                    onClick={() => router.push(`/dashboard/runs/${r.id}`)}
                    className="group hover:bg-zinc-800/40 transition-colors cursor-pointer"
                  >
                    {/* Name Column: Mint Icon Container + Primary Title + Emerald Subtext */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        {/* Bright Mint/Teal Box with Dark List Icon */}
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#82e6d4] text-[#05221d] shrink-0 font-bold">
                          <List size={15} strokeWidth={2.5} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white group-hover:text-amber-300 transition-colors truncate">
                            {title}
                          </p>
                          <p className="text-[11px] font-sans text-emerald-400 font-medium truncate mt-0.5">
                            {r.buyerName ?? "Client"} · Last run {formatRelativeTime(r.startedAt)}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Members Column (Solid Pink Circle Avatar) */}
                    <td className="px-4 py-3.5 text-center">
                      <span
                        className="inline-flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-bold text-zinc-950 bg-[#f2a8e4] shadow-xs"
                        title="Pre-Call Read Module"
                      >
                        PR
                      </span>
                    </td>

                    {/* Status Column + Quick Link to Client Engagement */}
                    <td className="px-4 py-3.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <StatusPill tone={tone}>{statusLabel}</StatusPill>

                        {r.engagementId && (
                          <Link
                            href={`/dashboard/engagements/${r.engagementId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                            title="Open Client Engagements Page"
                          >
                            <Edit2 size={13} />
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredRuns.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-xs text-zinc-500 italic">
                    No run history matches your filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* KANBAN BOARD VIEW                                                 */}
      {/* ----------------------------------------------------------------- */}
      {mode === "board" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 font-sans pt-2">
          {(["running", "needs_attention", "completed"] as const).map((colKey) => {
            const colTitles = {
              running: "In Progress",
              needs_attention: "Needs Attention",
              completed: "Completed",
            };

            return (
              <div key={colKey} className="rounded-2xl border border-zinc-800/80 bg-[#161719] p-3 flex flex-col gap-2 font-sans">
                <div className="mb-1 flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-zinc-300">{colTitles[colKey]}</span>
                  <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded-md font-bold">
                    {board[colKey].length}
                  </span>
                </div>

                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-0.5">
                  {board[colKey].map((r) => (
                    <div
                      key={r.id}
                      onClick={() => router.push(`/dashboard/runs/${r.id}`)}
                      className="w-full text-left rounded-xl border border-zinc-800/80 bg-zinc-900/90 hover:border-zinc-700 p-3 transition-all cursor-pointer group shadow-xs flex flex-col gap-2 font-sans"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="inline-flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-bold text-zinc-950 bg-[#f2a8e4] shrink-0">
                            PR
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors truncate">
                              {r.buyerName ?? "Client"}
                            </p>
                          </div>
                        </div>

                        <Maximize2 size={12} className="text-zinc-600 group-hover:text-zinc-300 shrink-0 mt-0.5" />
                      </div>

                      <p className="text-xs text-zinc-300 line-clamp-2 leading-relaxed">
                        {r.subjectLabel || "Pre-Call Brief Execution"}
                      </p>

                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-800/80 text-[10.5px] text-zinc-400 font-mono">
                        <div className="flex items-center gap-1">
                          <Clock size={11} className="text-zinc-500 shrink-0" />
                          <span>{formatRelativeTime(r.startedAt)}</span>
                        </div>

                        <StatusPill tone={deriveTone(r.status)}>{deriveLabel(r.status)}</StatusPill>
                      </div>
                    </div>
                  ))}

                  {board[colKey].length === 0 && (
                    <div className="rounded-xl border border-dashed border-zinc-900 p-4 text-center text-[10px] text-zinc-600">
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