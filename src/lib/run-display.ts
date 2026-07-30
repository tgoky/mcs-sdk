import type { RunStep } from "@/models/schema";

/**
 * Pulls the most specific human-readable detail out of a run's step log —
 * e.g. "Sarah Jenkins <sarah@acme.com>", which src/features/pile-on/server/
 * enrollment-service.ts already writes via logStep() for every booking.
 * Scans from the most recent step backward so an in-progress run shows its
 * latest known detail, not whatever the very first step happened to say.
 *
 * Shared by /api/skill-runs/recent (the live poll) and
 * /dashboard/runs (the initial server-rendered page load) so both sources
 * feeding LiveExecutionFeed agree on what a run's "Action" cell says.
 */
export function latestStepLabel(steps: RunStep[] | null | undefined): string | null {
  if (!steps || steps.length === 0) return null;
  for (let i = steps.length - 1; i >= 0; i--) {
    const label = steps[i]?.label?.trim();
    if (label) return label;
  }
  return null;
}
