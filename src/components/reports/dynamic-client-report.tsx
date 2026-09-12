"use client";

// src/components/reports/dynamic-client-report.tsx
//
// Replaces client-report-card.tsx + rep-client-report-card.tsx as two
// separately-gated, hand-shaped cards with one merged view: whichever
// workers are actually enabled for this client contribute their own
// blocks (worker-report-blocks.ts), rendered together through
// WorkerReportBlockGrid. A client running only Reputation Manager sees
// only RM's blocks; one running 8 skills across both products sees 8 —
// nothing here is shaped around Showtime's Bookings/Show rate/Win-Back
// specifically anymore.

import { useState } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import type { ReportPeriod } from "@/features/reports/server/report-service";
import type { ReportBlockWithTrend } from "@/lib/worker-report-blocks";
import { computeCorrelationFlags } from "@/lib/report-correlation";
import { WorkerReportBlockGrid } from "./worker-report-block-grid";
import { CompareView } from "./compare-view";
import { WORKER_REGISTRY, workerPrimaryHref, type WorkerId } from "@/lib/worker-registry";

const PERIOD_TABS: { key: ReportPeriod; label: string }[] = [
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "all_time", label: "All time" },
];

export function DynamicClientReport({
  engagementId,
  offerDetails,
  blocksByPeriod,
  enabledWorkerIds,
}: {
  engagementId: string;
  /** Real Showtime offer context when this client has one set up (pin-down)
   * — genuinely useful when present, simply absent for an RM-only client
   * rather than shown as an empty Showtime-shaped section. */
  offerDetails?: Record<string, string | boolean> | null;
  blocksByPeriod: Record<ReportPeriod, ReportBlockWithTrend[]>;
  /** Every worker actually enabled for this client — used only to name
   * the ones that contributed zero blocks in any period (pin-down,
   * leak-map, rep-onboarding — anything with genuinely nothing
   * trend-able) so they read as "enabled, nothing numeric to trend here"
   * instead of looking identical to off. This is never a run-status
   * check — a permanently-empty resolver means this forever, whether or
   * not the skill has actually finished running. */
  enabledWorkerIds: WorkerId[];
}) {
  const [period, setPeriod] = useState<ReportPeriod>("week");
  const blocks = blocksByPeriod[period];
  // Real, same-window correlation between a Showtime outcome and an RM
  // risk signal — only ever non-empty when both products are enabled and
  // both actually moved unfavorably this period. See report-correlation.ts.
  const correlationFlags = computeCorrelationFlags(blocks);

  // A worker's resolver either always contributes a block or never does
  // (worker-report-blocks.ts) — never conditionally based on the window —
  // so checking every period's blocks, not just the active tab, correctly
  // identifies "this skill just has nothing trend-able," not a fluke of
  // whichever tab happens to be open.
  const blockWorkerIds = new Set(Object.values(blocksByPeriod).flatMap((list) => list.map((b) => b.workerId)));
  const silentWorkerIds = enabledWorkerIds.filter((id) => !blockWorkerIds.has(id));

  const offerName = String(offerDetails?.name ?? "").trim();
  const offerPrice = String(offerDetails?.price ?? "").trim();
  const offerIcp = String(offerDetails?.icp ?? "").trim();
  const trafficTemp = offerDetails?.traffic_temperature ? String(offerDetails.traffic_temperature) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          {offerName && (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
                  Offer
                </span>
                {trafficTemp && (
                  <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 font-mono text-[10px] capitalize">
                    {trafficTemp} traffic
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-3 flex-wrap">
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">{offerName}</h2>
                {offerPrice && <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 font-mono">${offerPrice}</span>}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5 shrink-0 self-start sm:self-auto">
          {PERIOD_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setPeriod(tab.key)}
              className={`px-2.5 py-1 text-xs font-mono rounded-md transition-colors cursor-pointer ${
                period === tab.key
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {offerIcp && (
        <div className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-3xl">
          <span className="font-semibold text-zinc-900 dark:text-zinc-200">Targeting: </span>
          {offerIcp}
        </div>
      )}

      {correlationFlags.length > 0 && (
        <div className="space-y-1.5">
          {correlationFlags.map((flag, i) => (
            <p key={i} className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 leading-relaxed max-w-2xl">
              <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{flag.message}</span>
            </p>
          ))}
        </div>
      )}

      <WorkerReportBlockGrid blocks={blocks} />

      {silentWorkerIds.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
          {silentWorkerIds.map((id) => (
            <Link
              key={id}
              href={workerPrimaryHref(id, engagementId)}
              className="text-xs text-zinc-400 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors underline decoration-dotted underline-offset-2"
            >
              {WORKER_REGISTRY[id].name} has no trend to show — see its full report
            </Link>
          ))}
        </div>
      )}

      <CompareView engagementId={engagementId} />
    </div>
  );
}
