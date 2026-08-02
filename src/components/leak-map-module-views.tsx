"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, Building2, CheckCircle2, ChevronRight } from "lucide-react";
import { classifyRunError } from "@/lib/error-classification";
import { type RunViewMode } from "@/app/dashboard/runs/[id]/_shared/view-switcher";
import { StatusPill } from "@/app/dashboard/runs/[id]/_shared/status-pill";
import type { ModuleClientSummary } from "@/lib/module-overview";
import type { SkillManifestEntry } from "@/lib/skill-manifest";
import { KpiCard, ModuleToolbar, ClientKanbanBoard, ClientDrawer } from "./shared-module-views";

export function LeakMapModuleView({
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

  // Dynamically extract real failing clients for the Funnel Risk Matrix
  const failingClients = useMemo(() => {
    return summaries.filter((s) => s.consecutiveFailures > 0 || s.lastStatus === "failed");
  }, [summaries]);

  const healthyCount = summaries.filter((s) => s.lastStatus === "success" && s.consecutiveFailures === 0).length;

  return (
    <div className="space-y-5 font-sans">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">{manifest.name} Portfolio</h1>
          <p className="text-xs text-zinc-400 mt-0.5">{manifest.description}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 font-sans">
        <KpiCard label="Clients Audited" value={summaries.length} note="Weekly audit cycle" icon={Building2} tone="neutral" />
        <KpiCard label="Critical Leaks" value={failingClients.length} note="Active failure streaks" icon={AlertTriangle} tone="danger" />
        <KpiCard label="Healthy Funnels" value={healthyCount} note="Audits passing cleanly" icon={CheckCircle2} tone="success" />
        <KpiCard label="Total Audit Sweeps" value={summaries.reduce((a, b) => a + b.totalRuns, 0)} note="Lifetime audits executed" icon={AlertCircle} tone="info" />
      </div>

      {/* DYNAMIC FUNNEL RISK MATRIX (100% REAL DATA FROM DB) */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 font-sans">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={14} className="text-rose-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300 font-mono">
            Agency Funnel Risk Matrix
          </h3>
        </div>

        {failingClients.length > 0 ? (
          <div className="space-y-2">
            {failingClients.map((client) => {
              const diagnosis = classifyRunError(client.lastErrorMessage);
              return (
                <div
                  key={client.engagementId}
                  onClick={() => setSelectedClient(client)}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl border border-rose-900/40 bg-rose-950/20 text-xs text-rose-300 hover:border-rose-800/60 transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-white">{client.buyerName}</p>
                    <p className="text-[11px] text-rose-300 truncate mt-0.5">
                      {diagnosis?.title ?? client.lastErrorMessage ?? "Audit execution failure recorded"}
                    </p>
                  </div>
                  <span className="font-mono text-[11px] bg-rose-950 border border-rose-900/60 px-2.5 py-1 rounded-md text-rose-400 shrink-0">
                    {client.consecutiveFailures} consecutive
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/80 text-xs text-zinc-400 font-sans">
            All connected client funnels are executing audits without critical failure streaks.
          </div>
        )}
      </div>

      <ModuleToolbar filterText={filterText} setFilterText={setFilterText} mode={mode} setMode={setMode} placeholder="Search client name..." />

      {(mode === "calendar" || mode === "list") && (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl font-sans">
          <table className="w-full text-left text-xs font-sans">
            <thead>
              <tr className="border-b border-zinc-800 text-[10px] uppercase text-zinc-500 bg-zinc-900/50 font-sans">
                <th className="px-4 py-3 font-semibold">Client Name</th>
                <th className="px-4 py-3 font-semibold">Funnel Health</th>
                <th className="px-4 py-3 font-semibold">Failure Streak</th>
                <th className="px-4 py-3 font-semibold">Last Audit</th>
                <th className="px-4 py-3 font-semibold">Total Audits</th>
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
                      {c.consecutiveFailures > 0 ? "Critical Leak" : c.lastStatus === "success" ? "Healthy" : "Idle"}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-3 font-mono text-zinc-400">{c.consecutiveFailures} streak</td>
                  <td className="px-4 py-3 font-mono text-zinc-400">{c.lastRunAt ? new Date(c.lastRunAt).toLocaleDateString() : "Never"}</td>
                  <td className="px-4 py-3 font-mono text-zinc-400">{c.totalRuns} audits</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/engagements/${c.engagementId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 hover:underline"
                    >
                      Open Audit <ChevronRight size={12} />
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