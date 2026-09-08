// src/lib/report-correlation.ts
//
// Phase 3 of the reports/analytics rework — the actual thing the whole
// complaint started from: Showtime outcomes and Reputation Manager
// signals sitting as two silent numbers next to each other, nothing ever
// asking whether they're related. Both classifications used here (tone)
// are already computed from real underlying data in
// worker-report-blocks.ts — this doesn't invent a new signal, it just
// says out loud when a real outcome dip and a real risk signal land in
// the same window for the same client, which only two products under one
// roof can even notice.

import type { WorkerReportBlock } from "@/lib/worker-report-blocks";
import type { WorkerId } from "@/lib/worker-registry";

const OUTCOME_WORKER_IDS = new Set<WorkerId>(["pre-call-read", "win-back"]);
const RISK_WORKER_IDS = new Set<WorkerId>([
  "rep-engine-panel",
  "rep-trustpilot-watch",
  "rep-reddit-watch",
  "rep-twitter-watch",
  "rep-crisis-response",
]);

export interface CorrelationFlag {
  outcomeLabel: string;
  riskLabel: string;
  message: string;
}

/** Only ever produces flags when both an outcome block and a risk block
 * exist for the same client in the same period — which naturally
 * requires both products enabled, since a Showtime-only or RM-only
 * client's blocks will never populate the other set at all. */
export function computeCorrelationFlags(blocks: WorkerReportBlock[]): CorrelationFlag[] {
  const outcomesAtRisk = blocks.filter(
    (b) => OUTCOME_WORKER_IDS.has(b.workerId) && (b.tone === "negative" || b.tone === "warning")
  );
  const risksElevated = blocks.filter(
    (b) => RISK_WORKER_IDS.has(b.workerId) && (b.tone === "negative" || b.tone === "warning")
  );

  if (outcomesAtRisk.length === 0 || risksElevated.length === 0) return [];

  const flags: CorrelationFlag[] = [];
  for (const outcome of outcomesAtRisk) {
    for (const risk of risksElevated) {
      flags.push({
        outcomeLabel: outcome.label,
        riskLabel: risk.label,
        message: `${outcome.label} (${outcome.displayValue}) is down the same week ${risk.label.toLowerCase()} shows elevated risk (${risk.displayValue}) — worth checking whether they're connected.`,
      });
    }
  }
  return flags;
}
