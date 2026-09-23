// src/lib/rep-setup/state.ts
//
// Everything the Reputation Manager setup screen shows, in one read.

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { engagements, repIdentityGraphs } from "@/models/schema";
import { getClientFacts } from "@/lib/client-facts";
import { getPrimaryDomainForEngagement } from "@/lib/client-profile";
import { hasCredential } from "@/lib/credentials";
import { getRepEngagementSkillStates } from "@/lib/engagement-skills";
import { factTier } from "@/lib/fact-trust";
import { findShowtimeTool } from "@/lib/showtime-setup/catalog";
import { loadToolStates } from "@/lib/showtime-setup/tool-states";
import { REP_ENGINE_IDS, resolveEngineModel } from "@/features/reputation-manager/engine-models";
import { buildRepProposal, type SavedGraph } from "./proposal";
import { loadRepDecisions } from "./jev";
import { REP_TOOLS, WHOP_PROVIDER } from "./tools";
import type { FirstLook, RepSetupState } from "./types";

export function toolLabel(provider: string): string {
  if (provider === WHOP_PROVIDER || provider === "whop") return "Whop";
  return findShowtimeTool(provider)?.label ?? provider;
}

export async function loadRepGraph(engagementId: string) {
  const [row] = await db.select().from(repIdentityGraphs).where(eq(repIdentityGraphs.engagementId, engagementId)).limit(1);
  return row ?? null;
}

export async function loadRepSetupState(engagementId: string, workspaceId: string): Promise<RepSetupState | null> {
  const [row] = await db.select({ buyer: engagements.buyer }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  if (!row) return null;

  const [graph, facts, domain, decisions, skills] = await Promise.all([
    loadRepGraph(engagementId),
    getClientFacts(engagementId),
    getPrimaryDomainForEngagement(engagementId),
    loadRepDecisions(engagementId),
    getRepEngagementSkillStates(engagementId),
  ]);

  // A placeholder row (opened once, never saved) counts as nothing saved.
  const savedGraph: SavedGraph | null = graph && graph.operatorName.trim() ? { ...graph, googleListing: graph.googleListing ?? null } : null;

  const tools = await loadToolStates(engagementId, workspaceId, REP_TOOLS, facts);

  const corpus = facts.rawVoiceCorpus;
  const firstLook = facts.repFirstLook && facts.repFirstLook.status !== "rejected" ? (facts.repFirstLook.value as FirstLook) : null;

  return {
    engagementId,
    buyer: row.buyer,
    configured: Boolean(savedGraph && savedGraph.soleAuthorityName.trim()),
    skills,
    website: { domain, readAt: corpus ? corpus.updatedAt.toISOString() : null },
    tools,
    whop: { linked: await hasCredential(engagementId, WHOP_PROVIDER), connectHref: `/dashboard/engagements/${engagementId}/bridges/whop-connect` },
    proposal: buildRepProposal({ buyer: row.buyer, primaryDomain: domain, saved: savedGraph, facts, decisions, tierOf: factTier, toolLabel }),
    firstLook,
    engines: { active: graph?.activeEngines ?? null, available: REP_ENGINE_IDS.filter((e) => Boolean(resolveEngineModel(e))) },
    crisisThreshold: graph?.crisisThresholdOverride ?? null,
    operatorPagePhone: graph?.operatorPagePhone ?? null,
  };
}
