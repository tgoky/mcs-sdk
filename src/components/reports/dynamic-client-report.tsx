"use client";

// src/components/reports/dynamic-client-report.tsx
//
// Replaces client-report-card.tsx + rep-client-report-card.tsx as two
// separately-gated, hand-shaped cards with one merged view: whichever
// workers are actually enabled for this client contribute their own
// blocks (worker-report-blocks.ts), rendered together through
// each product's own card (under its 30-day results). A client running only Reputation Manager sees
// only RM's blocks; one running 8 skills across both products sees 8 —
// nothing here is shaped around Showtime's Bookings/Show rate/Win-Back
// specifically anymore.

import { type ReactNode } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import type { ReportPeriod } from "@/features/reports/server/report-service";
import type { ReportBlockWithTrend } from "@/lib/worker-report-blocks";
import { computeCorrelationFlags } from "@/lib/report-correlation";
import { StatChip } from "@/components/library/stat-chip";
import { CompareView } from "./compare-view";
import { PERIOD_TABS, useReportPeriod } from "@/app/dashboard/engagements/[id]/report-period-context";
import { WORKER_REGISTRY, workerPrimaryHref, type WorkerId } from "@/lib/worker-registry";
import { RESULTS_WINDOW_DAYS, type ClientResults, type ConnectedResults, type Product } from "@/lib/client-results-shape";
import { HoldoutCard, ProductResultsGrid, ShowRateThenNowCard } from "@/components/analytics/client-results-section";
import { ConnectedResultsCard } from "@/components/analytics/connected-results-card";

/** Which product card a skill's numbers sit in. */
const CARD_OF: Record<string, Product> = { showtime: "showtime", "cold-open": "cold-open", "reputation-manager": "reputation", "whop-agent": "whop" };

const TONE: Record<NonNullable<ReportBlockWithTrend["tone"]>, "neutral" | "success" | "warning" | "danger"> = {
  positive: "success",
  warning: "warning",
  negative: "danger",
  neutral: "neutral",
};

/** A product's skill numbers for the chosen period, inside its card. */
function PeriodRow({ label, blocks }: { label: string; blocks: ReportBlockWithTrend[] }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{label}</p>
      <div className="flex flex-wrap gap-x-8 gap-y-4">
        {blocks.map((block, i) => (
          <div key={`${block.workerId}-${block.label}-${i}`} className="min-w-[110px]">
            <StatChip label={block.label} value={block.displayValue} tone={TONE[block.tone ?? "neutral"]} />
            {block.trendLabel && <p className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 mt-1">{block.trendLabel}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DynamicClientReport({
  engagementId,
  offerDetails,
  blocksByPeriod,
  enabledWorkerIds,
  results,
  connected,
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
  /** What this client got per product, last 30 days against the 30 before
   * (client-results.ts). The same numbers Analytics shows for them. */
  results?: ClientResults | null;
  /** What this client's products did together (connected-results.ts);
   * null with fewer than two products contributing. */
  connected?: ConnectedResults | null;
}) {
  // The tab control itself now renders up in the page header (same line as
  // Pause/Modify) — see report-period-context.tsx — but this component still
  // needs to know which period is selected to pick the right block set.
  const { period } = useReportPeriod();
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

  // Each skill's numbers go in its product's card, under the 30-day results.
  const periodLabel = PERIOD_TABS.find((t) => t.key === period)!.label;
  const blocksByCard = new Map<Product, ReportBlockWithTrend[]>();
  for (const b of blocks) {
    const card = CARD_OF[WORKER_REGISTRY[b.workerId]?.productId];
    if (card) blocksByCard.set(card, [...(blocksByCard.get(card) ?? []), b]);
  }
  const extras: Partial<Record<Product, ReactNode>> = Object.fromEntries(
    [...blocksByCard.entries()].map(([card, list]) => [card, <PeriodRow key={card} label={periodLabel} blocks={list} />])
  );
  const products = results?.products ?? [];
  const hasCards = products.length > 0 || blocksByCard.size > 0;

  const offerName = String(offerDetails?.name ?? "").trim();
  const offerPrice = String(offerDetails?.price ?? "").trim();
  const offerIcp = String(offerDetails?.icp ?? "").trim();
  const trafficTemp = offerDetails?.traffic_temperature ? String(offerDetails.traffic_temperature) : null;

  return (
    <div className="space-y-4">
      {offerName && (
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
              Offer
            </span>
            {trafficTemp && (
              <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 font-mono text-sm capitalize">
                {trafficTemp} traffic
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">{offerName}</h2>
            {offerPrice && <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 font-mono">${offerPrice}</span>}
          </div>
        </div>
      )}

      {connected && <ConnectedResultsCard connected={connected} />}

      {/* Targeting sits above the results cards — who this offer is for,
          read before the numbers those cards report on. */}
      {offerIcp && (
        <div className="text-[15px] text-zinc-800 dark:text-zinc-200 leading-relaxed">
          <span className="font-semibold text-zinc-900 dark:text-zinc-200">Targeting: </span>
          {offerIcp}
        </div>
      )}

      {hasCards ? (
        <div className="space-y-3">
          {products.length > 0 && (
            <p className="text-sm text-zinc-500 dark:text-zinc-500">
              Results, last {RESULTS_WINDOW_DAYS} days against the {RESULTS_WINDOW_DAYS} before
            </p>
          )}
          <ProductResultsGrid products={products} extras={extras} />
          {results?.showRate && <ShowRateThenNowCard showRate={results.showRate} />}
          {results?.holdout && <HoldoutCard holdout={results.holdout} />}
        </div>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No metrics yet for this client&apos;s enabled skills. Check back once they&apos;ve run.</p>
      )}

      {correlationFlags.length > 0 && (
        <div className="space-y-1.5">
          {correlationFlags.map((flag, i) => (
            <p key={i} className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400 leading-relaxed max-w-2xl">
              <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{flag.message}</span>
            </p>
          ))}
        </div>
      )}

      {/* Silent-skills note + Compare live inside the same card treatment as
          the results grid above, instead of as loose text floating below it. */}
      {(silentWorkerIds.length > 0 || hasCards) && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800/80 p-4 space-y-3">
          {silentWorkerIds.length > 0 && (
            // One line however many skills are quiet, opening to the list, so the
            // report doesn't grow a sentence per skill switched on.
            <details className="group text-sm text-zinc-500 dark:text-zinc-500">
              <summary className="cursor-pointer list-none hover:text-zinc-700 dark:hover:text-zinc-300 [&::-webkit-details-marker]:hidden">
                No trends yet for {silentWorkerIds.length === 1 ? WORKER_REGISTRY[silentWorkerIds[0]].name : `${silentWorkerIds.length} skills`}.{" "}
                <span className="underline decoration-dotted underline-offset-2">{silentWorkerIds.length === 1 ? "See its full report" : "See which"}</span>
              </summary>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                {silentWorkerIds.map((id) => (
                  <Link
                    key={id}
                    href={workerPrimaryHref(id, engagementId)}
                    className="hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors underline decoration-dotted underline-offset-2"
                  >
                    {WORKER_REGISTRY[id].name}
                  </Link>
                ))}
              </div>
            </details>
          )}

          <CompareView engagementId={engagementId} />
        </div>
      )}
    </div>
  );
}
