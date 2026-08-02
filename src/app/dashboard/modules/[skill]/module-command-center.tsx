"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Search,
  Building2,
  AlertTriangle,
  CheckCircle2,
  PauseCircle,
  Maximize2,
  SlidersHorizontal,
  ChevronRight,
  ExternalLink,
  ArrowLeft,
  Plus,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { classifyRunError } from "@/lib/error-classification";
import { ViewSwitcher, type RunViewMode } from "../../runs/[id]/_shared/view-switcher";
import { StatusPill } from "../../runs/[id]/_shared/status-pill";
import { Sheet, SheetContent, SheetHeader, SheetBody, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ModuleRowActions } from "./module-row-actions";
import type { ModuleClientSummary } from "@/lib/module-overview";
import type { SkillName } from "@/lib/copy";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";
type PageStatus = "live" | "running" | "failed" | "not_run";

function deriveStatus(lastStatus: string | null): PageStatus {
  if (!lastStatus) return "not_run";
  const s = lastStatus.toLowerCase();
  if (s === "success") return "live";
  if (s === "running") return "running";
  if (s === "failed" || s === "timed_out") return "failed";
  return "not_run";
}

function formatAge(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ModuleCommandCenter({
  skill,
  info,
  summaries,
}: {
  skill: SkillName;
  info: { name: string; description: string };
  summaries: ModuleClientSummary[];
}) {
  const [mode, setMode] = useState<RunViewMode>("calendar");
  const [filterText, setFilterText] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "action_needed" | "healthy" | "paused">("all");
  const [selectedClient, setSelectedClient] = useState<ModuleClientSummary | null>(null);

  // Compute Module High-Level Metrics
  const metrics = useMemo(() => {
    const total = summaries.length;
    const actionNeeded = summaries.filter((s) => s.consecutiveFailures > 0 || s.lastStatus === "failed").length;
    const paused = summaries.filter((s) => s.pausedAt !== null || !s.skillEnabled).length;
    const healthy = summaries.filter((s) => s.lastStatus === "success" && s.consecutiveFailures === 0 && !s.pausedAt && s.skillEnabled).length;
    return { total, actionNeeded, paused, healthy };
  }, [summaries]);

  // Repeated Failures Section (Consecutive Failures >= 2)
  const repeatFailures = useMemo(() => {
    return summaries.filter((c) => c.consecutiveFailures >= 2 && !c.pausedAt && c.skillEnabled);
  }, [summaries]);

  // Search & Filtered Summaries
  const filteredSummaries = useMemo(() => {
    return summaries.filter((s) => {
      const q = filterText.toLowerCase().trim();
      const matchesSearch = !q || s.buyerName.toLowerCase().includes(q) || (s.lastErrorMessage ?? "").toLowerCase().includes(q);
      
      if (!matchesSearch) return false;
      if (statusFilter === "action_needed") return s.consecutiveFailures > 0 || s.lastStatus === "failed";
      if (statusFilter === "healthy") return s.lastStatus === "success" && s.consecutiveFailures === 0 && !s.pausedAt && s.skillEnabled;
      if (statusFilter === "paused") return s.pausedAt !== null || !s.skillEnabled;
      return true;
    });
  }, [summaries, filterText, statusFilter]);

  // Group into Kanban Columns
  const boardColumns = useMemo(() => {
    return [
      {
        id: "action_needed",
        title: "Action Needed",
        tone: "danger" as const,
        items: filteredSummaries.filter((s) => s.consecutiveFailures > 0 || s.lastStatus === "failed"),
      },
      {
        id: "healthy",
        title: "Active & Healthy",
        tone: "success" as const,
        items: filteredSummaries.filter((s) => (s.lastStatus === "success" || s.lastStatus === "running") && s.consecutiveFailures === 0 && !s.pausedAt && s.skillEnabled),
      },
      {
        id: "paused",
        title: "Paused / Disabled",
        tone: "warning" as const,
        items: filteredSummaries.filter((s) => s.pausedAt !== null || !s.skillEnabled),
      },
      {
        id: "never_run",
        title: "Not Run Yet",
        tone: "neutral" as const,
        items: filteredSummaries.filter((s) => !s.lastStatus && s.totalRuns === 0 && !s.pausedAt && s.skillEnabled),
      },
    ];
  }, [filteredSummaries]);

  return (
    <div className="flex flex-col gap-5 font-sans antialiased text-zinc-100">
      {/* ----------------------------------------------------------------- */}
      {/* 1. HEADER & PRIMARY ACTIONS                                       */}
      {/* ----------------------------------------------------------------- */}
      <div className="border-b border-zinc-200 dark:border-zinc-900 pb-3 space-y-2 font-sans">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
        >
          <ArrowLeft size={12} /> Dashboard
        </Link>
        <div className="flex items-center justify-between flex-wrap gap-2 font-sans">
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight font-sans">
              {info.name} Agency Command Center
            </h1>
            <p className="text-xs font-normal text-zinc-400 dark:text-zinc-500 font-sans">
              {info.description}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {skill === "pin-down" && (
              <Link
                href="/dashboard/engagements/new"
                className="flex items-center gap-1.5 rounded-xl bg-amber-400 px-3 py-1.5 text-xs font-bold text-zinc-950 hover:bg-amber-300 transition-colors shadow-sm font-sans"
              >
                <Plus size={13} /> Onboard New Client
              </Link>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer font-sans"
            >
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 2. REPEATED FAILURES WARNING SECTION                              */}
      {/* ----------------------------------------------------------------- */}
      {repeatFailures.length > 0 && (
        <div className="space-y-2 font-sans">
          <h2 className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
            <AlertTriangle size={13} /> Failing repeatedly — needs attention
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 font-sans">
            {repeatFailures.map((c) => (
              <div
                key={c.engagementId}
                className="border border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20 rounded-xl p-3 space-y-1.5 font-sans"
              >
                <div className="flex items-center justify-between gap-2 font-sans">
                  <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate font-sans">
                    {c.buyerName}
                  </span>
                  <span className="text-xs font-mono text-rose-600 dark:text-rose-400 font-semibold whitespace-nowrap">
                    {c.consecutiveFailures} nights straight
                  </span>
                </div>
                {c.lastErrorMessage && (
                  <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 line-clamp-2" title={c.lastErrorMessage}>
                    {c.lastErrorMessage}
                  </p>
                )}
                <div className="flex items-center gap-3 pt-1 font-sans">
                  <Link
                    href={`/dashboard/engagements/${c.engagementId}`}
                    className="text-xs font-mono font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-colors inline-flex items-center gap-1"
                  >
                    <PauseCircle size={12} /> Pause or fix credentials
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* 3. KPI METRICS CARDS                                              */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 font-sans">
        <KpiCard label="Total Clients" value={metrics.total} note="Configured for this module" icon={Building2} tone="neutral" />
        <KpiCard label="Healthy Runs" value={metrics.healthy} note="Executing without errors" icon={CheckCircle2} tone="success" />
        <KpiCard label="Failure Streaks" value={metrics.actionNeeded} note="Consecutive run failures" icon={AlertTriangle} tone="danger" />
        <KpiCard label="Paused / Disabled" value={metrics.paused} note="Automations suspended" icon={PauseCircle} tone="warning" />
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 4. ASANA PERSISTENT TOOLBAR                                       */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-zinc-950 p-2 border border-zinc-800 font-sans">
        <div className="flex flex-wrap items-center gap-2 font-sans">
          <div className="relative w-64 font-sans">
            <Search size={13} className="absolute left-3 top-2.5 text-zinc-500" />
            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Search client or error diagnosis..."
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 py-1.5 pl-8 pr-3 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-700 focus:outline-none font-sans"
            />
          </div>

          <div className="flex items-center gap-1 bg-zinc-900/80 p-1 rounded-xl border border-zinc-800/80 text-xs font-sans">
            <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")} label="All" />
            <FilterChip active={statusFilter === "action_needed"} onClick={() => setStatusFilter("action_needed")} label="Action Needed" count={metrics.actionNeeded} danger />
            <FilterChip active={statusFilter === "healthy"} onClick={() => setStatusFilter("healthy")} label="Healthy" count={metrics.healthy} />
            <FilterChip active={statusFilter === "paused"} onClick={() => setStatusFilter("paused")} label="Paused" count={metrics.paused} />
          </div>
        </div>

        <ViewSwitcher value={mode} onChange={setMode} />
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 5. OVERVIEW / LIST VIEW                                           */}
      {/* ----------------------------------------------------------------- */}
      {(mode === "calendar" || mode === "list") && (
        <ClientRollupTable summaries={filteredSummaries} skill={skill} skillLabel={info.name} onSelectClient={setSelectedClient} />
      )}

      {/* ----------------------------------------------------------------- */}
      {/* 6. ASANA KANBAN BOARD VIEW                                        */}
      {/* ----------------------------------------------------------------- */}
      {mode === "board" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 font-sans">
          {boardColumns.map((col) => (
            <div key={col.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 flex flex-col gap-2 font-sans">
              <div className="mb-1 flex items-center justify-between px-1 font-sans">
                <span className="text-xs font-bold text-zinc-300 font-sans">{col.title}</span>
                <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded-md font-bold">
                  {col.items.length}
                </span>
              </div>

              <div className="space-y-2 max-h-[650px] overflow-y-auto pr-0.5 font-sans">
                {col.items.map((client) => {
                  const diagnosis = classifyRunError(client.lastErrorMessage);
                  const initials = client.buyerName.slice(0, 2).toUpperCase();

                  return (
                    <button
                      key={client.engagementId}
                      type="button"
                      onClick={() => setSelectedClient(client)}
                      className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-900/90 hover:border-zinc-700 p-3 transition-all cursor-pointer group shadow-sm flex flex-col gap-2 font-sans"
                    >
                      <div className="flex items-start justify-between gap-2 font-sans">
                        <div className="flex items-center gap-2 min-w-0 font-sans">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold font-mono text-zinc-300 shrink-0">
                            {initials}
                          </div>
                          <div className="min-w-0 font-sans">
                            <p className="text-xs font-bold text-white group-hover:text-amber-400 transition-colors truncate font-sans">
                              {client.buyerName}
                            </p>
                            <p className="text-[10px] text-zinc-500 font-mono truncate">
                              {client.totalRuns} total runs
                            </p>
                          </div>
                        </div>

                        <Maximize2 size={12} className="text-zinc-600 group-hover:text-zinc-300 shrink-0 mt-0.5" />
                      </div>

                      {client.consecutiveFailures > 0 ? (
                        <div className="rounded-lg bg-rose-950/30 border border-rose-900/40 p-2 text-[10.5px] text-rose-300 font-sans">
                          <p className="font-bold flex items-center gap-1 font-sans">
                            <AlertTriangle size={11} className="shrink-0" />
                            {client.consecutiveFailures} Consecutive Failures
                          </p>
                          {diagnosis && <p className="mt-0.5 text-[10px] text-rose-400 truncate font-sans">{diagnosis.title}</p>}
                        </div>
                      ) : client.pausedAt ? (
                        <p className="text-[10.5px] text-zinc-500 italic font-sans">Paused: {client.pausedReason ?? "Manual pause"}</p>
                      ) : (
                        <div className="flex items-center justify-between text-[10.5px] text-zinc-400 font-mono pt-1 border-t border-zinc-800/80">
                          <span>Last active</span>
                          <span>{formatAge(client.lastRunAt)}</span>
                        </div>
                      )}
                    </button>
                  );
                })}

                {col.items.length === 0 && (
                  <div className="rounded-xl border border-dashed border-zinc-900 p-4 text-center text-[10px] text-zinc-600 font-sans">
                    No clients in this state
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* 7. SLIDE-OVER INSPECTION DRAWER                                   */}
      {/* ----------------------------------------------------------------- */}
      <ModuleClientDrawer
        client={selectedClient}
        skillLabel={info.name}
        onClose={() => setSelectedClient(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ROLLUP TABLE COMPONENT
// ---------------------------------------------------------------------------
function ClientRollupTable({
  summaries,
  skill,
  skillLabel,
  onSelectClient,
}: {
  summaries: ModuleClientSummary[];
  skill: SkillName;
  skillLabel: string;
  onSelectClient: (client: ModuleClientSummary) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 font-sans shadow-xl">
      <table className="w-full text-left text-xs font-sans">
        <thead>
          <tr className="border-b border-zinc-800/60 text-[10px] uppercase text-zinc-500 bg-zinc-900/50 font-sans">
            <th className="px-4 py-3 font-semibold">Client Name</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold">Consecutive Failures</th>
            <th className="px-4 py-3 font-semibold">Last Active</th>
            <th className="px-4 py-3 font-semibold">Total Runs</th>
            <th className="px-4 py-3 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((c) => {
            const isPaused = Boolean(c.pausedAt || !c.skillEnabled);

            return (
              <tr
                key={c.engagementId}
                onClick={() => onSelectClient(c)}
                className="border-b border-zinc-900 last:border-b-0 hover:bg-zinc-900/40 cursor-pointer transition-colors font-sans"
              >
                <td className="px-4 py-3 font-bold text-white font-sans flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-mono text-zinc-300 shrink-0">
                    {c.buyerName.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="font-sans">{c.buyerName}</span>
                </td>

                <td className="px-4 py-3 font-sans">
                  {isPaused ? (
                    <StatusPill tone="warning">Paused</StatusPill>
                  ) : c.consecutiveFailures > 0 ? (
                    <StatusPill tone="danger">Stuck ({c.consecutiveFailures})</StatusPill>
                  ) : c.lastStatus === "success" ? (
                    <StatusPill tone="success">Healthy</StatusPill>
                  ) : (
                    <StatusPill tone="neutral">Idle</StatusPill>
                  )}
                </td>

                <td className="px-4 py-3 font-mono">
                  {c.consecutiveFailures > 0 ? (
                    <span className="text-rose-400 font-bold flex items-center gap-1 font-mono">
                      <AlertTriangle size={11} /> {c.consecutiveFailures} streak
                    </span>
                  ) : (
                    <span className="text-zinc-500 font-mono">0 failures</span>
                  )}
                </td>

                <td className="px-4 py-3 font-mono text-zinc-400">
                  {formatAge(c.lastRunAt)}
                </td>

                <td className="px-4 py-3 font-mono text-zinc-300">{c.totalRuns} runs</td>

                <td className="px-4 py-3 text-right font-sans" onClick={(e) => e.stopPropagation()}>
                  <ModuleRowActions
                    engagementId={c.engagementId}
                    buyerName={c.buyerName}
                    skillId={skill}
                    skillLabel={skillLabel}
                    skillEnabled={c.skillEnabled}
                    pausedAt={c.pausedAt}
                  />
                </td>
              </tr>
            );
          })}

          {summaries.length === 0 && (
            <tr>
              <td colSpan={6} className="p-8 text-center text-xs text-zinc-500 italic font-sans">
                No clients match your search filter for this module.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ASANA TASK DETAIL DRAWER (STRICT FONT PERSISTENCE ON PORTAL ROOT)
// ---------------------------------------------------------------------------
function ModuleClientDrawer({
  client,
  skillLabel,
  onClose,
}: {
  client: ModuleClientSummary | null;
  skillLabel: string;
  onClose: () => void;
}) {
  const diagnosis = client ? classifyRunError(client.lastErrorMessage) : null;

  return (
    <Sheet open={!!client} onOpenChange={(open) => !open && onClose()}>
      {/* Explicit font-sans antialiased text-zinc-100 on portal root prevents font mismatch */}
      <SheetContent widthClassName="w-full sm:max-w-xl font-sans antialiased text-zinc-100">
        {client && (
          <div className="flex flex-col h-full font-sans antialiased">
            <SheetHeader className="font-sans">
              <div className="flex items-center justify-between font-sans">
                <div className="flex items-center gap-2 text-amber-400 font-sans">
                  <SlidersHorizontal size={15} />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 font-mono">
                    Client Module Inspection
                  </span>
                </div>
                <StatusPill tone={client.consecutiveFailures > 0 ? "danger" : "success"}>
                  {client.consecutiveFailures > 0 ? "Action Needed" : "Healthy"}
                </StatusPill>
              </div>

              <SheetTitle className="mt-2 text-lg font-bold text-white font-sans">{client.buyerName}</SheetTitle>
              <SheetDescription className="text-xs text-zinc-400 font-sans">
                Engagement ID: {client.engagementId}
              </SheetDescription>
            </SheetHeader>

            <SheetBody className="space-y-4 font-sans pt-2">
              {/* Consecutive Failures Banner */}
              {client.consecutiveFailures > 0 && (
                <div className="rounded-xl border border-rose-900/50 bg-rose-950/20 p-3.5 text-xs text-rose-300 font-sans space-y-1">
                  <p className="font-bold flex items-center gap-1.5 font-sans">
                    <AlertTriangle size={14} className="text-rose-400" />
                    Stuck on {client.consecutiveFailures} Consecutive Failure{client.consecutiveFailures === 1 ? "" : "s"}
                  </p>
                  {diagnosis && <p className="text-[11px] text-rose-300 font-sans">{diagnosis.explanation}</p>}
                </div>
              )}

              {/* Execution Summary Cards */}
              <div className="grid grid-cols-2 gap-2 text-xs font-sans">
                <div className="space-y-0.5 rounded-xl border border-zinc-800 bg-zinc-900 p-2.5 font-sans">
                  <span className="block text-[10px] font-mono uppercase text-zinc-500">Total Lifetime Runs</span>
                  <p className="font-bold text-white font-mono text-sm">{client.totalRuns}</p>
                </div>
                <div className="space-y-0.5 rounded-xl border border-zinc-800 bg-zinc-900 p-2.5 font-sans">
                  <span className="block text-[10px] font-mono uppercase text-zinc-500">Last Execution</span>
                  <p className="font-semibold text-zinc-200 font-mono">
                    {client.lastRunAt ? new Date(client.lastRunAt).toLocaleString() : "Never"}
                  </p>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="pt-3 border-t border-zinc-800 space-y-2 font-sans">
                <span className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-mono">
                  Quick Actions
                </span>
                <div className="flex flex-col gap-2 font-sans">
                  <Link
                    href={`/dashboard/engagements/${client.engagementId}`}
                    className="flex items-center justify-between p-3 rounded-xl border border-zinc-800 bg-zinc-900 text-xs font-semibold text-zinc-200 hover:border-zinc-700 hover:text-white transition-all font-sans"
                  >
                    <span className="font-sans">Open Client Engagement Hub</span>
                    <ExternalLink size={13} />
                  </Link>

                  {diagnosis && (
                    <Link
                      href={
                        diagnosis.isCredentialIssue
                          ? `/dashboard/engagements/${client.engagementId}?fixCredential=1#update-credentials`
                          : `/dashboard/engagements/${client.engagementId}?fixSection=${diagnosis.section}#stack-settings`
                      }
                      className="flex items-center justify-between p-3 rounded-xl border border-amber-900/40 bg-amber-950/20 text-xs font-bold text-amber-300 hover:bg-amber-950/40 transition-all font-sans"
                    >
                      <span className="font-sans">Fix Stack Configuration ({diagnosis.platformLabel})</span>
                      <ChevronRight size={13} />
                    </Link>
                  )}
                </div>
              </div>
            </SheetBody>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// SUB-COMPONENTS
// ---------------------------------------------------------------------------
function KpiCard({
  label,
  value,
  note,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: number;
  note: string;
  icon: React.ElementType;
  tone?: Tone;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 font-sans shadow-md flex flex-col justify-between">
      <div className="flex items-center justify-between gap-2 text-zinc-400 font-sans">
        <span className="text-xs font-bold uppercase tracking-wide text-zinc-400 font-sans">{label}</span>
        <Icon size={15} className={cn(tone === "danger" ? "text-rose-400" : tone === "success" ? "text-emerald-400" : tone === "warning" ? "text-amber-400" : "text-zinc-500")} />
      </div>
      <div className="mt-3 font-sans">
        <span className="text-2xl font-extrabold text-white font-mono">{value}</span>
        <p className="text-[10px] text-zinc-500 mt-0.5 font-sans">{note}</p>
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  count,
  danger,
  onClick,
}: {
  label: string;
  active: boolean;
  count?: number;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors flex items-center gap-1.5 font-sans",
        active
          ? "bg-zinc-800 text-white font-bold"
          : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50",
        danger && count && count > 0 && !active && "text-rose-400"
      )}
    >
      <span className="font-sans">{label}</span>
      {count != null && (
        <span className={cn("text-[10px] font-mono px-1.5 py-0.2 rounded-md font-bold", active ? "bg-zinc-700 text-white" : "bg-zinc-950 text-zinc-400")}>
          {count}
        </span>
      )}
    </button>
  );
}