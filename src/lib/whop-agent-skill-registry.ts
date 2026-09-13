import type { GetStepTools, Inngest } from "inngest";
import {
  WHOP_AGENT_SKILL_IDS,
  WHOP_AGENT_SKILL_MANIFEST,
  isWhopAgentSkillId,
  type WhopAgentSkillId,
  type WhopAgentSkillManifestEntry,
} from "@/lib/whop-agent-skill-manifest";
import { runWeeklyOpsReport } from "@/features/whop-agent/server/weekly-ops-report-service";
import { runPortfolioRollup } from "@/features/whop-agent/server/portfolio-rollup-service";
import { runAttributionReport } from "@/features/whop-agent/server/attribution-report-service";

export { WHOP_AGENT_SKILL_IDS, isWhopAgentSkillId };
export type { WhopAgentSkillId };

type StepTools = GetStepTools<Inngest.Any>;

export interface WhopAgentSkillDefinition extends WhopAgentSkillManifestEntry {
  /**
   * Same shape as SkillDefinition.execute (skill-registry.ts) — present
   * only for a skill dispatched through the generic run-execute path.
   * whop-connect has none: it runs synchronously from its own bridge
   * route (POST /api/engagements/[id]/bridges/whop-connect), the same
   * "own route, own dispatch, never through this registry" precedent
   * pile-on already established for a skill whose trigger shape doesn't
   * fit the generic dispatcher.
   *
   * tenant: any, matching every other product's SkillDefinition.execute —
   * the raw re-fetched engagement row, not worth modeling at this layer.
   */
  execute?: (tenant: any, runId: string, step: StepTools | undefined, ctx?: unknown) => Promise<void>;
}

/**
 * Invariant this file enforces by construction: a manifest entry can only
 * claim `implemented: true` (whop-agent-skill-manifest.ts) if it has a real
 * `execute` here — checked at the bottom of this file rather than trusted,
 * so the two can never silently drift apart the way an Enable button with
 * no real executor behind it would represent.
 */
export const WHOP_AGENT_SKILL_REGISTRY: Record<WhopAgentSkillId, WhopAgentSkillDefinition> = {
  "whop-connect": {
    ...WHOP_AGENT_SKILL_MANIFEST["whop-connect"],
    // No execute — see this file's own doc comment above.
  },
  "whop-product-launch-preflight": { ...WHOP_AGENT_SKILL_MANIFEST["whop-product-launch-preflight"] },
  "whop-purchase-cap-copilot": { ...WHOP_AGENT_SKILL_MANIFEST["whop-purchase-cap-copilot"] },
  "whop-drift-monitor": { ...WHOP_AGENT_SKILL_MANIFEST["whop-drift-monitor"] },
  "whop-weekly-ops-report": {
    ...WHOP_AGENT_SKILL_MANIFEST["whop-weekly-ops-report"],
    execute: (tenant, runId, step) => runWeeklyOpsReport(tenant, runId, step),
  },
  "whop-portfolio-rollup": {
    ...WHOP_AGENT_SKILL_MANIFEST["whop-portfolio-rollup"],
    execute: (tenant, runId, step) => runPortfolioRollup(tenant, runId, step),
  },
  "whop-cancellation-save-offer": { ...WHOP_AGENT_SKILL_MANIFEST["whop-cancellation-save-offer"] },
  "whop-refund-dispute-velocity": { ...WHOP_AGENT_SKILL_MANIFEST["whop-refund-dispute-velocity"] },
  "whop-bulk-promo-codes": { ...WHOP_AGENT_SKILL_MANIFEST["whop-bulk-promo-codes"] },
  "whop-payout-hold-kit": { ...WHOP_AGENT_SKILL_MANIFEST["whop-payout-hold-kit"] },
  "whop-dispute-response": { ...WHOP_AGENT_SKILL_MANIFEST["whop-dispute-response"] },
  "whop-ads-draft-approve": { ...WHOP_AGENT_SKILL_MANIFEST["whop-ads-draft-approve"] },
  "whop-bridge-manager": { ...WHOP_AGENT_SKILL_MANIFEST["whop-bridge-manager"] },
  "whop-daily-change-digest": { ...WHOP_AGENT_SKILL_MANIFEST["whop-daily-change-digest"] },
  "whop-attribution-report": {
    ...WHOP_AGENT_SKILL_MANIFEST["whop-attribution-report"],
    execute: (tenant, runId) => runAttributionReport(tenant, runId),
  },
};

// Skills whose real implementation runs through their own route rather
// than this registry's generic execute path (Section 9's own doc comment
// on WhopAgentSkillDefinition.execute) — exempt from the invariant below,
// same as pile-on is exempt from skill-registry.ts's own dispatcher.
const OWN_ROUTE_SKILLS = new Set<WhopAgentSkillId>([
  "whop-connect",
  "whop-product-launch-preflight",
  "whop-purchase-cap-copilot",
  // Webhook-driven, dispatched from processWhopWebhookEvent
  // (src/inngest/whop-agent.ts), not the generic manual/scheduled path.
  "whop-cancellation-save-offer",
  // Own scheduled cron dispatch (src/inngest/whop-agent.ts) rather than
  // the generic skillRunExecute path.
  "whop-drift-monitor",
  // Notification-only, not a tracked skillRuns execution at all.
  "whop-daily-change-digest",
  // Needs real batch input (codes, discounts) a generic dispatch has no
  // source for — own route, same reasoning as Product Launch Pre-Flight.
  "whop-bulk-promo-codes",
  // On-demand assembly with its own route (packet-on-demand mode).
  "whop-payout-hold-kit",
  // Webhook-driven (dispute_alert.created/dispute.created) or manual with
  // real disputeId input — own route/webhook dispatch, not generic.
  "whop-dispute-response",
  // Dispatches through its own Inngest event (whopAdsDraftProcess) with
  // real creative-brief/budget input, not the generic skillRunExecute path.
  "whop-ads-draft-approve",
  // Webhook-driven live routing (its own whopBridgeDeliver event) plus a
  // plain config route — no generic execute of its own.
  "whop-bridge-manager",
]);

for (const id of WHOP_AGENT_SKILL_IDS) {
  const entry = WHOP_AGENT_SKILL_REGISTRY[id];
  if (entry.implemented && !entry.execute && !OWN_ROUTE_SKILLS.has(id)) {
    throw new Error(`whop-agent-skill-registry.ts: "${id}" claims implemented:true but has no execute function.`);
  }
}
