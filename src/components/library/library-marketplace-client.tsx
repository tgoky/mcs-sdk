"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ChevronLeft, Search } from "lucide-react";
import { PRODUCT_IDS, skillIdsForProduct } from "@/lib/product-catalog";
import { WORKSPACE_PRODUCTS } from "@/lib/copy";
import type { WorkerId } from "@/lib/worker-registry";
import type { WorkerOverviewStat } from "@/lib/worker-analytics";
import { ProductCard } from "@/components/library/product-card";

type StatusFilter = "all" | "installed" | "not_installed";

/**
 * The Library — one card per Worker (Showtime, Reputation Manager: the
 * things you actually install), each showing what it does, its real
 * workload, and the Skills bundled inside it. A Skill (Show Rate Setup,
 * Pre-Call Sequence, AI Engine Watch, ...) is never installed on its
 * own — it's enabled and configured on its Worker's own page
 * (/dashboard/library/[product]) once that Worker is installed. Putting
 * an Install button on a Skill card, like this page used to, both
 * mislabeled the action and left no place for a real per-Worker
 * Uninstall to live.
 */
export function LibraryMarketplaceClient({
  engagementId,
  enabledWorkerIds,
  workerStats,
  installedProductIds,
}: {
  engagementId: string | null;
  enabledWorkerIds: string[];
  /** Real per-skill workload (runs/7d, success rate) — see
   * worker-analytics.ts's getWorkspaceWorkerOverview — rolled up per
   * Worker below for its stat chips. */
  workerStats?: WorkerOverviewStat[];
  /** Which Workers this workspace has actually installed — the real
   * top-level entitlement (workspacePackages), independent of whether any
   * of its Skills happen to be enabled for this client. */
  installedProductIds: string[];
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const enabledSet = useMemo(() => new Set(enabledWorkerIds), [enabledWorkerIds]);
  const installedSet = useMemo(() => new Set(installedProductIds), [installedProductIds]);
  const statsById = useMemo(() => {
    const map = new Map<WorkerId, WorkerOverviewStat>();
    for (const s of workerStats ?? []) map.set(s.workerId, s);
    return map;
  }, [workerStats]);

  const products = useMemo(() => {
    return PRODUCT_IDS.map((id) => {
      const meta = WORKSPACE_PRODUCTS.find((p) => p.id === id);
      const skillIds = skillIdsForProduct(id) as WorkerId[];
      const enabledCount = skillIds.filter((s) => enabledSet.has(s)).length;

      let runsInWindow = 0;
      let successSum = 0;
      let successCount = 0;
      for (const skillId of skillIds) {
        const stat = statsById.get(skillId);
        if (!stat) continue;
        runsInWindow += stat.runsInWindow;
        if (stat.successRate !== null) {
          successSum += stat.successRate;
          successCount++;
        }
      }

      return {
        id,
        name: meta?.name ?? id,
        description: meta?.description ?? "",
        skillIds,
        isRep: id === "reputation-manager",
        installed: installedSet.has(id),
        enabledCount,
        runsInWindow,
        successRate: successCount > 0 ? Math.round(successSum / successCount) : null,
      };
    });
  }, [enabledSet, installedSet, statsById]);

  const filtered = useMemo(() => {
    return products
      .filter((p) => {
        if (statusFilter === "installed") return p.installed;
        if (statusFilter === "not_installed") return !p.installed;
        return true;
      })
      .filter((p) => !searchQuery.trim() || p.name.toLowerCase().includes(searchQuery.trim().toLowerCase()));
  }, [products, statusFilter, searchQuery]);

  const installedCount = products.filter((p) => p.installed).length;

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
                  Read what each worker does, see its real workload, install it — then enable and configure the
                  skills inside.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 -mt-1">
                <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 border border-border text-zinc-800 dark:text-zinc-200 font-mono text-[11px] font-semibold">
                  {products.length} workers
                </span>
                <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 border border-border text-zinc-800 dark:text-zinc-200 font-mono text-[11px] font-semibold">
                  {installedCount} installed
                </span>
              </div>
            </div>
          </div>
        </div>

        {!engagementId && (
          <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
            No client yet in this workspace — create one first, then come back here to install a worker for them.
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl border border-border text-xs font-semibold">
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

          <div className="relative w-full sm:w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 dark:text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search workers…"
              className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-border focus:outline-none focus:border-amber-400 text-zinc-900 dark:text-white placeholder-zinc-500 dark:placeholder-zinc-400 shadow-sm"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No workers match these filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
            {filtered.map((p) => (
              <ProductCard
                key={p.id}
                productId={p.id}
                name={p.name}
                description={p.description}
                installed={p.installed}
                skillIds={p.skillIds}
                isRep={p.isRep}
                enabledCount={p.enabledCount}
                runsInWindow={p.runsInWindow}
                successRate={p.successRate}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
