// src/lib/field-writeback.ts
//
// Phase 2, piece 1: the promotion step for trusted client_facts suggestions.
// Promotes verified suggestions into the real database columns workers read:
//   - bookingPlatform, hostingPlatform: trusted from "account" or "website"
//   - hubspotPortalId, smsA2p10dlcStatus, sendPlatform: trusted from "account"
//   - operatorHandles, collisions: trusted from "account", "website", or "user"
//   - trafficTemperature, castingChoice, competitors, entities,
//     seedPanelPrompts: trusted from "jev" when confidence >= 75%

import { db } from "@/lib/db";
import {
  engagements,
  repIdentityGraphs,
  type EngagementStack,
  type RepCompetitor,
  type RepEntity,
} from "@/models/schema";
import { eq } from "drizzle-orm";
import { getClientFacts, type ClientFact } from "@/lib/client-facts";
import { upsertColdOpenConfig, getColdOpenConfig } from "@/features/cold-open/server/config";

const JEV_APPLY_CONFIDENCE_THRESHOLD = 75;

export function toRepCompetitors(names: string[]): RepCompetitor[] {
  return names
    .filter((name) => typeof name === "string" && name.trim().length > 0)
    .map((name) => ({
      name: name.trim(),
      monitorFor: [],
      highPriority: false,
    }));
}

export function toRepEntities(names: string[]): RepEntity[] {
  return names
    .filter((name) => typeof name === "string" && name.trim().length > 0)
    .map((name) => ({
      name: name.trim(),
      aliases: [],
      type: "company",
      domainsOwned: [],
      handles: {},
      highPriority: false,
    }));
}

function isDirectlyTrusted(fact: ClientFact): boolean {
  return (
    fact.status !== "rejected" &&
    (fact.source === "account" || fact.source === "website" || fact.source === "user")
  );
}

function isTrustedJev(fact: ClientFact): boolean {
  return (
    fact.status !== "rejected" &&
    fact.source === "jev" &&
    (fact.confidence ?? 0) >= JEV_APPLY_CONFIDENCE_THRESHOLD
  );
}

interface WritebackDef {
  isTrusted(fact: ClientFact): boolean;
  apply(engagementId: string, value: unknown): Promise<void>;
}

async function loadStack(engagementId: string): Promise<EngagementStack | null> {
  const [row] = await db
    .select({ stack: engagements.stack })
    .from(engagements)
    .where(eq(engagements.engagementId, engagementId))
    .limit(1);
  return (row?.stack as EngagementStack | null) ?? null;
}

async function mergeStack(engagementId: string, patch: Partial<EngagementStack>): Promise<void> {
  const stack = (await loadStack(engagementId)) ?? ({} as EngagementStack);
  await db
    .update(engagements)
    .set({ stack: { ...stack, ...patch } as EngagementStack, updatedAt: new Date() })
    .where(eq(engagements.engagementId, engagementId));
}

const WRITEBACKS: Record<string, WritebackDef> = {
  bookingPlatform: {
    isTrusted: isDirectlyTrusted,
    apply: async (engagementId, value) => {
      const stack = await loadStack(engagementId);
      if (stack?.booking_platform) return;
      await mergeStack(engagementId, { booking_platform: value as EngagementStack["booking_platform"] });
    },
  },
  hostingPlatform: {
    isTrusted: isDirectlyTrusted,
    apply: async (engagementId, value) => {
      const stack = await loadStack(engagementId);
      if (stack?.hosting_platform) return;
      await mergeStack(engagementId, { hosting_platform: value as EngagementStack["hosting_platform"] });
    },
  },
  hubspotPortalId: {
    isTrusted: (f) => f.source === "account",
    apply: async (engagementId, value) => {
      const stack = await loadStack(engagementId);
      if (stack?.hubspot_portal_id) return;
      await mergeStack(engagementId, { hubspot_portal_id: String(value) });
    },
  },
  smsA2p10dlcStatus: {
    isTrusted: (f) => f.source === "account",
    apply: async (engagementId, value) => {
      const stack = await loadStack(engagementId);
      if (stack?.sms_a2p_10dlc_status) return;
      await mergeStack(engagementId, { sms_a2p_10dlc_status: value as EngagementStack["sms_a2p_10dlc_status"] });
    },
  },
  sendPlatform: {
    isTrusted: (f) => f.source === "account",
    apply: async (engagementId, value) => {
      const config = await getColdOpenConfig(engagementId);
      if (config?.sendPlatform) return;
      await upsertColdOpenConfig(engagementId, {
        sendPlatform: value as { platform: "instantly" | "smartlead" | "lemlist" | "reply_io" },
      });
    },
  },
  trafficTemperature: {
    isTrusted: isTrustedJev,
    apply: async (engagementId, value) => {
      const [row] = await db
        .select({ offerDetails: engagements.offerDetails })
        .from(engagements)
        .where(eq(engagements.engagementId, engagementId))
        .limit(1);
      const offerDetails = row?.offerDetails;
      if (!offerDetails || offerDetails.traffic_temperature) return;
      await db
        .update(engagements)
        .set({
          offerDetails: { ...offerDetails, traffic_temperature: value as "cold" | "warm" | "hot" },
          updatedAt: new Date(),
        })
        .where(eq(engagements.engagementId, engagementId));
    },
  },
  castingChoice: {
    isTrusted: isTrustedJev,
    apply: async (engagementId, value) => {
      const [row] = await db
        .select({ castingChoice: engagements.castingChoice })
        .from(engagements)
        .where(eq(engagements.engagementId, engagementId))
        .limit(1);
      if (row?.castingChoice) return;
      await db
        .update(engagements)
        .set({ castingChoice: String(value), updatedAt: new Date() })
        .where(eq(engagements.engagementId, engagementId));
    },
  },
  operatorHandles: {
    isTrusted: isDirectlyTrusted,
    apply: async (engagementId, value) => {
      if (typeof value !== "object" || value === null) return;
      const [row] = await db
        .select({ operatorHandles: repIdentityGraphs.operatorHandles })
        .from(repIdentityGraphs)
        .where(eq(repIdentityGraphs.engagementId, engagementId))
        .limit(1);

      if (!row) return;
      if (row.operatorHandles && Object.keys(row.operatorHandles).length > 0) return;

      await db
        .update(repIdentityGraphs)
        .set({ operatorHandles: value as Record<string, string>, updatedAt: new Date() })
        .where(eq(repIdentityGraphs.engagementId, engagementId));
    },
  },
  collisions: {
    isTrusted: isDirectlyTrusted,
    apply: async (engagementId, value) => {
      if (!Array.isArray(value) || value.length === 0) return;
      const shaped = value.map((item: any) => ({
        name: String(item.name || "Unknown Variant"),
        whoTheyAre: String(item.whoTheyAre || item.domain || "Same-name domain variant"),
        disambiguationNote: String(
          item.disambiguationNote || `Verify if ${item.domain || "this variant"} is an official property.`
        ),
        source: (item.source === "buyer" || item.source === "collision_check"
          ? item.source
          : "collision_check") as "buyer" | "collision_check",
      }));

      const [row] = await db
        .select({ collisions: repIdentityGraphs.collisions })
        .from(repIdentityGraphs)
        .where(eq(repIdentityGraphs.engagementId, engagementId))
        .limit(1);

      if (!row) return;
      if (row.collisions && row.collisions.length > 0) return;

      await db
        .update(repIdentityGraphs)
        .set({ collisions: shaped, updatedAt: new Date() })
        .where(eq(repIdentityGraphs.engagementId, engagementId));
    },
  },
  competitors: {
    isTrusted: isTrustedJev,
    apply: async (engagementId, value) => {
      if (!Array.isArray(value) || value.length === 0) return;
      const shaped = toRepCompetitors(value as string[]);
      if (shaped.length === 0) return;

      const [row] = await db
        .select({ competitors: repIdentityGraphs.competitors })
        .from(repIdentityGraphs)
        .where(eq(repIdentityGraphs.engagementId, engagementId))
        .limit(1);

      if (!row) return;
      if (row.competitors && row.competitors.length > 0) return;

      await db
        .update(repIdentityGraphs)
        .set({ competitors: shaped, updatedAt: new Date() })
        .where(eq(repIdentityGraphs.engagementId, engagementId));
    },
  },
  entities: {
    isTrusted: isTrustedJev,
    apply: async (engagementId, value) => {
      if (!Array.isArray(value) || value.length === 0) return;
      const shaped = toRepEntities(value as string[]);
      if (shaped.length === 0) return;

      const [row] = await db
        .select({ entities: repIdentityGraphs.entities })
        .from(repIdentityGraphs)
        .where(eq(repIdentityGraphs.engagementId, engagementId))
        .limit(1);

      if (!row) return;
      if (row.entities && row.entities.length > 0) return;

      await db
        .update(repIdentityGraphs)
        .set({ entities: shaped, updatedAt: new Date() })
        .where(eq(repIdentityGraphs.engagementId, engagementId));
    },
  },
  seedPanelPrompts: {
    isTrusted: isTrustedJev,
    apply: async (engagementId, value) => {
      if (!Array.isArray(value) || value.length === 0) return;

      const [row] = await db
        .select({ seedPanelPrompts: repIdentityGraphs.seedPanelPrompts })
        .from(repIdentityGraphs)
        .where(eq(repIdentityGraphs.engagementId, engagementId))
        .limit(1);

      if (!row) return;
      if (row.seedPanelPrompts && row.seedPanelPrompts.length > 0) return;

      await db
        .update(repIdentityGraphs)
        .set({ seedPanelPrompts: value as string[], updatedAt: new Date() })
        .where(eq(repIdentityGraphs.engagementId, engagementId));
    },
  },
};

/**
 * Promotes every trusted, applicable client_facts suggestion into its
 * real column for this engagement. Safe to run generically for any worker.
 */
export async function applyResolvableFacts(engagementId: string): Promise<string[]> {
  const facts = await getClientFacts(engagementId);
  const factList = Array.isArray(facts) ? facts : Object.values(facts);
  const applied: string[] = [];

  for (const fact of factList) {
    const def = WRITEBACKS[fact.key];
    if (!def || !def.isTrusted(fact)) continue;
    try {
      await def.apply(engagementId, fact.value);
      applied.push(fact.key);
    } catch (err) {
      console.error(`[field-writeback] failed to apply ${fact.key} for ${engagementId}:`, err);
    }
  }
  return applied;
}