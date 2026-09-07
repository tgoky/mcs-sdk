// src/app/dashboard/active-workers-panel.tsx
//
// Phase 9 — generative dashboard panels. Once "enabled" is uniform data
// (Phase 3's engagementSkills join, read here through
// getEnabledWorkerIdsForEngagement) instead of a product-specific
// boolean, the dashboard can render a card per enabled worker without
// knowing anything about which product it belongs to — the same
// registry-driven-card precedent worker-card.tsx already established for
// the Library, just repurposed here for "what's this client doing right
// now" instead of "enable/configure this." Nothing new to navigate to:
// every link below points at a page that already exists (the worker's
// own Phase 8 analytics page, or its bridges/skill config page) — the
// workspace just visibly grows with what's turned on.

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { WORKER_REGISTRY, type WorkerId } from "@/lib/worker-registry";
import type { WorkerOverviewStat } from "@/lib/worker-analytics";

const PRODUCT_LABELS = { showtime: "Showtime", "reputation-manager": "Reputation Manager" } as const;
const PRODUCT_ACCENT = {
  showtime: "border-amber-200 dark:border-amber-900/70",
  "reputation-manager": "border-indigo-200 dark:border-indigo-900/70",
} as const;

export function ActiveWorkersPanel({
  stats,
  engagementId,
}: {
  stats: WorkerOverviewStat[];
  engagementId: string | null;
}) {
  if (stats.length === 0) return null;

  // Needs-attention workers surface first — the whole point of a
  // generative panel is that something worth a glance floats up on its
  // own, not that a reader has to scan every card to find it.
  const sorted = [...stats].sort((a, b) => {
    if (a.needsAttention !== b.needsAttention) return b.needsAttention - a.needsAttention;
    return b.runsInWindow - a.runsInWindow;
  });

  return (
    <div className="pt-2">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 font-mono tracking-wider uppercase">
          Active workers
        </p>
        <Link
          href="/dashboard/library"
          className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 transition-colors"
        >
          Manage in Library
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((stat) => {
          const worker = WORKER_REGISTRY[stat.workerId as WorkerId];
          const configureHref =
            worker.hasHingesPanel && engagementId
              ? `/dashboard/engagements/${engagementId}/bridges/${worker.id}`
              : engagementId
                ? `/dashboard/engagements/${engagementId}`
                : null;

          return (
            <div
              key={stat.workerId}
              className={`rounded-xl border ${PRODUCT_ACCENT[stat.productId]} bg-white dark:bg-zinc-900/60 p-3.5 flex flex-col gap-2`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">{worker.name}</p>
                  <p className="text-[10px] font-mono text-zinc-500 dark:text-zinc-500 uppercase tracking-wide">
                    {PRODUCT_LABELS[stat.productId]}
                  </p>
                </div>
                {stat.needsAttention > 0 && (
                  <span
                    title="Failing on the most recent run"
                    className="shrink-0 inline-flex items-center gap-1 rounded-md bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-300"
                  >
                    <AlertTriangle className="w-3 h-3" />
                    Attention
                  </span>
                )}
              </div>

              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {stat.runsInWindow > 0
                  ? `${stat.runsInWindow} run${stat.runsInWindow === 1 ? "" : "s"} this week${stat.successRate !== null ? ` · ${stat.successRate}% success` : ""}`
                  : "No runs this week"}
              </p>

              <div className="pt-1 flex items-center gap-2 text-xs font-semibold">
                <Link
                  href={`/dashboard/analytics/${stat.workerId}`}
                  className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 transition-colors"
                >
                  Analytics
                </Link>
                {configureHref && (
                  <>
                    <span className="text-zinc-300 dark:text-zinc-700">&middot;</span>
                    <Link
                      href={configureHref}
                      className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 transition-colors"
                    >
                      Configure
                    </Link>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
