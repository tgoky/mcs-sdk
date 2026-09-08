// src/features/reports/server/category-signals.ts
//
// Analytics' deep-dive layer, bounded permanently at the 5 fixed
// WorkerCategory values (worker-registry.ts) instead of one hardcoded
// <Section> per skill. The old page hand-wrote a section per worker
// someone remembered to build — 8 for Showtime, 4 for Reputation
// Manager (three of RM's four monitoring skills merged into one
// generic blob, none of them getting their own section) — and would
// keep growing forever as workers get added. A category with nothing
// flagged across the whole portfolio just renders quiet, same
// at-risk-only convention portfolio-outcomes.ts already established
// one level up this page.

import { WORKER_REGISTRY, type WorkerId, type WorkerCategory } from "@/lib/worker-registry";
import type { PortfolioAccountOutcome } from "./portfolio-outcomes";

export interface CategoryFlaggedItem {
  engagementId: string;
  buyer: string;
  workerId: WorkerId;
  label: string;
  displayValue: string;
}

export interface CategorySignal {
  category: WorkerCategory;
  items: CategoryFlaggedItem[];
}

// "Setup" (pin-down, rep-onboarding) is deliberately excluded — neither
// worker's resolver ever produces a report block or a tone
// (worker-report-blocks.ts), so a Setup row would always render quiet
// with nothing behind it. Same honest-omission convention leak-map's
// own resolver already uses, applied one level up at the category
// grouping.
const SIGNAL_CATEGORIES: WorkerCategory[] = ["Monitoring", "Outreach & Sequences", "Analysis & Briefing", "Crisis & Recovery"];

/**
 * Every negative/warning WorkerReportBlock across the whole portfolio —
 * accounts is already computed by getPortfolioOutcomes, so this is pure
 * reduction, no new queries. extraItems covers a worker whose resolver
 * doesn't produce a block at all (leak-map's real output is a
 * bottleneck report, not a number — see worker-report-blocks.ts — so
 * its signal has to be built by the caller from its own audit data and
 * handed in here, the same way every other worker's tone-based signal
 * already flows through atRiskBlocks).
 */
export function getCategorySignals(
  accounts: PortfolioAccountOutcome[],
  extraItems: CategoryFlaggedItem[] = []
): CategorySignal[] {
  const fromBlocks: CategoryFlaggedItem[] = accounts.flatMap((a) =>
    a.atRiskBlocks.map((b) => ({
      engagementId: a.engagementId,
      buyer: a.buyer,
      workerId: b.workerId,
      label: b.label,
      displayValue: b.displayValue,
    }))
  );

  const allItems = [...fromBlocks, ...extraItems];

  return SIGNAL_CATEGORIES.map((category) => ({
    category,
    items: allItems.filter((item) => WORKER_REGISTRY[item.workerId].category === category),
  }));
}
