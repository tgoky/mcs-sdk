"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Search,
  Building2,
  FileText,
  TrendingUp,
  AlertCircle,
  Edit2,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ViewSwitcher, type RunViewMode } from "@/app/dashboard/runs/[id]/_shared/view-switcher";
import { StatusPill } from "@/app/dashboard/runs/[id]/_shared/status-pill";
import type { ModuleClientSummary } from "@/lib/module-overview";
import type { SkillManifestEntry } from "@/lib/skill-manifest";
import { ClientKanbanBoard, ClientDrawer } from "./shared-module-views";

type FilterStatus = "all" | "running" | "needs_attention" | "completed";

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "Never run";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function PreCallReadModuleView({
  summaries,
  manifest,
}: {
  summaries: ModuleClientSummary[];
  manifest: SkillManifestEntry;
}) {
  // 1. Drop calendar view — List is now default
  const [mode, setMode] = useState<RunViewMode>("list");
  const [filterText, setFilterText] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [selectedClient, setSelectedClient] = useState<ModuleClientSummary | null>(null);

  // ---------------------------------------------------------------------------
  // 2. COMPUTED METRICS (4 THIN CARDS)
  // ---------------------------------------------------------------------------
  const metrics = useMemo(() => {
    const totalAccounts = summaries.length;
    const activeAccounts = summaries.filter((s) => s.skillEnabled && !s.pausedAt).length;
    const totalAttempts = summaries.reduce((acc, s) => a + s.totalRuns, 0);
    const totalFailures = summaries.reduce((acc, s) => a + s.consecutiveFailures, 0);
    const briefsDelivered = Math.max(0, totalAttempts - totalFailures);
    const failingCount = summaries.filter((s) => s.consecutiveFailures > 0).length;
    const deliveryRate = totalAttempts > 0 ? Math.round((briefsDelivered / totalAttempts) * 100) : 100;

    return {
      activeAccounts,
      totalAccounts,
      briefsDelivered,
      deliveryRate,
      failingCount,
    };
  }, [summaries]);

  // ---------------------------------------------------------------------------
  // 3. FILTERED CLIENTS
  // ---------------------------------------------------------------------------
  const filtered = useMemo(() => {
    return summaries.filter((s) => {
      const q = filterText.toLowerCase().trim();
      const matchesSearch = !q || s.buyerName.toLowerCase().includes(q);

      let matchesStatus = true;
      if (statusFilter === "running") matchesStatus = s.lastStatus === "running";
      if (statusFilter === "needs_attention") matchesStatus = s.consecutiveFailures > 0 || s.lastStatus === "failed";
      if (statusFilter === "completed") matchesStatus = s.lastStatus === "success" && s.consecutiveFailures === 0;

      return matchesSearch && matchesStatus;
    });
  }, [summaries, filterText, statusFilter]);

  return (
    <div className="space-y-5 font-sans antialiased text-zinc-100">
      {/* Module Title Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">{manifest.name} Module</h1>
          <p className="text-xs text-zinc-400 mt-0.5">{manifest.description}</p>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 4 THIN METRIC CARDS                                              */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="flex items-center justify-between p-3 rounded-xl border border-zinc-800 bg-zinc-950 shadow-sm">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Active Accounts</p>
            <p className="text-base font-bold text-white mt-0.5">
              {metrics.activeAccounts} <span className="text-xs font-normal text-zinc-500">/ {metrics.totalAccounts}</span>
            </p>
          </div>
          <Building2 size={16} className="text-zinc-500 shrink-0" />
        </div>

        <div className="flex items-center justify-between p-3 rounded-xl border border-zinc-800 bg-zinc-950 shadow-sm">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Briefs Delivered</p>
            <p className="text-base font-bold text-emerald-400 mt-0.5">{metrics.briefsDelivered}</p>
          </div>
          <FileText size={16} className="text-emerald-500/70 shrink-0" />
        </div>

        <div className="flex items-center justify-between p-3 rounded-xl border border-zinc-800 bg-zinc-950 shadow-sm">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Delivery Rate</p>
            <p className="text-base font-bold text-white mt-0.5">{metrics.deliveryRate}%</p>
          </div>
          <TrendingUp size={16} className="text-sky-500/70 shrink-0" />
        </div>

        <div className="flex items-center justify-between p-3 rounded-xl border border-zinc-800 bg-zinc-950 shadow-sm">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Needs Attention</p>
            <p className={cn("text-base font-bold mt-0.5", metrics.failingCount > 0 ? "text-rose-400" : "text-zinc-400")}>
              {metrics.failingCount}
            </p>
          </div>
          <AlertCircle size={16} className={metrics.failingCount > 0 ? "text-rose-500 shrink-0" : "text-zinc-600 shrink-0"} />
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* ASANA-STYLE TOOLBAR: SEARCH + STATUS PILLS                       */}
      {/* ----------------------------------------------------------------- */}
      <div className="space-y-2.5">
        {/* Full-width Search Input */}
        <div className="relative w-full">
          <Search size={14} className="absolute left-3.5 top-3 text-zinc-500" />
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Find a client..."
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-2.5 pl-10 pr-4 text-xs text-zinc-200 font-sans placeholder:text-zinc-500 focus:border-zinc-700 focus:outline-none transition-colors"
          />
        </div>

        {/* Filter Pills + Mode Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
            {(["all", "running", "needs_attention", "completed"] as FilterStatus[]).map((tab) => {
              const isActive = statusFilter === tab;
              const labels: Record<FilterStatus, string> = {
                all: "All",
                running: "Running",
                needs_attention: "Needs attention",
                completed: "Completed",
              };

              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatusFilter(tab)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap",
                    isActive
                      ? "bg-zinc-800 border-zinc-700 text-white font-semibold"
                      : "bg-zinc-950/60 border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
                  )}
                >
                  {labels[tab]}
                </button>
              );
            })}
          </div>

          <ViewSwitcher value={mode} onChange={setMode} />
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* ASANA-STYLE CURATED LIST VIEW                                    */}
      {/* ----------------------------------------------------------------- */}
      {mode === "list" && (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl font-sans">
          <table className="w-full text-left text-xs font-sans">
            <thead>
              <tr className="border-b border-zinc-800/80 text-[10px] uppercase tracking-wider text-zinc-500 bg-zinc-900/40">
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold text-center w-24">Members</th>
                <th className="px-4 py-3 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {filtered.map((c) => {
                const isFailing = c.consecutiveFailures > 0;
                const tone = isFailing ? "danger" : c.lastStatus === "success" ? "success" : "neutral";
                const statusLabel = isFailing ? "Action Needed" : c.lastStatus === "success" ? "Active" : "Idle";

                return (
                  <tr
                    key={c.engagementId}
                    onClick={() => setSelectedClient(c)}
                    className="group hover:bg-zinc-900/50 transition-colors cursor-pointer"
                  >
                    {/* Name Column */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 group-hover:border-zinc-700 group-hover:text-amber-400 transition-colors shrink-0">
                          <Building2 size={14} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white group-hover:text-amber-300 transition-colors truncate">
                            {c.buyerName}
                          </p>
                          <p className="text-[10.5px] font-mono text-zinc-500 truncate mt-0.5">
                            Last run {formatRelativeTime(c.lastRunAt)} · {c.totalRuns} briefs total
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Members Column (Pink "PR" Skill Avatar Badge) */}
                    <td className="px-4 py-3 text-center">
                      <span
                        className="inline-flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-bold font-mono text-pink-200 bg-pink-950/80 border border-pink-700/60 shadow-xs"
                        title="Pre-Call Read Module"
                      >
                        PR
                      </span>
                    </td>

                    {/* Status & Action Link Column */}
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <StatusPill tone={tone}>{statusLabel}</StatusPill>

                        <Link
                          href={`/dashboard/engagements/${c.engagementId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                          title="Open Client Settings"
                        >
                          <Edit2 size={13} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-xs text-zinc-500 italic">
                    No clients match your filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Kanban Board View */}
      {mode === "board" && (
        <ClientKanbanBoard summaries={filtered} onSelectClient={setSelectedClient} />
      )}

      {/* Client Detail Slide-over Drawer */}
      <ClientDrawer client={selectedClient} onClose={() => setSelectedClient(null)} />
    </div>
  );
}