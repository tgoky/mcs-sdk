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
// NOW ported (this file's second half, below): severity_scoring's
// composition_weights and the force-trigger signal_classes from
// crisis-triggers.yml.template's auto_activation block — crisis-response-
// service.ts is the skill that reads them, replacing its earlier single
// opaque "the LLM says 73" score with the spec's actual deterministic
// three-factor composite plus signal-class classification.
//
// NOW ALSO ported: anomaly_detection's four composite multipliers —
// anomaly-detection.ts is their consumer, computed and force-triggered
// into crisis-response-service.ts alongside signal-class classification.
//
// STILL NOT ported: the full write_low_or_medium / write_high /
// external_escalation routing tiers. Those gate a draft-for-approval
// flow — nothing in this product drafts a response yet, so there's
// nothing for those tiers to route. Added alongside whichever skill
// first needs them, not speculatively here.

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

/**
 * thresholds.yml.template's severity_scoring.composition_weights — the
 * 40/35/25 split the spec calls "the spec defaults... sensible for any
 * operator from solo to mid-market." Each finding gets scored 1-10 on
 * each axis (see the rubric constants below); the composite is a plain
 * weighted sum, not another LLM guess — deterministic and auditable by
 * design, per the spec's own reasoning for why this is a formula and not
 * a single holistic score.
 */
export const SEVERITY_COMPOSITION_WEIGHTS = {
  reach: 0.4,
  sentiment: 0.35,
  permanence: 0.25,
} as const;

/** Condensed 1/3/5/7/10 anchors from thresholds.yml.template's full 1-10
 * scale tables — enough to ground an LLM's per-axis scoring consistently
 * without reproducing the whole spec file in every prompt. */
export const SEVERITY_AXIS_RUBRIC = {
  reach:
    "How many people can plausibly see this. 1 = a single low-follower account or a reply with no engagement. " +
    "3 = a niche-community post with low engagement. 5 = 1K-10K impressions with a healthy reply rate. " +
    "7 = a viral thread above 100K impressions, or a named account sharing it. " +
    "10 = a Tier-1 publication cover story, front-page Reddit, or top-of-trending.",
  sentiment:
    "Polarity and intensity of the claim. 1 = clearly positive. 3 = neutral or mixed, low intensity. " +
    "5 = mildly negative, factual but not serious. 7 = strongly negative with specific operator claims. " +
    "10 = explicit defamation with named targets, or an AI engine hallucinating a false claim about the operator.",
  permanence:
    "How durable and discoverable the surface is. 1 = ephemeral chat, deleted by default. " +
    "3 = a forum or comment post with low discovery. 5 = a blog comment or indexed news article. " +
    "7 = a review on a third-party platform (Trustpilot, G2, Yelp, Google Business). " +
    "10 = a Wikipedia edit, knowledge-panel content, or an AI engine's own entity description, retrieved on every future query.",
} as const;

/**
 * crisis-triggers.yml.template's auto_activation.signal_classes_force_trigger
 * — categories where the composite score model may under-rate the record
 * but the consequences justify declaring an incident regardless of score.
 * "Keep the default six unless you have a specific reason to drop one,"
 * per the spec.
 */
export const SIGNAL_CLASSES_FORCE_TRIGGER = [
  "defamation_or_false_factual_claim",
  "regulatory_or_legal_action",
  "doxx_or_personal_safety",
  "coordinated_review_bomb",
  "competitor_named_disinfo",
  "adversarial_press_inquiry",
] as const;

export type SignalClass = (typeof SIGNAL_CLASSES_FORCE_TRIGGER)[number];

export function isForceTriggerSignalClass(value: string | null | undefined): value is SignalClass {
  return Boolean(value) && (SIGNAL_CLASSES_FORCE_TRIGGER as readonly string[]).includes(value!);
}

/**
 * thresholds.yml.template's anomaly_detection block — four composite
 * operator triggers, defaults matching "the research document's composite
 * operator thresholds." These watch for a STATISTICAL shape (a rate or
 * mix suddenly changing), independent of whether any individual record
 * was flagged — a spike can fire with zero flagged findings if enough
 * ordinary-looking mentions arrive at once.
 */
export const ANOMALY_DETECTION_DEFAULTS = {
  totalMentionSpike: {
    multiplier: 3.0,
    windowMinutes: 60,
    baselineWindowDays: 7,
  },
  negativeSentimentSpike: {
    thresholdPct: 25,
    windowMinutes: 30,
    baselineWindowDays: 7,
    baselineNegativePctCeiling: 10,
  },
  /** Scoped to Reddit only in this port — subreddit is the only
   * domain-like dimension in the current schema (Trustpilot has no
   * per-review domain; the five AI engines are a fixed set, not
   * "sources" in the spec's sense of a proliferating attack surface). */
  newSourceSpike: {
    newDomainCount: 5,
    windowHours: 24,
  },
  /** Scoped to Trustpilot only — the only source with a "reviewer"
   * concept and a velocity worth tracking. */
  reviewerVelocityDrop: {
    dropPct: 50,
    windowWeeks: 1,
    baselineWindowWeeks: 12,
  },
} as const;

export const ANOMALY_CLASSES = [
  "total_mention_spike",
  "negative_sentiment_spike",
  "new_source_spike",
  "reviewer_velocity_drop",
] as const;

export type AnomalyClass = (typeof ANOMALY_CLASSES)[number];
