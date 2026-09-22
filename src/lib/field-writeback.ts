// src/lib/field-writeback.ts
//
// Phase 2, piece 1: Complete 100% promotion engine for trusted client_facts.
// Promotes verified suggestions into the real database columns read across:
//   - Showtime (engagements.stack, engagements.offerDetails, engagements.castingChoice)
//   - Reputation Manager (repIdentityGraphs.*)
//   - Cold Open (coldOpenConfig.*)

import { db } from "@/lib/db";
import {
  engagements,
  repIdentityGraphs,
  type EngagementStack,
  type RepCompetitor,
  type RepEntity,
  type ColdOpenIcp,
} from "@/models/schema";
import { eq } from "drizzle-orm";
import { getClientFacts, type ClientFact } from "@/lib/client-facts";
import { upsertColdOpenConfig, getColdOpenConfig } from "@/features/cold-open/server/config";

const JEV_APPLY_CONFIDENCE_THRESHOLD = 75;

// Extract exact type from schema.ts definition to prevent drift or ts(2322) mismatches
export type OfferDetails = NonNullable<typeof engagements.$inferSelect.offerDetails>;

const DEFAULT_OFFER_DETAILS: OfferDetails = {
  name: "",
  price: "",
  icp: "",
  traffic_temperature: "warm",
  hybrid_mode_enabled: false,
};

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

async function loadOfferDetails(engagementId: string): Promise<OfferDetails | null> {
  const [row] = await db
    .select({ offerDetails: engagements.offerDetails })
    .from(engagements)
    .where(eq(engagements.engagementId, engagementId))
    .limit(1);
  return (row?.offerDetails as OfferDetails | null) ?? null;
}

async function mergeOfferDetails(engagementId: string, patch: Partial<OfferDetails>): Promise<void> {
  const existing = await loadOfferDetails(engagementId);
  const fullOffer: OfferDetails = {
    ...DEFAULT_OFFER_DETAILS,
    ...existing,
    ...patch,
  };
  await db
    .update(engagements)
    .set({ offerDetails: fullOffer, updatedAt: new Date() })
    .where(eq(engagements.engagementId, engagementId));
}

const WRITEBACKS: Record<string, WritebackDef> = {
  // ── SHOWTIME STACK WRITEBACKS ──────────────────────────────────────────
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
  emailPlatform: {
    isTrusted: isDirectlyTrusted,
    apply: async (engagementId, value) => {
      const stack = await loadStack(engagementId);
      if (stack?.email_platform) return;
      await mergeStack(engagementId, { email_platform: value as EngagementStack["email_platform"] });
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
  timezone: {
    isTrusted: isDirectlyTrusted,
    apply: async (engagementId, value) => {
      const stack = await loadStack(engagementId);
      if (stack?.timezone) return;
      await mergeStack(engagementId, { timezone: String(value) });
    },
  },
  existingConfirmationPageUrl: {
    isTrusted: isDirectlyTrusted,
    apply: async (engagementId, value) => {
      const stack = await loadStack(engagementId);
      if (stack?.existing_confirmation_page_url) return;
      await mergeStack(engagementId, { existing_confirmation_page_url: String(value) });
    },
  },

  // ── SHOWTIME OFFER & CASTING WRITEBACKS ───────────────────────────────
  trafficTemperature: {
    isTrusted: isTrustedJev,
    apply: async (engagementId, value) => {
      const offer = await loadOfferDetails(engagementId);
      if (offer?.traffic_temperature) return;
      await mergeOfferDetails(engagementId, { traffic_temperature: value as "cold" | "warm" | "hot" });
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
  offerName: {
    isTrusted: (f) => isDirectlyTrusted(f) || isTrustedJev(f),
    apply: async (engagementId, value) => {
      const offer = await loadOfferDetails(engagementId);
      if (offer?.name) return;
      await mergeOfferDetails(engagementId, { name: String(value).trim() });
    },
  },
  offerPrice: {
    isTrusted: (f) => isDirectlyTrusted(f) || isTrustedJev(f),
    apply: async (engagementId, value) => {
      const offer = await loadOfferDetails(engagementId);
      if (offer?.price) return;
      await mergeOfferDetails(engagementId, { price: String(value).trim() });
    },
  },
  offerIcp: {
    isTrusted: (f) => isDirectlyTrusted(f) || isTrustedJev(f),
    apply: async (engagementId, value) => {
      const offer = await loadOfferDetails(engagementId);
      if (offer?.icp) return;
      await mergeOfferDetails(engagementId, { icp: String(value).trim() });
    },
  },
  offerVertical: {
    isTrusted: (f) => isDirectlyTrusted(f) || isTrustedJev(f),
    apply: async (engagementId, value) => {
      const offer = await loadOfferDetails(engagementId);
      if (offer?.vertical) return;
      await mergeOfferDetails(engagementId, { vertical: String(value).trim() });
    },
  },

  // ── REPUTATION MANAGER IDENTITY GRAPH WRITEBACKS ───────────────────────
  operatorName: {
    isTrusted: (f) => isDirectlyTrusted(f) || isTrustedJev(f),
    apply: async (engagementId, value) => {
      const [row] = await db
        .select({ operatorName: repIdentityGraphs.operatorName })
        .from(repIdentityGraphs)
        .where(eq(repIdentityGraphs.engagementId, engagementId))
        .limit(1);
      if (!row || row.operatorName) return;
      await db
        .update(repIdentityGraphs)
        .set({ operatorName: String(value).trim(), updatedAt: new Date() })
        .where(eq(repIdentityGraphs.engagementId, engagementId));
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

      if (!row || (row.operatorHandles && Object.keys(row.operatorHandles).length > 0)) return;

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

      if (!row || (row.collisions && row.collisions.length > 0)) return;

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

      if (!row || (row.competitors && row.competitors.length > 0)) return;

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

      if (!row || (row.entities && row.entities.length > 0)) return;

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

      if (!row || (row.seedPanelPrompts && row.seedPanelPrompts.length > 0)) return;

      await db
        .update(repIdentityGraphs)
        .set({ seedPanelPrompts: value as string[], updatedAt: new Date() })
        .where(eq(repIdentityGraphs.engagementId, engagementId));
    },
  },
  reviewBaseline: {
    isTrusted: isDirectlyTrusted,
    apply: async (engagementId, value) => {
      if (typeof value !== "object" || value === null) return;
      const [row] = await db
        .select({ reviewBaseline: repIdentityGraphs.reviewBaseline })
        .from(repIdentityGraphs)
        .where(eq(repIdentityGraphs.engagementId, engagementId))
        .limit(1);

      if (!row || row.reviewBaseline) return;

      await db
        .update(repIdentityGraphs)
        .set({ reviewBaseline: value as Record<string, any>, updatedAt: new Date() })
        .where(eq(repIdentityGraphs.engagementId, engagementId));
    },
  },

  // ── COLD OPEN CONFIG WRITEBACKS ───────────────────────────────────────
  sendPlatform: {
    isTrusted: (f) => f.source === "account",
    apply: async (engagementId, value) => {
      const config = await getColdOpenConfig(engagementId);
      if (!config || config.sendPlatform) return;
      await upsertColdOpenConfig(engagementId, {
        sendPlatform: value as { platform: "instantly" | "smartlead" | "lemlist" | "reply_io" },
      });
    },
  },
  productIdentity: {
    isTrusted: (f) => isDirectlyTrusted(f) || isTrustedJev(f),
    apply: async (engagementId, value) => {
      if (typeof value !== "object" || value === null) return;
      const config = await getColdOpenConfig(engagementId);
      if (!config || config.productIdentity?.name) return;
      await upsertColdOpenConfig(engagementId, {
        productIdentity: value as { name: string; url: string; price: string; valueProp: string },
      });
    },
  },
  icps: {
    isTrusted: isTrustedJev,
    apply: async (engagementId, value) => {
      if (!Array.isArray(value) || value.length === 0) return;
      const config = await getColdOpenConfig(engagementId);
      if (!config || (config.icps && config.icps.length > 0)) return;
      await upsertColdOpenConfig(engagementId, {
        icps: value as ColdOpenIcp[],
      });
    },
  },
  voiceProfile: {
    isTrusted: (f) => isDirectlyTrusted(f) || isTrustedJev(f),
    apply: async (engagementId, value) => {
      if (typeof value !== "object" || value === null) return;
      const val = value as Record<string, any>;
      const config = await getColdOpenConfig(engagementId);
      if (!config || config.voiceProfile?.tone) return;

      await upsertColdOpenConfig(engagementId, {
        voiceProfile: {
          greeting: String(val.greeting || val.greetingStyle || "Hi {first_name},"),
          signOff: String(val.signOff || val.signoffStyle || "Best,"),
          tone: String(val.tone || "Professional"),
          sourceDomain: val.sourceDomain ? String(val.sourceDomain) : undefined,
        },
      });
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