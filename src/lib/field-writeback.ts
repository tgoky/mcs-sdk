// src/lib/field-writeback.ts
//
// Phase 2, piece 1: the thing Phase 1's fact store couldn't do by itself.
// A suggestion sitting in client_facts does NOT make a worker functional
// — every worker's execute() reads engagements.stack/offerDetails/
// castingChoice or coldOpenConfig directly, never client_facts. So
// "resolved" has to mean promoting a trusted suggestion into the REAL
// column a worker actually reads, not just having a row in the fact
// store. This module is that promotion step.
//
// Deliberately covers only 7 of client_facts' possible keys — the ones
// this session already built real resolvers for AND can state a clear,
// conservative trust policy for:
//   - bookingPlatform, hostingPlatform: trusted from "account" (a
//     connected credential IS the platform, no inference) or "website"
//     (this app's own pre-existing crawl-signature detection — regex
//     matches on a booking iframe/script or a hosting generator meta tag
//     — already used to pre-fill Pin-Down's own form before this session
//     touched anything, so it's held to that same standing confidence).
//   - hubspotPortalId, smsA2p10dlcStatus, sendPlatform: trusted only from
//     "account" — real account-API facts or a definitional "you connected
//     it" signal, never a guess.
//   - trafficTemperature, castingChoice: trusted only from "jev" AND
//     above a real confidence threshold — these are judgment calls Jev
//     scored against crawled text, not facts, so they need the
//     confidence check the other 5 don't.
//
// Deliberately EXCLUDED: operatorName, offerName, offerIcp. Two reasons,
// not one. First, they're Claude's own guesses at crawled text
// (discover-client.ts), not verified facts or scored judgments — lower
// confidence than anything trusted above. Second, and more simply,
// operatorName's real destination (engagements.buyer) is set at client
// creation and is realistically never actually empty by the time any
// checker would ask about it — there's no genuine "missing -> resolved"
// transition to make here, only an "overwrite a human-given name with a
// guess" one, which is a different and much riskier operation this
// module doesn't attempt.
//
// Every apply() below re-reads the current real value immediately before
// writing and refuses to overwrite anything already set — never
// overwrites a value a human (or an earlier run of this same function)
// already put there, mirroring client-profile.ts's own
// setPrimaryDomainForEngagement convention.

import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { getClientFacts, type ClientFact } from "@/lib/client-facts";
import { upsertColdOpenConfig, getColdOpenConfig } from "@/features/cold-open/server/config";

const JEV_APPLY_CONFIDENCE_THRESHOLD = 75;

function isDirectlyTrusted(fact: ClientFact): boolean {
  return fact.status !== "rejected" && (fact.source === "account" || fact.source === "website" || fact.source === "user");
}

function isTrustedJevChoice(fact: ClientFact): boolean {
  return fact.status !== "rejected" && fact.source === "jev" && (fact.confidence ?? 0) >= JEV_APPLY_CONFIDENCE_THRESHOLD;
}

interface WritebackDef {
  isTrusted(fact: ClientFact): boolean;
  apply(engagementId: string, value: unknown): Promise<void>;
}

async function loadStack(engagementId: string): Promise<EngagementStack | null> {
  const [row] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  return (row?.stack as EngagementStack | null) ?? null;
}

async function mergeStack(engagementId: string, patch: Partial<EngagementStack>): Promise<void> {
  const stack = (await loadStack(engagementId)) ?? ({} as EngagementStack);
  await db.update(engagements).set({ stack: { ...stack, ...patch } as EngagementStack, updatedAt: new Date() }).where(eq(engagements.engagementId, engagementId));
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
      await upsertColdOpenConfig(engagementId, { sendPlatform: value as { platform: "instantly" | "smartlead" | "lemlist" | "reply_io" } });
    },
  },
  trafficTemperature: {
    isTrusted: isTrustedJevChoice,
    apply: async (engagementId, value) => {
      const [row] = await db.select({ offerDetails: engagements.offerDetails }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
      const offerDetails = row?.offerDetails;
      // Only fills in one missing field of an offer someone already
      // started — offerDetails' other fields (name/price/icp) are
      // required and this never fabricates them from nothing.
      if (!offerDetails || offerDetails.traffic_temperature) return;
      await db
        .update(engagements)
        .set({ offerDetails: { ...offerDetails, traffic_temperature: value as "cold" | "warm" | "hot" }, updatedAt: new Date() })
        .where(eq(engagements.engagementId, engagementId));
    },
  },
  castingChoice: {
    isTrusted: isTrustedJevChoice,
    apply: async (engagementId, value) => {
      const [row] = await db.select({ castingChoice: engagements.castingChoice }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
      if (row?.castingChoice) return;
      await db.update(engagements).set({ castingChoice: String(value), updatedAt: new Date() }).where(eq(engagements.engagementId, engagementId));
    },
  },
};

/**
 * Promotes every trusted, applicable client_facts suggestion into its
 * real column for this engagement. Called before a worker's completeness
 * checker runs (worker-config-completeness.ts) so the checker sees
 * already-resolved values instead of empty ones — the checker itself
 * needs no changes, it just reads storage that may now be a moment
 * fresher. Safe to call unconditionally and often: every apply() is a
 * no-op once its real column is set, and a fact with no registered
 * writeback is just skipped.
 */
export async function applyResolvableFacts(engagementId: string): Promise<string[]> {
  const facts = await getClientFacts(engagementId);
  const applied: string[] = [];
  for (const [key, fact] of Object.entries(facts)) {
    const def = WRITEBACKS[key];
    if (!def || !def.isTrusted(fact)) continue;
    try {
      await def.apply(engagementId, fact.value);
      applied.push(key);
    } catch (err) {
      console.error(`[field-writeback] failed to apply ${key} for ${engagementId}:`, err);
    }
  }
  return applied;
}
