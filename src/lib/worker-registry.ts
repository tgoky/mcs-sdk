// src/lib/worker-registry.ts
//
// One catalog for every worker across every product, in place of two
// parallel, independently-maintained manifests (skill-manifest.ts for
// Showtime, rep-skill-manifest.ts for Reputation Manager). Both of those
// files stay as the source of truth for their own product's ids/names/
// descriptions — see each file's own header for why they're deliberately
// separate types (SkillId vs RepSkillId) rather than one widened union.
// This module is the merge point: it reads both and exposes one flat,
// product-tagged catalog so new code (the Library page, the capabilities
// grid, chat-driven enablement) can iterate "every worker that exists"
// once, instead of hand-writing a Showtime branch and a Reputation
// Manager branch every time — the exact per-product duplication pattern
// that doesn't scale past two products.
//
// Nothing here changes runtime dispatch. src/inngest/skill.ts still owns
// executing a skill by id; this is a read-only catalog for UI and
// enablement flows to iterate, not a second registry of executors.

import { SKILL_IDS, SKILL_MANIFEST, type SkillId } from "@/lib/skill-manifest";
import { REP_SKILL_IDS, REP_SKILL_MANIFEST, type RepSkillId } from "@/lib/rep-skill-manifest";
import type { ProductId } from "@/lib/product-catalog";

export type WorkerId = SkillId | RepSkillId;

/**
 * How a worker's config field should be sourced when it's being enabled
 * for a client, instead of defaulting every field to a blank input on a
 * form:
 *   - "derivable": the agent can look this up itself from a seed the
 *     client profile already has (e.g. brand voice from a domain, the
 *     way pin-down-voice already works via chat-skill-trigger.ts) —
 *     present it as a value to confirm/edit, never an empty box.
 *   - "ask": no reasonable way to derive it; it's a real judgment call
 *     that has to come from the person enabling the worker, asked as one
 *     natural question rather than buried in a field grid.
 *   - "secret": routes to the one secure credential path (reuse a saved
 *     credential, OAuth connect, or the dedicated paste-a-key page) —
 *     never rendered as a plain text input and never sent through chat.
 *     See chat-credentials.ts's header for exactly why raw secrets are
 *     excluded from the conversational path.
 */
export type WorkerConfigFieldKind = "derivable" | "ask" | "secret";

/**
 * A verified, cross-product client fact from src/lib/client-profile.ts —
 * the actual thing a "derivable" field derives from, not just a
 * description saying so: no field can claim to be derivable without
 * naming a real function in that module that backs it.
 *
 * Audit note (post-Phase-9): the resolver function exists and is
 * correct (client-profile.ts's getPrimaryDomainForEngagement /
 * resolveClientProfileFact), but no UI surface actually calls it yet —
 * neither pin-down's own wizard, rep-onboarding's IdentityGraphForm, nor
 * enable-worker-modal.tsx's chat/lighter-form paths read an
 * already-known primaryDomain before asking for one. So today
 * "derivable" is an accurate classification of the *fact* (this really
 * is knowable from another worker's data) but not yet a working
 * pre-fill — a real client on their second worker still gets asked for
 * a domain the first worker already collected. Fixing the resolver
 * itself won't fix this; wiring a caller into one of those surfaces
 * will. Grows only alongside client-profile.ts itself; adding a value
 * here with nothing backing it in that module is exactly the
 * unverified-claim problem this type exists to prevent.
 */
export type ClientProfileFact = "primaryDomain" | "buyerName";

export interface WorkerConfigField {
  key: string;
  label: string;
  kind: WorkerConfigFieldKind;
  /** What the field is and, for "derivable", what seed it can be derived from. */
  description: string;
  /** Required when kind is "derivable" — which client-profile fact backs
   * it. A "derivable" field with no derivableFrom is a claim nothing
   * actually fulfills; treat it as a bug to fix, not a valid state. */
  derivableFrom?: ClientProfileFact;
}

/**
 * A functional grouping shared across both products, for the Library's
 * per-worker Skill grid to filter by once a worker's skill count grows
 * past a glance-able handful (today: 5 Showtime, 6 Reputation Manager —
 * "soon we will have 40+ skills" is the case this exists for, not today's
 * count). Cross-product on purpose: "Monitoring" or "Setup" means the
 * same thing whether the worker is Showtime or Reputation Manager, so a
 * category isn't duplicated per product the way configFields are.
 */
export type WorkerCategory = "Setup" | "Monitoring" | "Outreach & Sequences" | "Analysis & Briefing" | "Crisis & Recovery";

export const WORKER_CATEGORY_LIST: WorkerCategory[] = [
  "Setup",
  "Monitoring",
  "Outreach & Sequences",
  "Analysis & Briefing",
  "Crisis & Recovery",
];

export interface WorkerDefinition {
  id: WorkerId;
  productId: ProductId;
  name: string;
  description: string;
  category: WorkerCategory;
  runOnSetup: boolean;
  hasHingesPanel: boolean;
  /**
   * Every worker is now traced (Phase 5) — each field below is grounded
   * in a real server-side read of EngagementStack/repIdentityGraphs, not
   * guessed. An empty array here means one of two verified states, never
   * "not yet classified": either the worker genuinely needs nothing
   * beyond another already-classified worker's fields (the 5 Reputation
   * Manager watch/response skills below all resolve entirely to
   * rep-onboarding's repIdentityGraphs, confirmed by tracing each one's
   * actual DB reads and credential resolution — see each entry's own
   * comment), or its config lives entirely in fields already listed under
   * a different worker it reuses (pile-on/win-back reuse pin-down's
   * booking/email platform choice and credential the same way). A field
   * that's real and collected somewhere in the app but has no UI path to
   * set it yet is still listed as "ask," flagged unbuilt in its own
   * description — same honesty standard pin-down's own topCallQuestions
   * entry already established, not silently omitted.
   *
   * One deliberate omission convention, established by pin-down's own
   * original entry and kept consistent everywhere below: a platform
   * CHOICE (e.g. sms_platform, ad_data_platform) is one "ask"/"secret"
   * pair even though picking it branches into its own mechanical
   * sub-fields (a Twilio SID, a Hyros account ID) — those sub-fields
   * aren't separate client facts worth their own entry, they're
   * downstream mechanics of an already-classified decision.
   */
  configFields: WorkerConfigField[];
}

// pin-down's fields, traced against the real wizard (offer-step.tsx,
// stack-step.tsx, voice-step.tsx) and /api/engagements/setup's own
// required-field check — the same rigor as rep-onboarding below, at the
// same altitude: a platform CHOICE (booking/email/hosting/SMS/ad-data)
// is one "ask" field even though each choice branches into its own
// mechanical sub-fields (a Twilio SID, a Webflow site ID, a Google
// Sheets spreadsheet ID) once picked — those sub-fields are downstream
// mechanics of an already-classified decision, not separate client
// facts worth their own entry, consistent with how rep-onboarding didn't
// split "which Trustpilot URL format" out from trustedSources either.
const SHOWTIME_CONFIG_FIELDS: Partial<Record<SkillId, WorkerConfigField[]>> = {
  "pin-down": [
    {
      key: "buyerDomain",
      label: "Client domain",
      kind: "derivable",
      description: "Pre-fillable from the client profile's shared primaryDomain — also what smart pre-fill and brand voice extraction crawl.",
      derivableFrom: "primaryDomain",
    },
    {
      key: "rawVoiceCorpus",
      label: "Brand voice",
      kind: "derivable",
      description: "Derived by crawling the client's domain — the exact mechanism chat-skill-trigger.ts's extract_brand_voice already runs standalone, not a new capability.",
      derivableFrom: "primaryDomain",
    },
    {
      key: "publishDomain",
      label: "Confirmation page domain",
      kind: "derivable",
      description: "Usually the same domain as buyerDomain, but stored separately since a confirmation page can publish to a different subdomain — pre-filled as a suggestion, not forced to match.",
      derivableFrom: "primaryDomain",
    },
    {
      key: "offerName",
      label: "What they're selling",
      kind: "ask",
      description: "A real business fact only the operator knows — no seed to derive it from.",
    },
    {
      key: "offerPrice",
      label: "Price",
      kind: "ask",
      description: "Not derivable — the operator's own pricing.",
    },
    {
      key: "offerVertical",
      label: "Industry / vertical",
      kind: "ask",
      description: "Powers Leak Map's cross-client benchmarks — a real classification call, not inferred.",
    },
    {
      key: "offerIcp",
      label: "Ideal customer",
      kind: "ask",
      description: "A judgment call about who the offer targets.",
    },
    {
      key: "trafficTemperature",
      label: "Lead source temperature",
      kind: "ask",
      description: "Cold/warm/hot — a real classification, not derivable from a domain.",
    },
    {
      key: "prospectMeets",
      label: "Who runs the calls",
      kind: "ask",
      description: "A role/person fact, not derivable.",
    },
    {
      key: "topCallQuestions",
      label: "Common call questions",
      kind: "ask",
      description: "Plausibly derivable from FAQ content in a future pass, but not built — honestly ask for now rather than claim an unbuilt capability.",
    },
    {
      key: "topObjections",
      label: "Common objections",
      kind: "ask",
      description: "Same reasoning as topCallQuestions — real content only the operator has today.",
    },
    {
      key: "bookingPlatform",
      label: "Booking platform",
      kind: "ask",
      description: "Which calendar tool the client uses — a real choice.",
    },
    {
      key: "bookingPlatformCredential",
      label: "Booking platform credential",
      kind: "secret",
      description: "Routes to the credential reuse/OAuth/paste-a-key path — never a plain text field, never sent through chat.",
    },
    {
      key: "emailPlatform",
      label: "Email platform",
      kind: "ask",
      description: "Which email/CRM tool follow-ups send from — a real choice.",
    },
    {
      key: "emailPlatformCredential",
      label: "Email platform credential",
      kind: "secret",
      description: "Same secret path as the booking credential.",
    },
    {
      key: "hostingPlatform",
      label: "Confirmation page hosting",
      kind: "ask",
      description: "Where the confirmation page publishes — a real choice, each option branching into its own mechanical sub-fields once picked.",
    },
    {
      key: "confirmationPageTemplate",
      label: "Confirmation page template",
      kind: "ask",
      description: "A style preference, not derivable.",
    },
  ],
  // Traced against brief-service.ts's real reads (gatherEngagementContext,
  // executeNightlyBriefingCycle, processSingleBriefCall) and Pre-Call
  // Read's own hinges panel (bridges/pre-call-read/page.tsx). Booking
  // platform/credential are reused from pin-down (this skill fails fast
  // onto that same row, "Run Pin-Down first") — not repeated here.
  "pre-call-read": [
    {
      key: "briefLandingDestination",
      label: "Where briefs land",
      kind: "ask",
      description: "Real operator choice of delivery destination for finished briefs — not derivable.",
    },
    {
      key: "slackWebhookUrl",
      label: "Slack webhook URL",
      kind: "ask",
      description: "Where briefs post if Slack is the landing destination — a real per-workspace URL only the operator has, entered as a plain field matching this codebase's existing convention for it.",
    },
    {
      key: "briefTriggerType",
      label: "Nightly vs. dynamic briefing",
      kind: "ask",
      description: "A real operational cadence preference, not derivable.",
    },
    {
      key: "videoEngagementPlatform",
      label: "Video engagement tracking",
      kind: "ask",
      description: "Optional platform choice (Wistia/YouTube) for hero-video watch-time signals — a real preference, not derivable.",
    },
    {
      key: "videoEngagementCredential",
      label: "Video engagement credential",
      kind: "secret",
      description: "Routes to the credential path — confirmed via storeCredential in the pre-call-read bridge route, never a plain field.",
    },
    {
      key: "prospectResearchSourcesUsed",
      label: "Prospect research sources",
      kind: "ask",
      description: "Real BYOK opt-in list (Apollo/PDL) — which external enrichment sources to use, a preference not a lookup.",
    },
    {
      key: "apolloCredential",
      label: "Apollo credential",
      kind: "secret",
      description: "Routes to the credential path, gated on prospectResearchSourcesUsed including apollo.",
    },
    {
      key: "pdlCredential",
      label: "People Data Labs credential",
      kind: "secret",
      description: "Routes to the credential path, gated on prospectResearchSourcesUsed including pdl.",
    },
    {
      key: "conversationIntelligenceProvider",
      label: "Call intelligence provider",
      kind: "ask",
      description: "Real opt-in choice (currently Recall.ai) — set in the generic Edit Stack Settings drawer rather than this skill's own hinges panel, an inconsistency worth normalizing in a later pass, not fixed here.",
    },
    {
      key: "conversationIntelligenceCredential",
      label: "Call intelligence credential",
      kind: "secret",
      description: "Routes to the credential path per its own drawer copy ('entered separately under Update credentials').",
    },
    {
      key: "recallRegion",
      label: "Recall.ai workspace region",
      kind: "ask",
      description: "Must match the operator's actual Recall.ai account region — a real fact only they know, not derivable.",
    },
    {
      key: "recallBotName",
      label: "Recall bot display name",
      kind: "ask",
      description: "Cosmetic preference, optional.",
    },
    {
      key: "recallWebhookSigningSecret",
      label: "Recall webhook signing secret",
      kind: "secret",
      description:
        "A real secret (verifies inbound Recall webhooks) — currently entered via a password-typed field but stored directly in the stack jsonb rather than routed through the actual credential vault. Classified as secret because that's what it is, not because today's storage matches that classification; worth a real fix separate from this pass.",
    },
    {
      key: "personMatchConfidenceThreshold",
      label: "Person-match confidence threshold",
      kind: "ask",
      description: "Real risk-tolerance knob gating whether a brief sends (Rule 14) — currently hardcoded to 70 with no UI anywhere to change it. Ask, not derivable, flagged unbuilt rather than silently defaulted.",
    },
    {
      key: "briefLeadTimeHours",
      label: "Brief lead time",
      kind: "ask",
      description: "How far ahead of a call a brief should send — currently hardcoded to 12 hours with no UI setter. Ask, flagged unbuilt.",
    },
    {
      key: "showRateScoringEnabled",
      label: "Show-rate scoring",
      kind: "ask",
      description: "Real opt-in boolean, read by the roster route but with no UI path to enable it yet. Ask, flagged unbuilt.",
    },
    {
      key: "slackSigningSecret",
      label: "Slack app signing secret",
      kind: "secret",
      description: "Needed to verify the Slack interactions webhook once the Slack landing-destination button is real — no UI setter exists yet anywhere. Secret, flagged unbuilt.",
    },
  ],
  // Traced against audit-engine.ts's real reads. No credential of its own —
  // confirmed at the resolveCredential level: it reads the exact same
  // booking/email rows pin-down's onboarding already wrote. Its real "ask"
  // surface is split across its own hinges panel and, for two fields,
  // pin-down's own setup screen (which explicitly collects them "on behalf
  // of ... Leak Map" — see that page's own comment).
  "leak-map": [
    {
      key: "auditOutputFormat",
      label: "Report delivery format",
      kind: "ask",
      description: "Real delivery-format choice (Slack/email/both) — not derivable.",
    },
    {
      key: "leakMapReportEmail",
      label: "Report email address",
      kind: "ask",
      description: "Only needed when the email format is chosen — a real address only the operator has.",
    },
    {
      key: "weeklySummarySchedule",
      label: "Weekly summary schedule",
      kind: "ask",
      description: "Real per-client day/hour/timezone cadence preference.",
    },
    {
      key: "monthlyDeepDiveSchedule",
      label: "Monthly deep-dive schedule",
      kind: "ask",
      description: "Same reasoning as the weekly schedule — a real cadence preference.",
    },
    {
      key: "timezone",
      label: "Client timezone",
      kind: "ask",
      description: "Needed to anchor the schedules above correctly — a real fact, not derivable from a domain.",
    },
    {
      key: "existingAuditFlagged",
      label: "Existing funnel data on file",
      kind: "ask",
      description: "Collected on pin-down's own setup screen on Leak Map's behalf, per that page's own comment — whether the operator already has funnel-audit data worth referencing.",
    },
    {
      key: "notificationPackSelections",
      label: "Alert opt-ins",
      kind: "ask",
      description: "Curated alert selections, also collected on pin-down's setup screen — a real preference, not a default to assume.",
    },
    {
      key: "sampleSizeMinimum",
      label: "Minimum sample size for a metric to be trusted",
      kind: "ask",
      description: "Real statistical-floor preference gating which deltas count as signal — currently hardcoded to 5 with no UI setter. Ask, flagged unbuilt.",
    },
  ],
  // Traced against enrollment-service.ts's handleInboundBookingEvent
  // (eventKind === "created" branch). No hinges panel — every field below
  // is collected in the main setup wizard's stack-step/credentials-step
  // (at initial setup, not only later) and editable afterward in Edit
  // Stack Settings. Booking/email platform + credential, and the
  // email-platform-choice's own mechanical sub-fields (target_list_id,
  // target_workflow_id, activecampaign_base_url), are reused from
  // pin-down's classification — not repeated as separate entries here,
  // same convention as pin-down's own hostingPlatform sub-fields.
  "pile-on": [
    {
      key: "smsPlatform",
      label: "SMS platform",
      kind: "ask",
      description: "Real platform choice (none/Twilio/GHL SMS/HubSpot SMS) for the pre-call text sequence — not derivable.",
    },
    {
      key: "smsPlatformCredential",
      label: "SMS platform credential",
      kind: "secret",
      description: "Routes to the credential path — a genuinely new provider (Twilio auth token / HubSpot key) distinct from the booking/email credentials, confirmed via CredentialField in the setup wizard.",
    },
    {
      key: "smsA2p10dlcStatus",
      label: "A2P 10DLC registration status",
      kind: "ask",
      description: "Real US SMS compliance-registration status only the Twilio account holder knows — sends are refused until this is 'Campaign approved,' per the setup screen's own copy.",
    },
    {
      key: "smsComplianceFooterVariant",
      label: "SMS compliance footer",
      kind: "ask",
      description: "Real compliance-copy choice (standard vs. custom opt-out language) — not derivable.",
    },
    {
      key: "adDataPlatform",
      label: "Ad-data cohort platform",
      kind: "ask",
      description: "Real platform choice (none/Hyros/Sheets/native CRM tag) for syncing booked leads into ad-spend attribution — not derivable.",
    },
    {
      key: "adDataPlatformCredential",
      label: "Ad-data platform credential",
      kind: "secret",
      description: "Routes to the credential path — a new provider (Hyros account / Google Sheets token) distinct from booking/email, unless native_crm is chosen (no separate credential needed).",
    },
    {
      key: "existingPileOnSequenceFlagged",
      label: "Existing pre-call sequence on file",
      kind: "ask",
      description: "Collected on pin-down's own setup screen on Pile-On's behalf — whether the operator already has a pre-call sequence worth referencing.",
    },
  ],
  // Traced against enrollProspectInWinBack (chat-winback.ts), the
  // eventKind === "cancelled" branch of handleInboundBookingEvent, and
  // recovery-service.ts/lost-deal-sweep.ts. Email platform + credential,
  // and the email-platform-choice's mechanical sub-fields
  // (recovery_list_id, recovery_workflow_id, recovery_automation_id,
  // long_term_nurture_list_id), are reused from pin-down — not repeated.
  // Two real fields (recovery_window_days, daily_send_tolerance) have no
  // UI setter anywhere and stay at their code defaults — listed as ask,
  // flagged unbuilt, not silently assumed. Fields the system writes itself
  // as operational state (webhook subscription ids, export ownership) are
  // deliberately excluded — not config an operator sets.
  "win-back": [
    {
      key: "rescheduleMode",
      label: "Reschedule link mode",
      kind: "ask",
      description: "Real workflow choice — fresh_link only works for Calendly/Cal.com, time_slots is the platform-agnostic fallback. Not derivable.",
    },
    {
      key: "recoveredFromNoShowTaggingEnabled",
      label: "Tag recovered no-shows",
      kind: "ask",
      description: "Real judgment call (default true) on whether a rebook after a no-show gets CRM-tagged — a sane default, not something to silently assume without asking.",
    },
    {
      key: "inboundReplyMode",
      label: "Inbound reply handling",
      kind: "ask",
      description: "Real choice (none/forwarding/native) — native is restricted to HubSpot per the setup screen's own copy.",
    },
    {
      key: "hubspotPortalId",
      label: "HubSpot portal ID",
      kind: "ask",
      description: "Only needed for native inbound-reply mode on HubSpot — a real per-client fact found in the operator's own HubSpot admin, not derivable from anything on file.",
    },
    {
      key: "recoveryWindowDays",
      label: "Recovery cadence length",
      kind: "ask",
      description: "Real per-client cadence-length preference — currently hardcoded to 30 days with no UI setter anywhere. Ask, flagged unbuilt.",
    },
    {
      key: "dailySendTolerance",
      label: "Daily send tolerance",
      kind: "ask",
      description: "Real per-client rate-limiting preference — currently hardcoded to 2 with no UI setter anywhere. Ask, flagged unbuilt.",
    },
  ],
};

const REP_CONFIG_FIELDS: Partial<Record<RepSkillId, WorkerConfigField[]>> = {
  "rep-onboarding": [
    {
      key: "operatorName",
      label: "Operator / brand name",
      kind: "derivable",
      description: "Pre-fillable from the client's own buyer name (engagements.buyer, always set) — a starting suggestion to confirm or edit, not forced to always match it.",
      derivableFrom: "buyerName",
    },
    {
      key: "operatorDomains",
      label: "Domains",
      kind: "derivable",
      description: "Pre-fillable from the client profile's shared primaryDomain once any product has captured one.",
      derivableFrom: "primaryDomain",
    },
    {
      key: "operatorAliases",
      label: "Known aliases",
      kind: "ask",
      description: "Not reliably derivable — other names the operator is known by, best answered directly.",
    },
    {
      key: "operatorHandles",
      label: "Social handles",
      kind: "ask",
      description: "Plausibly derivable from a domain in a future pass, but not verified yet — treated as ask for now.",
    },
    {
      key: "competitors",
      label: "Competitors",
      kind: "ask",
      description: "A judgment call about who counts as a competitor — not something to infer silently.",
    },
    {
      key: "trustedSources",
      label: "Trusted sources",
      kind: "ask",
      description: "Which review/mention sources actually matter to this client — a real preference, not a lookup.",
    },
    {
      key: "crisisThresholdOverride",
      label: "Crisis threshold",
      kind: "ask",
      description: "A subjective risk-tolerance call — has a sane default, only needs asking if they want to tune it.",
    },
    // The 3 fields below were confirmed missing from this list (Phase 5's
    // own verification pass) despite being real, currently-collected
    // repIdentityGraphs columns (identity-graph-form.tsx) that other
    // workers genuinely depend on — rep-engine-panel reads
    // seedPanelPrompts/activeEngines directly, rep-reddit-watch/
    // rep-twitter-watch read entities. Their "needs nothing beyond
    // rep-onboarding" verdict below is only true with these included.
    {
      key: "entities",
      label: "Tracked entities / sub-brands",
      kind: "ask",
      description: "Which companies, brands, products, or publications this operator is publicly associated with — a real judgment call, not inferable from a domain.",
    },
    {
      key: "seedPanelPrompts",
      label: "Seed AI-engine prompts",
      kind: "ask",
      description: "The 5-8 starting prompts the AI Engine Watch panel checks — real content only the operator can specify. Plausibly AI-suggestible from the operator name/domain in a future pass, but not built — honestly ask for now, same reasoning as pin-down's topCallQuestions entry.",
    },
    {
      key: "activeEngines",
      label: "Which AI engines to check",
      kind: "ask",
      description: "Real preference narrowing the panel to specific engines — not derivable.",
    },
  ],
  // The 5 workers below were traced (Phase 5) and confirmed to need
  // NOTHING beyond rep-onboarding's repIdentityGraphs fields above — every
  // API key each one uses (OUTSCRAPER_API_KEY, REDDITAPIS_API_KEY,
  // TWITTERAPIS_API_KEY, OPENROUTER_API_KEY, the REP_ENGINE_MODEL_* env
  // vars) is a global platform credential, not a per-client secret. This
  // is a verified "needs nothing new" state, not "not yet classified" —
  // see WorkerDefinition.configFields's own doc comment.
  "rep-engine-panel": [],
  "rep-trustpilot-watch": [],
  "rep-reddit-watch": [],
  "rep-twitter-watch": [],
  "rep-crisis-response": [],
};

// Single source of truth for category, kept out of skill-manifest.ts and
// rep-skill-manifest.ts on purpose — those files stay each product's own
// id/name/description authority (see this module's header), while
// category is the one cross-product dimension, so it lives where the two
// catalogs actually merge.
const WORKER_CATEGORIES: Record<WorkerId, WorkerCategory> = {
  "pin-down": "Setup",
  "pile-on": "Outreach & Sequences",
  "pre-call-read": "Analysis & Briefing",
  "win-back": "Outreach & Sequences",
  "leak-map": "Analysis & Briefing",
  "rep-onboarding": "Setup",
  "rep-engine-panel": "Monitoring",
  "rep-trustpilot-watch": "Monitoring",
  "rep-reddit-watch": "Monitoring",
  "rep-twitter-watch": "Monitoring",
  "rep-crisis-response": "Crisis & Recovery",
};

function buildRegistry(): Record<WorkerId, WorkerDefinition> {
  const registry = {} as Record<WorkerId, WorkerDefinition>;

  for (const id of SKILL_IDS) {
    const entry = SKILL_MANIFEST[id];
    registry[id] = {
      id,
      productId: "showtime",
      name: entry.name,
      description: entry.description,
      category: WORKER_CATEGORIES[id],
      runOnSetup: entry.runOnSetup,
      hasHingesPanel: entry.hasHingesPanel,
      configFields: SHOWTIME_CONFIG_FIELDS[id] ?? [],
    };
  }

  for (const id of REP_SKILL_IDS) {
    const entry = REP_SKILL_MANIFEST[id];
    registry[id] = {
      id,
      productId: "reputation-manager",
      name: entry.name,
      description: entry.description,
      category: WORKER_CATEGORIES[id],
      runOnSetup: entry.runOnSetup,
      hasHingesPanel: entry.hasHingesPanel,
      configFields: REP_CONFIG_FIELDS[id] ?? [],
    };
  }

  return registry;
}

export const WORKER_REGISTRY: Record<WorkerId, WorkerDefinition> = buildRegistry();

export const WORKER_IDS: WorkerId[] = [...SKILL_IDS, ...REP_SKILL_IDS];

export function isWorkerId(value: string): value is WorkerId {
  return (WORKER_IDS as string[]).includes(value);
}

export function getWorkerDefinition(id: WorkerId): WorkerDefinition {
  return WORKER_REGISTRY[id];
}

export function workersForProduct(productId: ProductId): WorkerDefinition[] {
  return WORKER_IDS.filter((id) => WORKER_REGISTRY[id].productId === productId).map((id) => WORKER_REGISTRY[id]);
}

export function allWorkers(): WorkerDefinition[] {
  return WORKER_IDS.map((id) => WORKER_REGISTRY[id]);
}

/**
 * Showtime workers with their own dedicated single-client page (schedule/
 * report content, not a run-execution list — see e.g.
 * bridges/leak-map's sibling skills/leak-map/page.tsx). Previously
 * duplicated as a local const inside workers-panel.tsx; centralized here
 * once skills-nav-list.tsx needed the identical list for Capabilities'
 * own links — two independently-maintained copies of "which workers have
 * a page" is exactly the kind of drift this registry exists to prevent.
 */
export const SKILLS_WITH_OWN_PAGE: WorkerId[] = ["pre-call-read", "pile-on", "win-back", "leak-map"];

/** The 5 Reputation Manager workers (every one but rep-onboarding itself)
 * that share one findings page across all of them — see
 * rep-findings-panel.tsx's own header for why one page, not five. */
export const REP_SKILLS_WITH_FINDINGS_PAGE: WorkerId[] = [
  "rep-engine-panel",
  "rep-trustpilot-watch",
  "rep-reddit-watch",
  "rep-twitter-watch",
  "rep-crisis-response",
];

/**
 * The one real "go see this worker for this client" destination —
 * replaces routing every worker through /dashboard/modules/[skill] (a
 * roster of every client with that skill, pointless now that a workspace
 * only ever has one) with whichever real, single-client page already
 * exists for it: its own schedule/report page, RM's shared findings
 * page, or — for a worker with neither (pin-down, rep-onboarding) — the
 * engagement page's own Run History, pre-filtered to just this worker's
 * runs via the same `?skill=` param its filter chips already use.
 */
export function workerPrimaryHref(workerId: WorkerId, engagementId: string): string {
  if (SKILLS_WITH_OWN_PAGE.includes(workerId)) {
    return `/dashboard/engagements/${engagementId}/skills/${workerId}`;
  }
  if (REP_SKILLS_WITH_FINDINGS_PAGE.includes(workerId)) {
    return `/dashboard/engagements/${engagementId}/skills/reputation-manager`;
  }
  return `/dashboard/engagements/${engagementId}?skill=${workerId}#run-history`;
}
