// Shared Reputation Manager defaults ported from the OG Claude Skill Pack's
// config/thresholds.yml.template (mcs/cms/reputation-system-template).
//
// That template's own comment is the reason this is an application
// constant instead of a per-engagement DB column: "Most operators leave
// this file unchanged at setup and tune at day 30 of operation based on
// actual false-alarm rate. The defaults below are the spec defaults and
// are sensible for any operator from solo to mid-market." Only one value
// out of the whole file — the crisis auto-trigger threat-score floor — is
// called out as something buyers actually adjust per-client, so that's
// the one column repIdentityGraphs carries (crisisThresholdOverride).
//
// The full severity-scoring rubric (reach/sentiment/permanence scales),
// the four-tier routing matrix, and the anomaly-detection multipliers
// live here, not per-row, so a future threshold tuning pass changes one
// place instead of every engagement's stored config drifting out of sync
// with each other. Client-safe (no DB, no Node built-ins) — importable
// from a future "tune your crisis threshold" settings UI without pulling
// in server-only code, same reasoning skill-manifest.ts documents for
// staying separate from skill-registry.ts.
//
// NOT ported: the file's severity_scoring composition_weights,
// anomaly_detection multipliers, and full write_low_or_medium /
// write_high / external_escalation routing tiers. Those exist to drive
// the AI-engine-panel, Trustpilot/Reddit ingestion, and crisis-response
// skills' actual scoring and approval-queue behavior — none of which are
// built yet. Porting the full rubric now, before any code reads it, risks
// getting the shape wrong before real usage proves it out; it gets added
// alongside whichever skill first needs to score an incoming record, not
// speculatively here.

export const REP_THRESHOLD_DEFAULTS = {
  /** Composite threat-score (0-100, produced downstream by whatever skill
   * implements the scoring model) at or above which an incident
   * auto-creates and the sole authority gets paged, regardless of signal
   * class. Source template default: 80. */
  crisisScoreFloor: 80,

  /** Real-time push floor from thresholds.yml.template's
   * real_time_alert_gate — everything below this batches into a daily
   * digest instead of an immediate page, specifically to avoid alert
   * fatigue in the first 30 days of a new engagement. */
  realTimeAlertFloor: 75,

  /** Minimum minutes between an incident being detected and any public
   * response being allowed to go out, even with sole-authority approval —
   * the deliberate anti-hasty-response delay from crisis-triggers.yml.template's
   * response_timing block. */
  minMinutesBeforePublicResponse: 60,
} as const;

/** Resolves the effective crisis-score floor for one engagement — its own
 * override if the buyer set one at intake, otherwise the shared default.
 * Centralized here so every downstream skill that needs this number reads
 * it the same way instead of five copies of `?? 80` drifting apart. */
export function resolveCrisisScoreFloor(crisisThresholdOverride: number | null): number {
  return crisisThresholdOverride ?? REP_THRESHOLD_DEFAULTS.crisisScoreFloor;
}
