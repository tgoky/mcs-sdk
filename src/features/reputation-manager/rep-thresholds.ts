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
// NOW ALSO ported (this file's third half, below resolveResponseTier):
// the full write_low_or_medium / write_high / external_escalation routing
// tiers. response-routing.ts is their consumer, called from
// crisis-response-service.ts right after an incident is declared — each
// contributing finding's already-computed compositeScore and signalClass
// route it to tier 1 (auto-draft, one-click approve), tier 2 (auto-draft,
// review-and-approve), tier 3 (no draft — page the operator with the
// evidence and let them choose a posture first), or tier 4 (evidence
// package, external handoff, no draft at all).

export const REP_THRESHOLD_DEFAULTS = {
  /** Composite threat-score (0-100, produced downstream by whatever skill
   * implements the scoring model) at or above which an incident
   * auto-creates and the sole authority gets paged, regardless of signal
   * class. Source template default: 80. */
  crisisScoreFloor: 80,

  /** Real-time push floor from thresholds.yml.template's
   * real_time_alert_gate — everything below this batches into a daily
   * digest instead of an immediate page, specifically to avoid alert
   * fatigue in the first 30 days of a new engagement. Consumer:
   * crisis-response-service.ts's runRepCrisisResponse fires a lighter,
   * non-incident "elevated activity" notification (severity "warning", no
   * repIncidents row) when a batch's max compositeScore clears this floor
   * but stays under crisisScoreFloor — everything below THIS floor gets no
   * immediate push at all and only surfaces in digest.ts's next run. */
  realTimeAlertFloor: 75,

  /** Minimum minutes between an incident being detected and any public
   * response being allowed to go out, even with sole-authority approval —
   * the deliberate anti-hasty-response delay from crisis-triggers.yml.template's
   * response_timing block. Consumer: decidePendingAction (approval-gate.ts)
   * refuses to approve a "rep_response_approval" pending action until this
   * many minutes have passed since the related incident's declaredAt —
   * the row stays "pending" (not failed) so the operator can just retry
   * the approve once the window clears. */
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

/**
 * thresholds.yml.template's routing matrix (write_low_or_medium /
 * write_high / external_escalation) — response-routing.ts is the
 * consumer. A finding's compositeScore is already "severity axis average
 * x10" (see scoreFindings in crisis-response-service.ts: three 1-10 axes
 * weighted-summed to ~1-10, then x10 for a 0-100 reporting scale), so the
 * spec's 1-10 severity_range boundaries map onto compositeScore by the
 * same x10 factor: [1,4]->(0,40], [5,6]->(40,60], [7,10]->(60,100].
 */
export const RESPONSE_TIER_SCORE_BOUNDS = {
  tier1Max: 40, // severity 1-4, compositeScore <= 40
  tier2Max: 60, // severity 5-6, compositeScore 41-60; above is severity 7-10
} as const;

export type ResponseTier = "tier1_one_click" | "tier2_review" | "tier3_pause_and_instruct" | "tier4_external_escalation";

/**
 * The subset of SIGNAL_CLASSES_FORCE_TRIGGER whose real-world remedy
 * fundamentally requires going outside this app — legal counsel or a
 * platform's own trust & safety team, not a posture this product can draft
 * to. Matches thresholds.yml.template's external_escalation example
 * actions (cease-and-desist, court-order tracking = a legal/regulatory
 * matter; account-compromise/formal-complaint = a personal-safety matter).
 * The other four force-trigger classes (defamation, review-bomb,
 * competitor disinfo, adversarial press) stay in-system at tier 3 —
 * serious, but still something the sole authority can choose a public
 * response posture to, which is what tier 3 is for.
 */
export const EXTERNAL_ESCALATION_SIGNAL_CLASSES: readonly SignalClass[] = ["regulatory_or_legal_action", "doxx_or_personal_safety"];

/**
 * Candidate response postures offered at tier 3 (pause_and_instruct) —
 * thresholds.yml.template's own rationale: "the system refuses to write
 * until you choose, because the choice itself is the load-bearing operator
 * judgment." No draft exists until one of these is picked; response-
 * routing.ts then drafts TO the chosen posture rather than guessing one.
 */
export const RESPONSE_POSTURES = [
  { id: "acknowledge_private_resolution", label: "Acknowledge and invite a private resolution" },
  { id: "factual_correction", label: "Non-defensive factual correction" },
  { id: "monitor_only", label: "No public response — monitor only" },
  { id: "escalate_externally", label: "Escalate externally instead of drafting" },
] as const;

export type ResponsePostureId = (typeof RESPONSE_POSTURES)[number]["id"];

/**
 * thresholds.yml.template's two-axis routing matrix, collapsed to the
 * single lookup response-routing.ts needs: given one finding's already-
 * computed compositeScore and (if any) its force-trigger signalClass,
 * which of the four response tiers does it route to. Signal class wins
 * over score when it's in EXTERNAL_ESCALATION_SIGNAL_CLASSES (a low-reach
 * legal notice is still a legal notice); otherwise score alone decides.
 */
export function resolveResponseTier(compositeScore: number, signalClass: SignalClass | null): ResponseTier {
  if (signalClass && EXTERNAL_ESCALATION_SIGNAL_CLASSES.includes(signalClass)) return "tier4_external_escalation";
  if (compositeScore > RESPONSE_TIER_SCORE_BOUNDS.tier2Max) return "tier3_pause_and_instruct";
  if (compositeScore > RESPONSE_TIER_SCORE_BOUNDS.tier1Max) return "tier2_review";
  return "tier1_one_click";
}

/** Ranks tiers by severity so an incident with multiple contributing
 * findings can report the single highest tier among them — same "worst
 * finding sets the incident's posture" reasoning severityScore itself
 * already uses (max across findings, not an average). */
const RESPONSE_TIER_RANK: Record<ResponseTier, number> = {
  tier1_one_click: 1,
  tier2_review: 2,
  tier3_pause_and_instruct: 3,
  tier4_external_escalation: 4,
};

export function highestResponseTier(tiers: ResponseTier[]): ResponseTier | null {
  if (tiers.length === 0) return null;
  return tiers.reduce((max, t) => (RESPONSE_TIER_RANK[t] > RESPONSE_TIER_RANK[max] ? t : max));
}
