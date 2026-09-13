// src/lib/whop-agent-skill-manifest.ts
//
// Whop Agent's own manifest — same split rep-skill-manifest.ts and
// cold-open-skill-manifest.ts already established: pure data only (id,
// name, description, runOnSetup, hasHingesPanel), no executor functions,
// so client components (the Skills panel, the Library) can import names
// and descriptions without pulling server-only code into the browser
// bundle. src/lib/whop-agent-skill-registry.ts wraps this with each
// skill's real execute function as it gets built.
//
// Ids map 1:1 onto the spec's own section numbers (0bb5e9c9-whop-agent-
// spec-v3.md) so a reviewer can trace "whop-cancellation-save-offer" back
// to "Section 5.6" without a lookup table living somewhere else.

export type WhopAgentSkillId =
  | "whop-connect"
  | "whop-product-launch-preflight"
  | "whop-purchase-cap-copilot"
  | "whop-drift-monitor"
  | "whop-weekly-ops-report"
  | "whop-portfolio-rollup"
  | "whop-cancellation-save-offer"
  | "whop-refund-dispute-velocity"
  | "whop-bulk-promo-codes"
  | "whop-payout-hold-kit"
  | "whop-dispute-response"
  | "whop-ads-draft-approve"
  | "whop-bridge-manager"
  | "whop-daily-change-digest"
  | "whop-attribution-report";

export const WHOP_AGENT_SKILL_IDS: WhopAgentSkillId[] = [
  "whop-connect",
  "whop-product-launch-preflight",
  "whop-purchase-cap-copilot",
  "whop-drift-monitor",
  "whop-weekly-ops-report",
  "whop-portfolio-rollup",
  "whop-cancellation-save-offer",
  "whop-refund-dispute-velocity",
  "whop-bulk-promo-codes",
  "whop-payout-hold-kit",
  "whop-dispute-response",
  "whop-ads-draft-approve",
  "whop-bridge-manager",
  "whop-daily-change-digest",
  "whop-attribution-report",
];

/** Which credential(s) a skill's calls are declared against (Section 2.2 /
 * 8.5 — the runtime routes each call to the declared credential and throws
 * at the adapter if a call would need one the skill never declared). */
export type WhopAgentCredentialKind = "bot" | "elevated" | "oauth";

export interface WhopAgentSkillManifestEntry {
  id: WhopAgentSkillId;
  name: string;
  description: string;
  runOnSetup: boolean;
  hasHingesPanel: boolean;
  requiredCredentials: WhopAgentCredentialKind[];
  /** Whether this skill is actually implemented (has a real execute
   * function in whop-agent-skill-registry.ts) — surfaced in the Library so
   * an operator sees "coming soon" honestly instead of an Enable button
   * that does nothing. Never true without a corresponding registry entry;
   * see that file's own header for the invariant this enforces. */
  implemented: boolean;
}

export const WHOP_AGENT_SKILL_MANIFEST: Record<WhopAgentSkillId, WhopAgentSkillManifestEntry> = {
  "whop-connect": {
    id: "whop-connect",
    name: "Connect Whop Account",
    description:
      "Paste a Whop Bot API key, run the 15-call scope probe, detect credential type, and audit + pin the existing webhook fleet. Every other Whop Agent skill needs this run first.",
    runOnSetup: true,
    hasHingesPanel: true,
    requiredCredentials: ["bot"],
    implemented: true,
  },
  "whop-product-launch-preflight": {
    id: "whop-product-launch-preflight",
    name: "Product Launch Pre-Flight",
    description:
      "Validates a product/plan/promo draft against Whop's silent caps (80-char headline, $2,500 purchase cap, metadata limits) before a single write, then creates it hidden and verifies every step by read-back.",
    runOnSetup: false,
    hasHingesPanel: false,
    requiredCredentials: ["bot"],
    implemented: true,
  },
  "whop-purchase-cap-copilot": {
    id: "whop-purchase-cap-copilot",
    name: "Purchase Cap Application Co-Pilot",
    description: "Assembles a purchase-cap application packet from your sales history and account-health data, with a submission walkthrough — Whop has no API to submit it for you.",
    runOnSetup: false,
    hasHingesPanel: false,
    requiredCredentials: ["bot"],
    implemented: true,
  },
  "whop-drift-monitor": {
    id: "whop-drift-monitor",
    name: "Pin-Exempt Resource Drift Monitor",
    description: "Weekly structural-fingerprint check on the 6 resources exempt from version pinning (cards, plans, transfers, swaps, deposits, exports) — plans especially, since it backs pricing-change confirmation.",
    runOnSetup: false,
    hasHingesPanel: false,
    requiredCredentials: ["bot"],
    implemented: true,
  },
  "whop-weekly-ops-report": {
    id: "whop-weekly-ops-report",
    name: "Weekly Ops Report",
    description: "Net revenue, MRR/ARR, churn, new subscribers, refund/dispute rate and more, read entirely from Whop's stats engine with debug.sql provenance stored per metric — no client-side aggregation.",
    runOnSetup: false,
    hasHingesPanel: false,
    requiredCredentials: ["bot"],
    implemented: true,
  },
  "whop-portfolio-rollup": {
    id: "whop-portfolio-rollup",
    name: "Portfolio Rollup Report",
    description: "The same Weekly Ops metric set joined across every other workspace on this account that also has Whop Agent connected — the cross-business view no native Whop dashboard provides.",
    runOnSetup: false,
    hasHingesPanel: false,
    requiredCredentials: ["bot"],
    implemented: true,
  },
  "whop-cancellation-save-offer": {
    id: "whop-cancellation-save-offer",
    name: "Cancellation Save-Offer Engine",
    description: "Configures Whop's native cancel-discount first, then proposes a save offer on every genuine cancel-intent (never an un-cancel) using previous_attributes for direction — operator approves every offer.",
    runOnSetup: false,
    hasHingesPanel: true,
    requiredCredentials: ["bot"],
    implemented: true,
  },
  "whop-refund-dispute-velocity": {
    id: "whop-refund-dispute-velocity",
    name: "Refund & Dispute Velocity Alert",
    description: "Rolling refund-rate, dispute-rate, and dispute-alert-count thresholds per product, with a minimum sample size so a handful of events on a small product isn't mistaken for a trend.",
    runOnSetup: false,
    hasHingesPanel: false,
    requiredCredentials: ["bot"],
    implemented: true,
  },
  "whop-bulk-promo-codes": {
    id: "whop-bulk-promo-codes",
    name: "Bulk Promo Code Generation",
    description: "Idempotency-keyed batch promo code creation with dry-run preview and open-loop rate-limit pacing.",
    runOnSetup: false,
    hasHingesPanel: false,
    requiredCredentials: ["bot"],
    implemented: true,
  },
  "whop-payout-hold-kit": {
    id: "whop-payout-hold-kit",
    name: "Payout Hold & Suspension Early-Warning Kit",
    description: "Assembles an evidence packet (transaction history, dispute history, Whop's own required_actions/recommended_actions, KYC/payout status) and a drafted escalation the moment a hold signal fires.",
    runOnSetup: false,
    hasHingesPanel: false,
    requiredCredentials: ["bot"],
    implemented: true,
  },
  "whop-dispute-response": {
    id: "whop-dispute-response",
    name: "Dispute Response Assembly",
    description: "Assembles and drafts dispute evidence starting from the pre-chargeback dispute_alert where possible, checking the evidence window on every draft and again before submit. Submit itself needs elevated scope.",
    runOnSetup: false,
    hasHingesPanel: false,
    requiredCredentials: ["bot", "elevated"],
    implemented: true,
  },
  "whop-ads-draft-approve": {
    id: "whop-ads-draft-approve",
    name: "Whop Ads Draft-and-Approve",
    description: "Pre-flight-checks the connected Meta page, generates creative, and drafts a campaign in Whop's own draft posture — flip-to-active is a separate, explicitly confirmed step needing elevated scope.",
    runOnSetup: false,
    hasHingesPanel: false,
    requiredCredentials: ["bot", "elevated"],
    implemented: true,
  },
  "whop-bridge-manager": {
    id: "whop-bridge-manager",
    name: "Whop-to-External Bridge Manager",
    description: "Routes verified Whop webhook events to an external destination (e.g. GHL) with a corrected 6-attempt/17-hour retry policy and 30-day-bounded gap replay after an outage.",
    runOnSetup: false,
    hasHingesPanel: true,
    requiredCredentials: ["bot"],
    implemented: true,
  },
  "whop-daily-change-digest": {
    id: "whop-daily-change-digest",
    name: "Daily Change Digest",
    description: "A rolling, resource-grouped summary of every previous_attributes delta received — what changed on your Whop yesterday, sourced entirely from webhooks, zero polling.",
    runOnSetup: false,
    hasHingesPanel: false,
    requiredCredentials: ["bot"],
    implemented: true,
  },
  "whop-attribution-report": {
    id: "whop-attribution-report",
    name: "Attribution & Affiliate Report",
    description: "Members grouped by promo code, affiliate, and checkout session off the v2 membership API — the only source with attribution fields — cross-checked against the stats engine.",
    runOnSetup: false,
    hasHingesPanel: false,
    requiredCredentials: ["bot"],
    implemented: true,
  },
};

export function isWhopAgentSkillId(value: string): value is WhopAgentSkillId {
  return (WHOP_AGENT_SKILL_IDS as string[]).includes(value);
}
