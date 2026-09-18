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
import { COLD_OPEN_SKILL_IDS, COLD_OPEN_SKILL_MANIFEST, type ColdOpenSkillId } from "@/lib/cold-open-skill-manifest";
import { WHOP_AGENT_SKILL_IDS, WHOP_AGENT_SKILL_MANIFEST, type WhopAgentSkillId } from "@/lib/whop-agent-skill-manifest";
import type { ProductId } from "@/lib/product-catalog";

export type WorkerId = SkillId | RepSkillId | ColdOpenSkillId | WhopAgentSkillId;

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
      description: "Collected and stored, but audited and confirmed functionally dead — grepped across the whole repo and nothing in the actual publish path (hosting.ts's publishConfirmationPage) ever reads it; it builds URLs from platform-specific subdomains/slugs instead. Kept here for now as a documented finding, not gated on (worker-config-completeness.ts's checkPinDown deliberately excludes it) — a real candidate for removal in a later pass, not just a reclassification.",
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
    // The 4 fields below were found missing entirely from this list during
    // the full 34-worker audit (worker-config-completeness.ts's own header
    // has the fuller account) — real, DB-backed, UI-editable facts the
    // worker code actually reads, previously undisclosed here the way
    // topCallQuestions/topObjections above are honestly flagged. None of
    // them gate a run (see each description) — a blocking gate on a field
    // the code already handles gracefully would be friction with no
    // correctness payoff, the same reasoning win-back's recoveryWindowDays
    // and leak-map's sampleSizeMinimum already establish elsewhere in this
    // file.
    {
      key: "castingChoice",
      label: "Who's on camera",
      kind: "ask",
      description: "Drives which of 4 script archetypes generates (founder_on_camera/coach_on_camera/animation/other) — a real, consequential choice, but script-builder.ts's own comment documents it falling back to founder_on_camera when unset, same default prospectMeets uses. Does not block.",
    },
    {
      key: "heroVideoUrl",
      label: "Hero video",
      kind: "ask",
      description: "Embedded once the buyer has actually recorded the hero script — until then the confirmation page ships its own 'recording in progress' placeholder. Genuinely optional, not a gap to fill before launch. Does not block.",
    },
    {
      key: "confirmationPageAnimationsEnabled",
      label: "Entrance animations",
      kind: "ask",
      description: "Opt-in cosmetic preference, defaults to off. Does not block.",
    },
    {
      key: "hybridModeEnabled",
      label: "AI-personalized intro paragraph",
      kind: "ask",
      description: "Collected in this same wizard (offer-step.tsx), but consumed by pile-on and win-back's own enrollment logic, not pin-down itself — reused, not re-collected, same convention as the booking/email credentials below. Defaults to off (templated email, no AI paragraph) when unset. Does not block.",
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
      description: "Real statistical-floor preference gating which deltas count as signal — currently hardcoded to 5 with no UI setter, but has a real stack column (sample_size_minimum, schema.ts) with that exact default already documented. Ask, flagged unbuilt, does not block.",
    },
    // AGING_THRESHOLD_DAYS = 30 (audit-engine.ts) was found during the
    // full 34-worker audit as a real gap distinct from sampleSizeMinimum
    // above: a pure hardcoded literal with NO storage slot anywhere in the
    // schema, not even a stack-config fallback. It feeds a finding shown
    // directly to the client ("N deals have been in the pipeline longer
    // than 30 days"), and sales-cycle length varies enormously by
    // vertical. Not added as a WorkerConfigField entry here — there's
    // nothing to point one at yet. Needs a schema migration first, tracked
    // as Phase 6 / Open Risks in the plan doc.
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
    // The 2 fields below were found missing entirely from this list during
    // the full 34-worker audit — real, DB-backed, UI-collected
    // repIdentityGraphs columns (identity-graph-form.tsx) that
    // rep-crisis-response reads directly for its escalation notify/SMS
    // logic, previously undisclosed the way entities/seedPanelPrompts/
    // activeEngines above are honestly flagged as found-missing. A third
    // real field, operatorEmailContacts, is collected but read by nothing
    // downstream today — inert, not consequential, not listed here.
    {
      key: "soleAuthorityName",
      label: "Sole authority name",
      kind: "ask",
      description: "The one person who can declare a crisis, approve a public response, or stand down — recorded, never defaulted. DB-required (schema.ts's repIdentityGraphs.soleAuthorityName is NOT NULL) and enforced at onboarding-service.ts's own validation, so this can never actually be blank once a row exists. Read directly by rep-crisis-response's escalation logic.",
    },
    {
      key: "operatorPagePhone",
      label: "Crisis SMS paging number",
      kind: "ask",
      description: "Destination for rep-crisis-response's SMS paging fallback — optional, paging still happens via in-app/Slack/email without it. Read directly by rep-crisis-response.",
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
  "rep-digest": [],
};

// Traced against the Cold Open skill pack's own config schema (see
// COLD_OPEN_SKILL_PACK_REVIEW.md and coldOpenConfig in schema.ts, which
// mirrors coldopen.config.md's frontmatter section by section).
// productName stays a real, working "derivable" field — the icp-lock
// bridge route pre-fills it from engagements.buyer, confirmed live.
// productUrl and voice-capture's voiceProfile were originally described
// the same way (reuse Showtime's primaryDomain/rawVoiceCorpus) but that
// reuse was audited and found not to exist anywhere in the actual code —
// both reclassified to "ask" below, not just left aspirational the way
// ClientProfileFact's own doc comment describes for fields that DO have
// real-but-unwired resolvers. See each field's own description for the
// distinction.
const COLD_OPEN_CONFIG_FIELDS: Partial<Record<ColdOpenSkillId, WorkerConfigField[]>> = {
  "icp-lock": [
    {
      key: "productName",
      label: "Product / offer name",
      kind: "derivable",
      description: "Pre-fillable from the client's own buyer name (engagements.buyer) — a starting suggestion to confirm or edit.",
      derivableFrom: "buyerName",
    },
    {
      key: "productUrl",
      label: "Product URL",
      kind: "ask",
      description: "Audited and reclassified from derivable — unlike pin-down's buyerDomain/rawVoiceCorpus (which have real, running extraction code, just not reused across products yet), no live crawl or resolver path exists anywhere for this field. The icp-lock bridge route never reads engagements.primaryDomain and the form only pre-fills from a previously-saved value. A 100% manual ask field today, not just an unwired one.",
    },
    {
      key: "productPrice",
      label: "Price",
      kind: "ask",
      description: "Not derivable — the operator's own pricing.",
    },
    {
      key: "productValueProp",
      label: "Value proposition",
      kind: "ask",
      description: "One sentence on what the offer actually does for a buyer — a real business fact only the operator knows.",
    },
    {
      key: "icps",
      label: "ICPs (slug, label, weight)",
      kind: "ask",
      description: "Who this client sells to, and the traffic-allocation weight across each ICP if there's more than one — a judgment call, not inferred.",
    },
    {
      key: "sizingBounds",
      label: "Sizing bounds + disqualifiers",
      kind: "ask",
      description: "Per-ICP sizing sweet spot and who to skip — real business rules, paired one-to-one with the ICPs above.",
    },
    {
      key: "reviewRequiredIcps",
      label: "Review-required ICPs",
      kind: "ask",
      description: "Which ICPs (if any) hold for manual review before a push instead of auto-pushing — a real risk-tolerance preference, defaults to none held.",
    },
  ],
  "voice-capture": [
    {
      key: "voiceProfile",
      label: "Greeting, sign-off, and tone",
      kind: "ask",
      description: "Audited and reclassified from derivable — the claimed reuse of pin-down's voice-extraction code never actually happens; voice-capture.ts never imports or calls extractVoiceProfile, and greeting/signOff/tone start as static defaults for a new engagement. No cross-product reuse exists today, unlike the description this field previously carried.",
    },
    {
      key: "subjectVariants",
      label: "Subject line pool",
      kind: "ask",
      description: "AI-assisted drafting from the captured voice is plausible in a future pass, but not built — honestly ask for now, same reasoning as pin-down's topCallQuestions entry.",
    },
    {
      key: "bodyVariantPools",
      label: "Body variant pool(s)",
      kind: "ask",
      description: "At least 2 variants per ICP are required before Daily Send can run in upload mode (see body-variants.ts) — same reasoning as subjectVariants above.",
    },
  ],
  "source-connect": [
    {
      key: "leadSourceType",
      label: "Lead source",
      kind: "ask",
      description: "CSV upload, Apify actor, or a Sales Navigator export — a real choice. Only CSV and Apify have a working verification pull today; Sales Navigator is accepted as a config choice and flagged unbuilt.",
    },
    {
      key: "leadSourceCredential",
      label: "Apify API token",
      kind: "secret",
      description: "Routes to the credential vault path — only needed when leadSourceType is apify.",
    },
    {
      key: "csvMapping",
      label: "CSV column mapping",
      kind: "ask",
      description: "Which of the client's own CSV column headers map to email/company/name/etc — real per-file mapping, not derivable.",
    },
  ],
  "send-connect": [
    {
      key: "sendPlatform",
      label: "Sending platform",
      kind: "ask",
      description: "Instantly, SmartLead, Reply.io, or Lemlist — a real choice.",
    },
    {
      key: "sendPlatformCredential",
      label: "Sending platform API key",
      kind: "secret",
      description: "Routes to the credential vault path — never a plain text field.",
    },
    {
      key: "campaignMap",
      label: "ICP -> campaign mapping",
      kind: "ask",
      description: "Which real campaign in the client's own ESP account each ICP pushes into — only knowable from their account, not derivable.",
    },
    {
      key: "autoPushIcps",
      label: "Auto-push ICPs",
      kind: "ask",
      description: "Found missing entirely during the full 34-worker audit — a real, UI-collected, database-persisted field (send-connect-config-form.tsx, coldOpenConfig.autoPushIcps) that daily-send.ts reads directly to decide whether a matched lead auto-pushes or holds for human review. Defaults to empty (nothing auto-pushed, everything review-required-and-held) when unset — a safe default, so this does not block, but was previously undisclosed in this registry.",
    },
  ],
  "daily-send": [
    {
      key: "dailySendVolume",
      label: "Daily send volume",
      kind: "ask",
      description: "Real per-client throughput preference, bounded by their own inbox warm-up state — not a sane global default.",
    },
    {
      key: "dailySendLocalHour",
      label: "Send hour (client-local time)",
      kind: "ask",
      description: "Real per-client cadence preference, same pattern leak-map's weeklySummarySchedule already uses.",
    },
    {
      key: "copyMode",
      label: "Copy mode",
      kind: "ask",
      description: "generate (fresh LLM copy per lead) or upload (the buyer's own fixed templates, rotated) — a real workflow choice.",
    },
  ],
  "reply-sort": [],
  // Verified zero for real, UI-settable config — traced in full during the
  // 34-worker audit (reply-sort.ts, reply-classifier.ts), runtime only
  // reads config.sendPlatform/config.productIdentity, both already
  // collected by send-connect/icp-lock. QUEUE_WORTHY and DEFAULT_TAXONOMY
  // are hardcoded but read as a fixed product taxonomy, not a business
  // rule a buyer would set — unlike the fields flagged elsewhere in this
  // file, there's no evidence anywhere in the code that these need to vary
  // per client.
  //
  // send-report has one real gap the audit found: REPORT_WINDOW_DAYS = 7
  // (send-report.ts), a hardcoded rolling-window constant with zero
  // override anywhere — not in coldOpenConfig's schema, not in any UI
  // form. Low severity (advisory rollup only, no money/sends at stake),
  // but genuinely per-client-variable (a 5-leads/day client and a
  // 500-leads/day client likely want different rollup cadences). Left as
  // an empty array here deliberately, not populated with a fake entry —
  // unlike every other "ask, flagged unbuilt" field in this file, this
  // one has NO storage slot anywhere in the schema to point a
  // WorkerConfigField at, so adding one here would claim a real field
  // that doesn't exist yet. Needs a schema migration before it can be a
  // real registry entry, tracked as Phase 6 / Open Risks in the plan doc,
  // not silently treated as covered by this empty array.
  "send-report": [],
};

// Traced against connect-service.ts's real writes and the whop-connect
// hinges panel (whop-connect-config-form.tsx). Every other Whop Agent
// skill reuses this one credential — see whop-agent-skill-manifest.ts's
// requiredCredentials — so none of them repeat it as a separate entry,
// same convention pin-down's shared booking/email credentials already
// established for its downstream skills.
const WHOP_AGENT_CONFIG_FIELDS: Partial<Record<WhopAgentSkillId, WorkerConfigField[]>> = {
  "whop-connect": [
    {
      key: "whopBotApiKeyCredential",
      label: "Whop Bot API key",
      kind: "secret",
      description: "Pasted from Whop Dashboard → Developer → API keys — routes to the credential vault, never rendered as plain text or sent through chat.",
    },
  ],
  "whop-cancellation-save-offer": [
    { key: "whop_save_offer_discount_percentage", label: "Discount percentage", kind: "ask", description: "How much off the save offer proposes. No sane default — unset means nothing to propose yet, not a guessed discount (schema.ts's own comment). Blocks." },
    { key: "whop_save_offer_duration_months", label: "Duration (months)", kind: "ask", description: "How many billing cycles the discount applies for. Same no-default reasoning as discount percentage. Blocks." },
    { key: "whop_save_offer_message", label: "Offer message", kind: "ask", description: "Copy shown to the operator for approval before any offer goes out. Blocks." },
    {
      key: "whop_save_offer_min_tenure_days",
      label: "Minimum tenure before eligible (days)",
      kind: "ask",
      description: "Found missing entirely during the full 34-worker audit — real, already has a stack column with a documented default (30) and a real code-level fallback (config.minTenureDays ?? DEFAULT_MIN_TENURE_DAYS in cancellation-save-offer-service.ts). No UI collects it yet, but the safe default means it does not block.",
    },
    {
      key: "whop_save_offer_cooldown_days",
      label: "Cooldown between offers (days)",
      kind: "ask",
      description: "Same finding as min-tenure-days — real stack column, documented default (90), real code-level fallback. No UI collects it yet; does not block.",
    },
  ],
  "whop-bridge-manager": [
    { key: "whop_bridge_destination_url", label: "Destination URL", kind: "ask", description: "Where verified Whop webhook events get routed. No sane default — unset means the bridge does nothing (schema.ts's own comment). Blocks." },
    {
      key: "whop_bridge_field_mapping",
      label: "Field mapping",
      kind: "ask",
      description: "Found missing entirely during the full 34-worker audit — a real per-client payload-transformation object (attemptBridgeDelivery reads it via mapPayload) with a documented safe default: identity mapping (fields pass through unchanged) when unset. Does not block.",
    },
  ],
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
  "rep-digest": "Monitoring",
  "icp-lock": "Setup",
  "voice-capture": "Setup",
  "source-connect": "Setup",
  "send-connect": "Setup",
  "daily-send": "Outreach & Sequences",
  "reply-sort": "Outreach & Sequences",
  "send-report": "Analysis & Briefing",
  "whop-connect": "Setup",
  "whop-product-launch-preflight": "Setup",
  "whop-purchase-cap-copilot": "Setup",
  "whop-drift-monitor": "Monitoring",
  "whop-weekly-ops-report": "Analysis & Briefing",
  "whop-portfolio-rollup": "Analysis & Briefing",
  "whop-cancellation-save-offer": "Crisis & Recovery",
  "whop-refund-dispute-velocity": "Monitoring",
  "whop-bulk-promo-codes": "Setup",
  "whop-payout-hold-kit": "Crisis & Recovery",
  "whop-dispute-response": "Crisis & Recovery",
  "whop-ads-draft-approve": "Outreach & Sequences",
  "whop-bridge-manager": "Monitoring",
  "whop-daily-change-digest": "Monitoring",
  "whop-attribution-report": "Analysis & Briefing",
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

  for (const id of COLD_OPEN_SKILL_IDS) {
    const entry = COLD_OPEN_SKILL_MANIFEST[id];
    registry[id] = {
      id,
      productId: "cold-open",
      name: entry.name,
      description: entry.description,
      category: WORKER_CATEGORIES[id],
      runOnSetup: entry.runOnSetup,
      hasHingesPanel: entry.hasHingesPanel,
      configFields: COLD_OPEN_CONFIG_FIELDS[id] ?? [],
    };
  }

  for (const id of WHOP_AGENT_SKILL_IDS) {
    const entry = WHOP_AGENT_SKILL_MANIFEST[id];
    registry[id] = {
      id,
      productId: "whop-agent",
      name: entry.name,
      description: entry.description,
      category: WORKER_CATEGORIES[id],
      runOnSetup: entry.runOnSetup,
      hasHingesPanel: entry.hasHingesPanel,
      configFields: WHOP_AGENT_CONFIG_FIELDS[id] ?? [],
    };
  }

  return registry;
}

export const WORKER_REGISTRY: Record<WorkerId, WorkerDefinition> = buildRegistry();

export const WORKER_IDS: WorkerId[] = [...SKILL_IDS, ...REP_SKILL_IDS, ...COLD_OPEN_SKILL_IDS, ...WHOP_AGENT_SKILL_IDS];

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
export const SKILLS_WITH_OWN_PAGE: WorkerId[] = [
  "pre-call-read",
  "pile-on",
  "win-back",
  "leak-map",
  "pin-down",
  // Sections 11.9-11.12's dedicated workspaces.
  "whop-payout-hold-kit",
  "whop-dispute-response",
  "whop-bridge-manager",
  "whop-ads-draft-approve",
];

/** The 4 Reputation Manager "watch" workers — same shape (a stream of
 * findings: text + sentiment + flag + permalink), so they share one
 * findings page with a `?source=` filter per worker instead of 4 copies
 * of the same timeline+detail layout — see rep-findings-panel.tsx's own
 * header for why. rep-crisis-response is deliberately NOT here: an
 * incident is a lifecycle to manage (status, response tier, posture,
 * escalation — see incident-row.tsx), not a feed to browse, so it gets
 * its own real page (REP_CRISIS_RESPONSE_HREF below) instead of being
 * forced into this shape as a 5th filter value. */
export const REP_SKILLS_WITH_FINDINGS_PAGE: WorkerId[] = [
  "rep-engine-panel",
  "rep-trustpilot-watch",
  "rep-reddit-watch",
  "rep-twitter-watch",
];

/** `?source=` value each findings-page worker maps to — same keys
 * rep-findings-panel.tsx's own SourceKind type uses. */
const REP_FINDINGS_SOURCE: Partial<Record<WorkerId, string>> = {
  "rep-engine-panel": "engine",
  "rep-trustpilot-watch": "trustpilot",
  "rep-reddit-watch": "reddit",
  "rep-twitter-watch": "twitter",
};

/** rep-crisis-response's real destination: the existing incident-lifecycle
 * tracker (resolve / choose posture / escalate), not the findings feed.
 * Workspace-scoped in URL, but since a workspace is one client, this is
 * already that one client's incidents — no engagementId needed. */
const REP_CRISIS_RESPONSE_HREF = "/dashboard/reputation-manager/incidents";

/** All 7 Cold Open skill ids — unlike Reputation Manager's 4 independent
 * watch sources, these are sequential phases of ONE pipeline
 * (icp_lock -> voice_capture -> source_connect -> send_connect ->
 * daily_send -> reply_sort -> send_report — see coldOpenConfig.phaseState),
 * so one dedicated page covering the whole pipeline's real output (sends,
 * pushes, replies) is the right shape, not 7 separate shells or splitting
 * the shared-page pattern further with a per-skill `?source=` the way RM's
 * 4 independent watches use it. This was a confirmed, real, standalone gap
 * — every Cold Open skill fell through to the bare engagement page's Run
 * History before cold-open-findings-panel.tsx existed. */
export const COLD_OPEN_SKILLS_WITH_FINDINGS_PAGE: WorkerId[] = [...COLD_OPEN_SKILL_IDS];

/**
 * The one real "go see this worker for this client" destination —
 * replaces routing every worker through /dashboard/modules/[skill] (a
 * roster of every client with that skill, pointless now that a workspace
 * only ever has one) with whichever real, single-client page already
 * exists for it: its own schedule/report page, RM's shared findings
 * page (pre-filtered to this worker's source), the incidents tracker, or
 * — for a worker with none of those (rep-onboarding) — the engagement
 * page's own Run History, pre-filtered to just this worker's runs via
 * the same `?skill=` param its filter chips already use.
 */
export function workerPrimaryHref(workerId: WorkerId, engagementId: string): string {
  if (SKILLS_WITH_OWN_PAGE.includes(workerId)) {
    return `/dashboard/engagements/${engagementId}/skills/${workerId}`;
  }
  if (workerId === "rep-crisis-response") {
    return REP_CRISIS_RESPONSE_HREF;
  }
  if (REP_SKILLS_WITH_FINDINGS_PAGE.includes(workerId)) {
    const source = REP_FINDINGS_SOURCE[workerId];
    return `/dashboard/engagements/${engagementId}/skills/reputation-manager${source ? `?source=${source}` : ""}`;
  }
  if (COLD_OPEN_SKILLS_WITH_FINDINGS_PAGE.includes(workerId)) {
    return `/dashboard/engagements/${engagementId}/skills/cold-open`;
  }
  return `/dashboard/engagements/${engagementId}?skill=${workerId}#run-history`;
}

/**
 * The one worker per product whose completion IS that product's real
 * onboarding signal — see src/lib/product-onboarding.ts, which reads each
 * one's actual output (confirmationPageUrl, a repIdentityGraphs row, a
 * coldOpenConfig row, a whopAgentConnections row) rather than trusting a
 * boolean. Used both server-side (the enable-gate routes' 422 body) and
 * client-side (which bridge the "finish setup" CTA points at — a
 * gated skill's OWN bridge href doesn't exist for anything but this one).
 */
export const PRODUCT_ONBOARDING_WORKER_ID: Record<ProductId, WorkerId> = {
  showtime: "pin-down",
  "reputation-manager": "rep-onboarding",
  "cold-open": "icp-lock",
  "whop-agent": "whop-connect",
};
