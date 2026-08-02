"use client";

import React from "react";
import Link from "next/link";
import {
  Search,
  AlertTriangle,
  ExternalLink,
  ChevronRight,
  SlidersHorizontal,
  Maximize2,
  Building2,
  CheckCircle2,
  AlertCircle,
  PauseCircle,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { classifyRunError } from "@/lib/error-classification";
import { ViewSwitcher, type RunViewMode } from "@/app/dashboard/runs/[id]/_shared/view-switcher";
import { StatusPill } from "@/app/dashboard/runs/[id]/_shared/status-pill";
import { Sheet, SheetContent, SheetHeader, SheetBody, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import type { ModuleClientSummary } from "@/lib/module-overview";

export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

export function KpiCard({
  label,
  value,
  note,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  note: string;
  icon: LucideIcon;
  tone?: Tone;
}) {
  const toneClass = {
    success: "text-emerald-400",
    danger: "text-rose-400",
    warning: "text-amber-400",
    info: "text-sky-400",
    neutral: "text-zinc-200",
  }[tone];

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 font-sans shadow-md flex flex-col justify-between">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-zinc-400 font-sans">{label}</span>
        <Icon size={15} className="text-zinc-500" />
      </div>
      <div className="mt-3 font-sans">
        <span className={cn("text-2xl font-extrabold font-mono tracking-tight", toneClass)}>{value}</span>
        <p className="text-[11px] text-zinc-500 mt-0.5 font-sans leading-tight">{note}</p>
      </div>
    </div>
  );
}

export function ModuleToolbar({
  filterText,
  setFilterText,
  mode,
  setMode,
  placeholder = "Filter clients...",
}: {
  filterText: string;
  setFilterText: (s: string) => void;
  mode: RunViewMode;
  setMode: (m: RunViewMode) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-zinc-950 p-2 border border-zinc-800 font-sans">
      <div className="relative w-64 font-sans">
        <Search size={13} className="absolute left-3 top-2.5 text-zinc-500" />
        <input
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 py-1.5 pl-8 pr-3 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-700 focus:outline-none font-sans"
        />
      </div>
      <ViewSwitcher value={mode} onChange={setMode} />
    </div>
  );
}

export function ClientKanbanBoard({
  summaries,
  onSelectClient,
}: {
  summaries: ModuleClientSummary[];
  onSelectClient: (client: ModuleClientSummary) => void;
}) {
  const columns = [
    {
      id: "action_needed",
      title: "Action Needed",
      tone: "danger" as const,
      items: summaries.filter((s) => s.consecutiveFailures > 0 || s.lastStatus === "failed"),
    },
    {
      id: "healthy",
      title: "Active & Healthy",
      tone: "success" as const,
      items: summaries.filter(
        (s) =>
          (s.lastStatus === "success" || s.lastStatus === "running") &&
          s.consecutiveFailures === 0 &&
          !s.pausedAt &&
          s.skillEnabled
      ),
    },
    {
      id: "paused",
      title: "Paused / Disabled",
      tone: "warning" as const,
      items: summaries.filter((s) => s.pausedAt !== null || !s.skillEnabled),
    },
    {
      id: "never_run",
      title: "Not Run Yet",
      tone: "neutral" as const,
      items: summaries.filter((s) => !s.lastStatus && s.totalRuns === 0 && !s.pausedAt && s.skillEnabled),
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 font-sans">
      {columns.map((col) => (
        <div key={col.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 flex flex-col gap-2 font-sans">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-xs font-bold text-zinc-300 font-sans">{col.title}</span>
            <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded-md font-bold">
              {col.items.length}
            </span>
          </div>

          <div className="space-y-2 max-h-[650px] overflow-y-auto pr-0.5">
            {col.items.map((client) => {
              const diagnosis = classifyRunError(client.lastErrorMessage);
              const initials = client.buyerName.slice(0, 2).toUpperCase();

              return (
                <button
                  key={client.engagementId}
                  type="button"
                  onClick={() => onSelectClient(client)}
                  className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-900/90 hover:border-zinc-700 p-3 transition-all cursor-pointer group shadow-sm flex flex-col gap-2 font-sans"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
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
                        <AlertTriangle size={11} className="shrink-0 text-rose-400" />
                        {client.consecutiveFailures} Consecutive Failures
                      </p>
                      {diagnosis && <p className="mt-0.5 text-[10px] text-rose-400 truncate">{diagnosis.title}</p>}
                    </div>
                  ) : client.pausedAt ? (
                    <p className="text-[10.5px] text-zinc-500 italic">Paused: {client.pausedReason ?? "Manual pause"}</p>
                  ) : (
                    <div className="flex items-center justify-between text-[10.5px] text-zinc-400 font-mono pt-1 border-t border-zinc-800/80">
                      <span>Last execution</span>
                      <span>{client.lastRunAt ? new Date(client.lastRunAt).toLocaleDateString() : "Never"}</span>
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
  );
}

export function ClientDrawer({
  client,
  onClose,
}: {
  client: ModuleClientSummary | null;
  onClose: () => void;
}) {
  const diagnosis = client ? classifyRunError(client.lastErrorMessage) : null;

  return (
    <Sheet open={!!client} onOpenChange={(open) => !open && onClose()}>
      <SheetContent widthClassName="w-full sm:max-w-xl font-sans antialiased text-zinc-100">
        {client && (
          <div className="flex flex-col h-full font-sans antialiased">
            <SheetHeader className="font-sans">
              <div className="flex items-center justify-between font-sans">
                <div className="flex items-center gap-2 text-amber-400 font-sans">
                  <SlidersHorizontal size={15} />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 font-mono">
                    Client Inspection
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
              {client.consecutiveFailures > 0 && (
                <div className="rounded-xl border border-rose-900/50 bg-rose-950/20 p-3.5 text-xs text-rose-300 font-sans space-y-1">
                  <p className="font-bold flex items-center gap-1.5 font-sans">
                    <AlertTriangle size={14} className="text-rose-400" />
                    Stuck on {client.consecutiveFailures} Consecutive Failure{client.consecutiveFailures === 1 ? "" : "s"}
                  </p>
                  {diagnosis && <p className="text-[11px] text-rose-300 font-sans">{diagnosis.explanation}</p>}
                </div>
              )}

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

              <div className="pt-3 border-t border-zinc-800 space-y-2 font-sans">
                <span className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                  Primary Actions
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