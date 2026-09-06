"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ChevronLeft, Search } from "lucide-react";
import { WORKER_IDS, WORKER_REGISTRY } from "@/lib/worker-registry";
import type { ProductId } from "@/lib/product-catalog";
import { WorkerCard } from "@/components/library/worker-card";

/**
 * The Library — one card per worker (every skill across every product,
 * not two hardcoded product bundles), enabled ones sorted to the top so
 * they're never buried in a growing catalog. `engagementId` is this
 * workspace's one client (see getPrimaryEngagementIdForWorkspace) —
 * every worker's Enable/Configure/Analytics actions act on that client,
 * since a workspace only ever holds one now.
 */
export function LibraryMarketplaceClient({
  engagementId,
  enabledWorkerIds,
}: {
  engagementId: string | null;
  enabledWorkerIds: string[];
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [productFilter, setProductFilter] = useState<ProductId | "all">("all");
  const enabledSet = useMemo(() => new Set(enabledWorkerIds), [enabledWorkerIds]);

  const workers = useMemo(() => WORKER_IDS.map((id) => WORKER_REGISTRY[id]), []);

  const sorted = useMemo(() => {
    return workers
      .filter((w) => productFilter === "all" || w.productId === productFilter)
      .filter((w) => !searchQuery.trim() || w.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
      .slice()
      .sort((a, b) => {
        const aEnabled = enabledSet.has(a.id) ? 0 : 1;
        const bEnabled = enabledSet.has(b.id) ? 0 : 1;
        if (aEnabled !== bEnabled) return aEnabled - bEnabled;
        return a.name.localeCompare(b.name);
      });
  }, [workers, productFilter, searchQuery, enabledSet]);

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
                  Every worker available to this client — enable, configure, and see how each one&rsquo;s performing.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 -mt-1">
                <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 border border-border text-zinc-800 dark:text-zinc-200 font-mono text-[11px] font-semibold">
                  {workers.length} workers
                </span>
                <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 border border-border text-zinc-800 dark:text-zinc-200 font-mono text-[11px] font-semibold">
                  {enabledCount} enabled
                </span>
              </div>
            </div>
          </div>
        </div>

        {!engagementId && (
          <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
            No client yet in this workspace — create one first, then come back here to enable workers for them.
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-semibold">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
          {sorted.map((worker) => (
            <WorkerCard key={worker.id} worker={worker} enabled={enabledSet.has(worker.id)} engagementId={engagementId} />
          ))}
        </div>
      </div>
    </div>
  );
}
