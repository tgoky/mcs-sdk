// src/lib/cold-open-setup/jev.ts
//
// Jev's pick of which of the client's real campaigns each ICP's leads go
// into (Send Connect's own matcher: judged on campaign names, never an
// invented campaign, "none of these" allowed). Stored as one fact so the
// setup screen shows it without asking again.

import { getClientFact, upsertClientFact } from "@/lib/client-facts";
import { suggestCampaignMap } from "@/features/cold-open/server/campaign-matching";
import type { ColdOpenIcp } from "@/models/schema";

export type CampaignMatches = Record<string, { id: string; confidence: number } | null>;

export async function loadCampaignMatches(engagementId: string): Promise<CampaignMatches | null> {
  const f = await getClientFact(engagementId, "coldOpenCampaignMatch");
  return f && f.status !== "rejected" && f.value && typeof f.value === "object" ? (f.value as CampaignMatches) : null;
}

/** Never throws. Null when there was nothing to match. */
export async function matchCampaigns(engagementId: string, icps: Pick<ColdOpenIcp, "slug" | "label">[], campaigns: { id: string; name: string }[]): Promise<CampaignMatches | null> {
  if (icps.length === 0 || campaigns.length === 0) return null;
  try {
    const found = await suggestCampaignMap(icps, campaigns, engagementId);
    const out: CampaignMatches = {};
    for (const i of icps) out[i.slug] = found[i.slug] ? { id: found[i.slug].campaignId, confidence: found[i.slug].confidence } : null;
    const scores = Object.values(found).map((m) => m.confidence);
    await upsertClientFact(engagementId, "coldOpenCampaignMatch", out, {
      source: "jev",
      sourceDetail: "coldOpenSetup",
      confidence: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : undefined,
      evidence: `Jev matched ${icps.length} ICPs against ${campaigns.length} campaign names.`,
    });
    return out;
  } catch (err) {
    console.warn(`[cold-open-setup] campaign matching failed for ${engagementId}:`, err instanceof Error ? err.message : err);
    return null;
  }
}
