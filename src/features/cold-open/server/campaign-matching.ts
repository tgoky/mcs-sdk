// src/features/cold-open/server/campaign-matching.ts
//
// Suggests which of the client's real ESP campaigns each locked ICP should
// push into. Jev picks from the actual campaign list (plus "none of these"),
// judged on campaign names against each ICP's label — it never invents a
// campaign. Send Connect pre-selects a match only at or above the same
// threshold field-writeback uses; weaker matches are shown as suggestions.

import { askJev, type JevQuestion } from "@/lib/jev";
import type { ColdOpenIcp } from "@/models/schema";

export const CAMPAIGN_MATCH_APPLY_THRESHOLD = 75;
const NONE = "__none__";
// Jev's documented ceiling is 255 choices per question; one is "none".
const MAX_CAMPAIGNS = 254;

export interface CampaignMatch {
  campaignId: string;
  campaignName: string;
  /** 0-100, from Jev's choice distribution. */
  confidence: number;
}

export async function suggestCampaignMap(
  icps: Pick<ColdOpenIcp, "slug" | "label">[],
  campaigns: { id: string; name: string }[],
  engagementId?: string
): Promise<Record<string, CampaignMatch>> {
  const usable = campaigns.filter((c) => c.id && c.name?.trim()).slice(0, MAX_CAMPAIGNS);
  if (icps.length === 0 || usable.length === 0) return {};

  const criteria: Record<string, string> = Object.fromEntries(usable.map((c) => [c.id, c.name]));
  criteria[NONE] = "None of these campaigns is aimed at this audience.";

  const questions: Record<string, JevQuestion> = {};
  for (const icp of icps) {
    questions[icp.slug] = {
      type: "choice",
      instructions: `Which of these outreach campaigns, judged by its name, is meant for this audience: "${icp.label}"?`,
      criteria,
    };
  }

  const result = await askJev({ state: { campaigns: usable.map((c) => c.name) }, questions, reading: { engagementId, purpose: "cold-open-campaign-match" } });

  const byId = new Map(usable.map((c) => [c.id, c.name]));
  const out: Record<string, CampaignMatch> = {};
  for (const icp of icps) {
    const answer = result.answers[icp.slug];
    if (!answer || answer.type !== "choice" || answer.choice === NONE) continue;
    const name = byId.get(answer.choice);
    if (!name) continue;
    out[icp.slug] = { campaignId: answer.choice, campaignName: name, confidence: Math.round(answer.confidence * 100) };
  }
  return out;
}
