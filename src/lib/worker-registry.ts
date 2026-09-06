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
 * description saying so. This is the piece that makes "derivable" mean
 * something a future worker can rely on generically: declare
 * `derivableFrom: "primaryDomain"` and the enablement flow calls
 * getPrimaryDomainForEngagement, full stop — no per-worker bespoke
 * lookup code, and no field can claim to be derivable without naming a
 * real function that backs it. Grows only alongside client-profile.ts
 * itself; adding a value here with nothing backing it in that module is
 * exactly the unverified-claim problem this type exists to prevent.
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

export interface WorkerDefinition {
  id: WorkerId;
  productId: ProductId;
  name: string;
  description: string;
  runOnSetup: boolean;
  hasHingesPanel: boolean;
  /**
   * Deliberately incomplete today. Filling this in correctly means tracing
   * each skill's actual required inputs back to their real field on
   * EngagementStack or repIdentityGraphs — the same kind of trace
   * skill-manifest.ts's own header describes doing for display names — not
   * something to guess at per-skill in one pass. rep-onboarding is filled
   * in below as a verified worked example (traced against
   * repIdentityGraphs' real columns in schema.ts); every other worker's
   * array stays empty until it gets the same treatment. An empty array
   * means "not yet classified," not "this worker needs no configuration."
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
  ],
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
