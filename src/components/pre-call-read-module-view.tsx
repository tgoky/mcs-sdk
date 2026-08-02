"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, CheckCircle2, ChevronRight } from "lucide-react";
import { type RunViewMode } from "@/app/dashboard/runs/[id]/_shared/view-switcher";
import { StatusPill } from "@/app/dashboard/runs/[id]/_shared/status-pill";
import type { ModuleClientSummary } from "@/lib/module-overview";
import type { SkillManifestEntry } from "@/lib/skill-manifest";
import { KpiCard, ModuleToolbar, ClientKanbanBoard, ClientDrawer } from "./shared-module-views";

export function PreCallReadModuleView({
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
        <KpiCard label="Configured Rink" value={summaries.length} note="Active accounts" icon={BookOpen} tone="neutral" />
        <KpiCard label="Briefs Synthesized" value={summaries.reduce((a, b) => a + b.totalRuns, 0)} note="Lifetime briefs generated" icon={CheckCircle2} tone="success" />
        <KpiCard label="Healthy Briefers" value={healthyCount} note="Executing without errors" icon={CheckCircle2} tone="success" />
        <KpiCard label="Recall.ai Bots" value="Automated" note="Conferencing integration" icon={BookOpen} tone="info" />
      </div>

      <ModuleToolbar filterText={filterText} setFilterText={setFilterText} mode={mode} setMode={setMode} placeholder="Search client name..." />

      {(mode === "calendar" || mode === "list") && (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl font-sans">
          <table className="w-full text-left text-xs font-sans">
            <thead>
              <tr className="border-b border-zinc-800 text-[10px] uppercase text-zinc-500 bg-zinc-900/50 font-sans">
                <th className="px-4 py-3 font-semibold">Client Name</th>
                <th className="px-4 py-3 font-semibold">Briefing Status</th>
                <th className="px-4 py-3 font-semibold">Failure Streak</th>
                <th className="px-4 py-3 font-semibold">Last Execution</th>
                <th className="px-4 py-3 font-semibold">Total Briefs</th>
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
                  <td className="px-4 py-3 font-mono text-zinc-400">{c.totalRuns} briefs</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/engagements/${c.engagementId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 hover:underline"
                    >
                      Open Roster <ChevronRight size={12} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mode === "board" && <ClientKanbanBoard summaries={filtered} onSelectClient={setSelectedClient} />}

      <ClientDrawer client={selectedClient} onClose={() => setSelectedClient(null)} />
    </div>
  );
}