"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Globe, Building2, CheckCircle2, AlertTriangle, PauseCircle, ChevronRight } from "lucide-react";
import { type RunViewMode } from "@/app/dashboard/runs/[id]/_shared/view-switcher";
import { StatusPill } from "@/app/dashboard/runs/[id]/_shared/status-pill";
import type { ModuleClientSummary } from "@/lib/module-overview";
import type { SkillManifestEntry } from "@/lib/skill-manifest";
import { KpiCard, ModuleToolbar, ClientKanbanBoard, ClientDrawer } from "./shared-module-views";

export function PinDownModuleView({
  summaries,
  manifest,
}: {
  summaries: ModuleClientSummary[];
  manifest: SkillManifestEntry;
}) {
  const [mode, setMode] = useState<RunViewMode>("calendar");
  const [filterText, setFilterText] = useState("");
  const [selectedClient, setSelectedClient] = useState<ModuleClientSummary | null>(null);

  const filtered = useMemo(() => {
    return summaries.filter((s) => !filterText || s.buyerName.toLowerCase().includes(filterText.toLowerCase()));
  }, [summaries, filterText]);

  const healthyCount = summaries.filter((s) => s.lastStatus === "success" && s.consecutiveFailures === 0 && !s.pausedAt).length;
  const failureCount = summaries.filter((s) => s.consecutiveFailures > 0 || s.lastStatus === "failed").length;
  const pausedCount = summaries.filter((s) => s.pausedAt !== null || !s.skillEnabled).length;

  return (
    <div className="space-y-5 font-sans">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">{manifest.name} Portfolio</h1>
          <p className="text-xs text-zinc-400 mt-0.5">{manifest.description}</p>
        </div>
        <Link
          href="/dashboard/engagements/new"
          className="flex items-center gap-1.5 rounded-xl bg-amber-400 px-3.5 py-2 text-xs font-bold text-zinc-950 hover:bg-amber-300 transition-colors shadow-sm"
        >
          <Plus size={14} /> Onboard New Client
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 font-sans">
        <KpiCard label="Total Onboarded" value={summaries.length} note="Configured in stack" icon={Building2} tone="neutral" />
        <KpiCard label="Live Deploys" value={healthyCount} note="Confirmation page active" icon={CheckCircle2} tone="success" />
        <KpiCard label="Setup Blockers" value={failureCount} note="Action required" icon={AlertTriangle} tone="danger" />
        <KpiCard label="Paused Accounts" value={pausedCount} note="Automations suspended" icon={PauseCircle} tone="warning" />
      </div>

      {/* DYNAMIC DEPLOYMENT MATRIX */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 font-sans">
        <div className="flex items-center gap-2 mb-2">
          <Globe size={14} className="text-amber-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300 font-mono">
            Deployment & Sync Status
          </h3>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-mono">
          <span className="rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-zinc-300">
            Active Accounts: {healthyCount}
          </span>
          <span className="rounded-lg bg-rose-950/40 border border-rose-900/50 px-3 py-1.5 text-rose-300">
            Action Needed: {failureCount}
          </span>
          <span className="rounded-lg bg-amber-950/40 border border-amber-900/50 px-3 py-1.5 text-amber-300">
            Paused: {pausedCount}
          </span>
        </div>
      </div>

      <ModuleToolbar filterText={filterText} setFilterText={setFilterText} mode={mode} setMode={setMode} placeholder="Search client name..." />

      {(mode === "calendar" || mode === "list") && (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl font-sans">
          <table className="w-full text-left text-xs font-sans">
            <thead>
              <tr className="border-b border-zinc-800 text-[10px] uppercase text-zinc-500 bg-zinc-900/50 font-sans">
                <th className="px-4 py-3 font-semibold">Client Name</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Failure Streak</th>
                <th className="px-4 py-3 font-semibold">Last Active</th>
                <th className="px-4 py-3 font-semibold">Total Runs</th>
                <th className="px-4 py-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.engagementId}
                  onClick={() => setSelectedClient(c)}
                  className="border-b border-zinc-900 hover:bg-zinc-900/40 cursor-pointer font-sans transition-colors"
                >
                  <td className="px-4 py-3 font-bold text-white">{c.buyerName}</td>
                  <td className="px-4 py-3">
                    <StatusPill tone={c.consecutiveFailures > 0 ? "danger" : c.lastStatus === "success" ? "success" : "neutral"}>
                      {c.consecutiveFailures > 0 ? "Action Needed" : c.lastStatus === "success" ? "Active" : "Idle"}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-3 font-mono text-zinc-400">{c.consecutiveFailures} streak</td>
                  <td className="px-4 py-3 font-mono text-zinc-400">{c.lastRunAt ? new Date(c.lastRunAt).toLocaleDateString() : "Never"}</td>
                  <td className="px-4 py-3 font-mono text-zinc-400">{c.totalRuns} runs</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/engagements/${c.engagementId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 hover:underline"
                    >
                      Open Hub <ChevronRight size={12} />
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-xs text-zinc-500 italic">
                    No client records match your search filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {mode === "board" && <ClientKanbanBoard summaries={filtered} onSelectClient={setSelectedClient} />}

      <ClientDrawer client={selectedClient} onClose={() => setSelectedClient(null)} />
    </div>
  );
}