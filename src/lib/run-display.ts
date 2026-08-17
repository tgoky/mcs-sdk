import type { RunStep } from "@/models/schema";

/**
 * Pulls the most specific human-readable detail out of a run's step log —
 * e.g. "Sarah Jenkins <sarah@acme.com>", which src/features/pile-on/server/
 * enrollment-service.ts already writes via logStep() for every booking.
 * Scans from the most recent step backward so an in-progress run shows its
 * latest known detail, not whatever the very first step happened to say.
 *
 * Checks `label` first, then falls back to `detail` on the same step —
 * some steps (e.g. the pause/deleted/skill-disabled guardrail checks in
 * src/inngest/skill.ts and booking-webhook.ts) only ever set `detail`
 * ("Engagement is paused (billing) — run skipped."), never `label`, so a
 * label-only read silently returned null for every skipped run.
 *
 * Shared by /api/skill-runs/recent (the live poll), /dashboard/runs (the
 * initial server-rendered page load), and the dashboard overview widget so
 * every source feeding LiveExecutionFeed agrees on what a run's "Action"
 * cell says.
 */
export function latestStepLabel(steps: RunStep[] | null | undefined): string | null {
  if (!steps || steps.length === 0) return null;
  for (let i = steps.length - 1; i >= 0; i--) {
    const label = steps[i]?.label?.trim();
    if (label) return label;
    const detail = steps[i]?.detail?.trim();
    if (detail) return detail;
  }
  return null;
}
