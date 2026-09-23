// src/lib/cold-open-setup/state.ts
//
// Everything the Cold Open setup screen shows, in one read.

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { engagements, type ColdOpenSendPlatformId } from "@/models/schema";
import { getClientFacts, type ClientFact } from "@/lib/client-facts";
import { getPrimaryDomainForEngagement } from "@/lib/client-profile";
import { hasCredential } from "@/lib/credentials";
import { getColdOpenEngagementSkillStates } from "@/lib/engagement-skills";
import { factTier } from "@/lib/fact-trust";
import { COLD_OPEN_SEND_TOOLS, findSetupTool, findShowtimeTool, type SetupTool } from "@/lib/showtime-setup/catalog";
import { loadToolStates } from "@/lib/showtime-setup/tool-states";
import { getColdOpenConfig, type ColdOpenConfigRow } from "@/features/cold-open/server/config";
import { buildColdOpenProposal, type SavedColdOpen } from "./proposal";
import { loadCampaignMatches } from "./jev";
import type { BuyerProfile } from "./analyze";
import type { SenderIntel } from "./sender";
import type { ColdOpenSetupState, Outbound } from "./types";

export const SEND_PLATFORMS: ColdOpenSendPlatformId[] = ["instantly", "smartlead", "lemlist", "reply_io"];
export const sendProvider = (p: ColdOpenSendPlatformId) => `cold_open_${p}`;

/** Sending tools, plus HubSpot for who really buys. */
const HUBSPOT = findShowtimeTool("hubspot");
export const COLD_OPEN_TOOLS: SetupTool[] = HUBSPOT ? [...COLD_OPEN_SEND_TOOLS, HUBSPOT] : COLD_OPEN_SEND_TOOLS;

export function platformLabel(platform: string): string {
  return findSetupTool(platform.startsWith("cold_open_") ? platform : sendProvider(platform as ColdOpenSendPlatformId))?.label ?? platform;
}

const factValue = <T>(f: ClientFact | undefined): T | null => (f && f.status !== "rejected" && f.value && typeof f.value === "object" ? (f.value as T) : null);

/** The saved config, or null when nothing has been saved yet. */
export function savedFrom(config: ColdOpenConfigRow | null): SavedColdOpen | null {
  if (!config) return null;
  return {
    productIdentity: config.productIdentity ?? null,
    icps: config.icps ?? [],
    sizingBounds: config.sizingBounds ?? {},
    voiceProfile: config.voiceProfile ?? null,
    subjectVariants: config.subjectVariants ?? [],
    bodyVariantPools: config.bodyVariantPools ?? {},
    sendPlatform: config.sendPlatform ?? null,
    campaignMap: config.campaignMap ?? {},
    dailySendSettings: config.dailySendSettings ?? null,
  };
}

/** The sending platform whose key is attached: the saved one first. */
export async function connectedPlatform(engagementId: string, saved: ColdOpenSendPlatformId | null): Promise<ColdOpenSendPlatformId | null> {
  const order = saved ? [saved, ...SEND_PLATFORMS.filter((p) => p !== saved)] : SEND_PLATFORMS;
  for (const p of order) if (await hasCredential(engagementId, sendProvider(p))) return p;
  return null;
}

export async function clientTimezone(engagementId: string): Promise<string | null> {
  const [row] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  return (row?.stack as { timezone?: string } | null)?.timezone ?? null;
}

export async function loadColdOpenSetupState(engagementId: string, workspaceId: string): Promise<ColdOpenSetupState | null> {
  const [row] = await db.select({ buyer: engagements.buyer }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  if (!row) return null;

  const [config, facts, domain, skills, matches, timezone] = await Promise.all([
    getColdOpenConfig(engagementId),
    getClientFacts(engagementId),
    getPrimaryDomainForEngagement(engagementId),
    getColdOpenEngagementSkillStates(engagementId),
    loadCampaignMatches(engagementId),
    clientTimezone(engagementId),
  ]);
  const saved = savedFrom(config);
  const tools = await loadToolStates(engagementId, workspaceId, COLD_OPEN_TOOLS, facts);
  const platform = await connectedPlatform(engagementId, saved?.sendPlatform?.platform ?? null);

  // A read of a different platform than the one connected now is stale.
  const senderFact = factValue<SenderIntel>(facts.coldOpenSender);
  const sender = senderFact && senderFact.platform === platform ? senderFact : null;
  const outboundFact = factValue<Outbound>(facts.coldOpenOutbound);
  const outbound = outboundFact && outboundFact.platform === platform ? outboundFact : null;
  const buyers = factValue<BuyerProfile>(facts.coldOpenBuyers);

  const crm = tools.some((t) => t.provider === "hubspot" && t.linked) ? { provider: "hubspot", label: "HubSpot" } : null;
  const corpus = facts.rawVoiceCorpus;

  return {
    engagementId,
    buyer: row.buyer,
    configured: Boolean(saved?.icps.length && saved.productIdentity?.name),
    skills,
    website: { domain, readAt: corpus ? corpus.updatedAt.toISOString() : null },
    tools,
    crm,
    outbound,
    buyers,
    proposal: buildColdOpenProposal({ domain, saved, facts, sender, buyers, campaignMatch: matches, clientTimezone: timezone, tierOf: factTier, platformLabel }),
    leadSources: (config?.leadSources ?? []).map((s) => ({ icp: s.icp, rows: s.csvContent ? Math.max(0, s.csvContent.trim().split(/\r?\n/).length - 1) : 0 })),
  };
}
