"use client";

// src/components/library/product-detail-client.tsx
//
// One Worker's own page (Showtime, Reputation Manager) — where its Skills
// actually get enabled and configured, same as WorkersPanel's inline
// Configure pattern, plus the top-level Install/Uninstall control that
// belongs to the Worker itself, not to any one Skill inside it.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Download, Trash2, Loader2, X } from "lucide-react";
import type { WorkerDefinition, WorkerId } from "@/lib/worker-registry";
import type { WorkerOverviewStat } from "@/lib/worker-analytics";
import { WorkerCard } from "@/components/library/worker-card";
import { StatChip } from "@/components/library/stat-chip";
import { LeakMapConfigForm } from "@/components/worker-config-forms/leak-map-config-form";
import { PinDownConfigForm } from "@/components/worker-config-forms/pin-down-config-form";
import { PreCallReadConfigForm } from "@/components/worker-config-forms/pre-call-read-config-form";
import { RepOnboardingConfigForm } from "@/components/worker-config-forms/rep-onboarding-config-form";
import { WinBackConfigForm } from "@/components/worker-config-forms/win-back-config-form";

export function ProductDetailClient({
  productId,
  name,
  description,
  installed,
  workers,
  enabledWorkerIds,
  workerStats,
  engagementId,
  buyerName,
}: {
  productId: string;
  name: string;
  description: string;
  installed: boolean;
  workers: WorkerDefinition[];
  enabledWorkerIds: string[];
  workerStats: WorkerOverviewStat[];
  engagementId: string | null;
  buyerName?: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedWorker, setExpandedWorker] = useState<WorkerId | null>(null);

  const enabledSet = new Set(enabledWorkerIds);
  const statsById = new Map(workerStats.map((s) => [s.workerId, s]));
  const enabledCount = workers.filter((w) => enabledSet.has(w.id)).length;
  const runsInWindow = workers.reduce((sum, w) => sum + (statsById.get(w.id)?.runsInWindow ?? 0), 0);
  const rates = workers.map((w) => statsById.get(w.id)?.successRate).filter((r): r is number => r !== null && r !== undefined);
  const successRate = rates.length > 0 ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null;

  async function toggleInstalled() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/packages/${productId}`, { method: installed ? "DELETE" : "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Could not ${installed ? "uninstall" : "install"} ${name}.`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not ${installed ? "uninstall" : "install"} ${name}.`);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6 font-sans antialiased">
      <div className="flex items-start gap-3">
        <Link
          href="/dashboard/library"
          className="flex items-center justify-center w-8 h-8 rounded-full border border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/80 dark:bg-zinc-900/80 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 transition-colors shrink-0 mt-0.5"
          aria-label="Back to Library"
        >
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">{name}</h1>
            {installed && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-md">
                <Download size={11} className="stroke-[2.5]" /> Installed
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 max-w-2xl leading-relaxed">{description}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 p-4">
        <div className="flex items-center gap-6">
          <StatChip label="Skills on" value={`${enabledCount}/${workers.length}`} />
          <StatChip label="Runs (7d)" value={String(runsInWindow)} />
          <StatChip
            label="Success rate"
            value={successRate !== null ? `${successRate}%` : "—"}
            tone={successRate === null ? "neutral" : successRate >= 80 ? "success" : "warning"}
          />
        </div>

        <button
          type="button"
          onClick={toggleInstalled}
          disabled={pending}
          className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 ${
            installed
              ? "border border-border bg-zinc-50 dark:bg-zinc-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:border-rose-300 dark:hover:border-rose-800 hover:text-rose-700 dark:hover:text-rose-300 text-zinc-700 dark:text-zinc-200"
              : "bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900"
          }`}
        >
          {pending ? (
            <Loader2 size={13} className="animate-spin" />
          ) : installed ? (
            <Trash2 size={13} />
          ) : (
            <Download size={13} />
          )}
          {pending ? (installed ? "Uninstalling…" : "Installing…") : installed ? "Uninstall" : "Install"}
        </button>
      </div>
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

      {!installed && (
        <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
          Not installed for this client yet — enabling any skill below installs {name} automatically, or click
          Install above to do it explicitly first.
        </div>
      )}

      {/* Same in-place swap OverviewStatsPanel's Tasks/Issues tiles use —
          Configure hides the skill grid and renders the form transparently
          in its place instead of a separate block appended below it. */}
      {expandedWorker && engagementId ? (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setExpandedWorker(null)}
            className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" /> Close — back to skills
          </button>

          {expandedWorker === "leak-map" && (
            <LeakMapConfigForm engagementId={engagementId} onCancel={() => setExpandedWorker(null)} cancelLabel="Close" />
          )}
          {expandedWorker === "pre-call-read" && (
            <PreCallReadConfigForm engagementId={engagementId} onCancel={() => setExpandedWorker(null)} cancelLabel="Close" />
          )}
          {expandedWorker === "win-back" && (
            <WinBackConfigForm engagementId={engagementId} onCancel={() => setExpandedWorker(null)} cancelLabel="Close" />
          )}
          {expandedWorker === "rep-onboarding" && (
            <RepOnboardingConfigForm engagementId={engagementId} onCancel={() => setExpandedWorker(null)} />
          )}
          {expandedWorker === "pin-down" && (
            <PinDownConfigForm
              engagementId={engagementId}
              onCancel={() => setExpandedWorker(null)}
              onSaved={(result) => (result.runId ? router.push(`/dashboard/runs/${result.runId}`) : setExpandedWorker(null))}
              cancelLabel="Close"
            />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
          {workers.map((worker) => (
            <WorkerCard
              key={worker.id}
              worker={worker}
              enabled={enabledSet.has(worker.id)}
              engagementId={engagementId}
              buyerName={buyerName}
              stats={statsById.get(worker.id)}
              isConfiguring={false}
              onToggleConfigure={worker.hasHingesPanel && engagementId ? () => setExpandedWorker(worker.id) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
