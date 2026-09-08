"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ChevronLeft, Search, X } from "lucide-react";
import { WORKER_IDS, WORKER_REGISTRY, type WorkerId } from "@/lib/worker-registry";
import type { ProductId } from "@/lib/product-catalog";
import type { WorkerOverviewStat } from "@/lib/worker-analytics";
import { WorkerCard } from "@/components/library/worker-card";
import { LeakMapConfigForm } from "@/components/worker-config-forms/leak-map-config-form";
import { PinDownConfigForm } from "@/components/worker-config-forms/pin-down-config-form";
import { PreCallReadConfigForm } from "@/components/worker-config-forms/pre-call-read-config-form";
import { RepOnboardingConfigForm } from "@/components/worker-config-forms/rep-onboarding-config-form";
import { WinBackConfigForm } from "@/components/worker-config-forms/win-back-config-form";
import { useRouter } from "next/navigation";

/**
 * The Library — one card per worker (every skill across every product,
 * not two hardcoded product bundles), enabled ones sorted to the top so
 * they're never buried in a growing catalog. `engagementId` is this
 * workspace's one client (see getPrimaryEngagementIdForWorkspace) —
 * every worker's Enable/Configure/Analytics actions act on that client,
 * since a workspace only ever holds one now.
 */
type StatusFilter = "all" | "installed" | "not_installed";

export function LibraryMarketplaceClient({
  engagementId,
  enabledWorkerIds,
  buyerName,
  workerStats,
}: {
  engagementId: string | null;
  enabledWorkerIds: string[];
  buyerName?: string | null;
  /** Real per-skill workload (runs/7d, success rate, needs-attention) —
   * see worker-analytics.ts's getWorkspaceWorkerOverview, the same rollup
   * /dashboard/analytics/[workerId] uses. Optional only so a caller that
   * hasn't fetched it yet doesn't hard-crash; the Library's own page
   * always provides it. */
  workerStats?: WorkerOverviewStat[];
}) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [productFilter, setProductFilter] = useState<ProductId | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  // Same inline-Configure pattern as WorkersPanel — see that file's own
  // comment for why. The Library is exactly the other "see every skill at
  // once" page this was asked to cover.
  const [expandedWorker, setExpandedWorker] = useState<WorkerId | null>(null);
  const enabledSet = useMemo(() => new Set(enabledWorkerIds), [enabledWorkerIds]);
  const statsById = useMemo(() => {
    const map = new Map<WorkerId, WorkerOverviewStat>();
    for (const s of workerStats ?? []) map.set(s.workerId, s);
    return map;
  }, [workerStats]);

  const workers = useMemo(() => WORKER_IDS.map((id) => WORKER_REGISTRY[id]), []);

  const sorted = useMemo(() => {
    return workers
      .filter((w) => productFilter === "all" || w.productId === productFilter)
      .filter((w) => {
        if (statusFilter === "installed") return enabledSet.has(w.id);
        if (statusFilter === "not_installed") return !enabledSet.has(w.id);
        return true;
      })
      .filter((w) => !searchQuery.trim() || w.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
      .slice()
      .sort((a, b) => {
        const aEnabled = enabledSet.has(a.id) ? 0 : 1;
        const bEnabled = enabledSet.has(b.id) ? 0 : 1;
        if (aEnabled !== bEnabled) return aEnabled - bEnabled;
        return a.name.localeCompare(b.name);
      });
  }, [workers, productFilter, statusFilter, searchQuery, enabledSet]);

  const enabledCount = workers.filter((w) => enabledSet.has(w.id)).length;

  return (
    <div className="relative min-h-screen w-full font-sans transition-colors duration-200 overflow-hidden pb-10">
      <div className="pointer-events-none absolute inset-0 z-0 bg-dot-grid" aria-hidden="true" />

      <div className="relative z-10 w-full space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <Link
              href="/dashboard"
              className="flex items-center justify-center w-8 h-8 rounded-full border border-border bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 transition-colors shrink-0 mt-0.5"
              aria-label="Back to Dashboard"
            >
              <ChevronLeft className="w-4 h-4" />
            </Link>
            <div className="min-w-0 space-y-1.5">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">Library</h1>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 font-medium">
                  Every skill available to this client — read what it does, install it, configure it, and see how much it&rsquo;s actually running.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 -mt-1">
                <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 border border-border text-zinc-800 dark:text-zinc-200 font-mono text-[11px] font-semibold">
                  {workers.length} skills
                </span>
                <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 border border-border text-zinc-800 dark:text-zinc-200 font-mono text-[11px] font-semibold">
                  {enabledCount} installed
                </span>
              </div>
            </div>
          </div>
        </div>

        {!engagementId && (
          <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
            No client yet in this workspace — create one first, then come back here to install skills for them.
          </div>
        )}

        {/* Same in-place swap OverviewStatsPanel's Tasks/Issues tiles use —
            configuring a worker hides the catalog entirely and renders the
            form in its exact place, instead of appending a second block
            below a grid the user would have to scroll past. Transparent,
            no card chrome — the form is the content, not a widget floating
            on top of one. */}
        {expandedWorker && engagementId ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setExpandedWorker(null)}
              className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" /> Close — back to all skills
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
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
                <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl border border-border">
                  {(["all", "installed", "not_installed"] as const).map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setStatusFilter(id)}
                      className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                        statusFilter === id
                          ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs"
                          : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                      }`}
                    >
                      {id === "all" ? "All" : id === "installed" ? "Installed" : "Not installed"}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  {(["all", "showtime", "reputation-manager"] as const).map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setProductFilter(id)}
                      className={`px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                        productFilter === id
                          ? "border-zinc-900 dark:border-white bg-zinc-900 dark:bg-white text-white dark:text-zinc-900"
                          : "border-border text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                      }`}
                    >
                      {id === "all" ? "All" : id === "showtime" ? "Showtime" : "Reputation Manager"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative w-full sm:w-72">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 dark:text-zinc-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search skills…"
                  className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-border focus:outline-none focus:border-amber-400 text-zinc-900 dark:text-white placeholder-zinc-500 dark:placeholder-zinc-400 shadow-sm"
                />
              </div>
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
              {sorted.length} of {workers.length} skill{workers.length === 1 ? "" : "s"}
            </p>

            {sorted.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                No skills match these filters.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
                {sorted.map((worker) => (
                  <WorkerCard
                    key={worker.id}
                    worker={worker}
                    enabled={enabledSet.has(worker.id)}
                    engagementId={engagementId}
                    buyerName={buyerName}
                    stats={statsById.get(worker.id)}
                    isConfiguring={false}
                    onToggleConfigure={
                      worker.hasHingesPanel && engagementId ? () => setExpandedWorker(worker.id) : undefined
                    }
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
