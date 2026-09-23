// src/lib/field-writeback.ts
//
// Phase 2, piece 1: Complete 100% promotion engine for trusted client_facts.
// Promotes verified suggestions into the real database columns read across:
//   - Showtime (engagements.stack, engagements.offerDetails, engagements.castingChoice)
//   - Reputation Manager (repIdentityGraphs.*)
//   - Cold Open (coldOpenConfig.*)
//   - Whop Agent (engagements.stack.whop_*)

import { patchEngagementStack } from "@/lib/engagement-stack";
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
import { salesCallMetaPatch } from "@/lib/account-intel/decisions";

const JEV_APPLY_CONFIDENCE_THRESHOLD = 75;

// Extract exact type from schema.ts definition to prevent drift or ts(2322) mismatches
export type OfferDetails = NonNullable<typeof engagements.$inferSelect.offerDetails>;

// traffic_temperature is deliberately absent: filling one offer field must
// not also invent a "warm" answer to a required question — that would mark
// it filled and stop Jev's real answer from ever being applied.
const DEFAULT_OFFER_DETAILS: Omit<OfferDetails, "traffic_temperature"> = {
  name: "",
  price: "",
  icp: "",
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

// Atomic (engagement-stack.ts): a write-back never restores a stale copy
// of keys a form saved at the same moment.
async function mergeStack(engagementId: string, patch: Partial<EngagementStack>): Promise<void> {
  await patchEngagementStack(engagementId, patch);
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
  const fullOffer = {
    ...DEFAULT_OFFER_DETAILS,
    ...existing,
    ...patch,
  } as OfferDetails;
  await db
    .update(engagements)
    .set({ offerDetails: fullOffer, updatedAt: new Date() })
    .where(eq(engagements.engagementId, engagementId));
}

/** GoHighLevel's CRM credential and its calendar are the same account. */
function sameBookingTool(bookingPlatform: string, provider: string): boolean {
  return bookingPlatform === provider || (bookingPlatform === "ghl_calendar" && provider === "ghl");
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

  // ── SHOWTIME CONTENT FROM THE DEEP CRAWL ──────────────────────────────
  // Only ever fills an empty slot: a proof block, call questions or
  // objections someone already wrote are never replaced by the crawl.
  siteTestimonials: {
    // Copied word for word from the site (checked in discovery-prefill.ts).
    isTrusted: isDirectlyTrusted,
    apply: async (engagementId, value) => {
      if (!Array.isArray(value)) return;
      const [row] = await db.select({ existingProof: engagements.existingProof }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
      if (row?.existingProof?.testimonials?.length) return;
      // The confirmation page only shows a proof block when an entry has a
      // name, a role and a quote (its own rule); a company stands in for a
      // missing role.
      const testimonials = (value as { quote?: string; name?: string; role?: string; company?: string; sourceUrl?: string }[])
        .filter((t) => t?.quote && t.name && (t.role || t.company))
        .slice(0, 6)
        .map((t) => ({ name: t.name!, role: (t.role || t.company)!, company: t.company, quote: t.quote!, sourceUrl: t.sourceUrl }));
      if (testimonials.length === 0) return;
      await db.update(engagements).set({ existingProof: { testimonials }, updatedAt: new Date() }).where(eq(engagements.engagementId, engagementId));
    },
  },
  siteFaqs: {
    // The questions are the site's own words (checked in discovery-prefill.ts).
    isTrusted: isDirectlyTrusted,
    apply: async (engagementId, value) => {
      if (!Array.isArray(value)) return;
      const [row] = await db.select({ topCallQuestions: engagements.topCallQuestions }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
      if (row?.topCallQuestions?.length) return;
      const questions = (value as { question?: string }[]).map((f) => f?.question?.trim()).filter((q): q is string => Boolean(q)).slice(0, 8);
      if (questions.length === 0) return;
      await db.update(engagements).set({ topCallQuestions: questions, updatedAt: new Date() }).where(eq(engagements.engagementId, engagementId));
    },
  },
  siteObjections: {
    // Inferred by Claude, so only once Jev has scored the list well.
    isTrusted: isTrustedJev,
    apply: async (engagementId, value) => {
      if (!Array.isArray(value)) return;
      const [row] = await db.select({ topObjections: engagements.topObjections }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
      if (row?.topObjections?.length) return;
      const objections = (value as unknown[]).filter((o): o is string => typeof o === "string" && o.trim().length > 0).slice(0, 8);
      if (objections.length === 0) return;
      await db.update(engagements).set({ topObjections: objections, updatedAt: new Date() }).where(eq(engagements.engagementId, engagementId));
    },
  },

  // ── SHOWTIME FROM THE CONNECTED ACCOUNTS (account-intel) ──────────────
  // The sales-call event type: matched to the site's booking link or the
  // only one (account), or Jev's pick. Fills the booking config's own id
  // for it, and the standing link, only when they're empty.
  salesCallEventType: {
    isTrusted: (f) => isDirectlyTrusted(f) || isTrustedJev(f),
    apply: async (engagementId, value) => {
      const v = value as { provider?: string; id?: string | null; url?: string | null } | null;
      if (!v?.id || !v.provider) return;
      const stack = await loadStack(engagementId);
      if (stack?.booking_platform && !sameBookingTool(stack.booking_platform, v.provider)) return;
      const current = stack?.booking_platform_meta ?? {};
      // Only fills an empty id; a person's choice is written by recordSalesCallChoice.
      const fill = Object.fromEntries(Object.entries(salesCallMetaPatch(v.provider, v.id)).filter(([k]) => !current[k as keyof typeof current]));
      const patch: Partial<EngagementStack> = { booking_platform_meta: { ...current, ...fill } };
      if (!stack?.booking_standing_link && v.url) patch.booking_standing_link = v.url;
      await mergeStack(engagementId, patch);
    },
  },
  // Owner-level ids the booking adapters need (Calendly organization,
  // Cal.com username, GHL location), straight from the account.
  bookingAccountMeta: {
    isTrusted: isDirectlyTrusted,
    apply: async (engagementId, value) => {
      const v = value as { provider?: string; organization_uri?: string; username?: string; location_id?: string } | null;
      if (!v?.provider) return;
      const stack = await loadStack(engagementId);
      if (stack?.booking_platform && !sameBookingTool(stack.booking_platform, v.provider)) return;
      const meta = { ...(stack?.booking_platform_meta ?? {}) };
      let changed = false;
      for (const key of ["organization_uri", "username", "location_id"] as const) {
        if (v[key] && !meta[key]) {
          meta[key] = v[key];
          changed = true;
        }
      }
      if (changed) await mergeStack(engagementId, { booking_platform_meta: meta });
    },
  },
  // Worries prospects actually voiced (booking answers, cancel reasons,
  // lost deals), read by Claude and scored by Jev. Fills objections only
  // when nobody has written any.
  prospectConcerns: {
    isTrusted: isTrustedJev,
    apply: async (engagementId, value) => {
      if (!Array.isArray(value)) return;
      const [row] = await db.select({ topObjections: engagements.topObjections }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
      if (row?.topObjections?.length) return;
      const concerns = (value as unknown[]).filter((o): o is string => typeof o === "string" && o.trim().length > 0).slice(0, 8);
      if (concerns.length) await db.update(engagements).set({ topObjections: concerns, updatedAt: new Date() }).where(eq(engagements.engagementId, engagementId));
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
      // A platform -> handle map only; an array would be stored as
      // {"0": ..., "1": ...} and lose which platform each handle is on.
      if (typeof value !== "object" || value === null || Array.isArray(value)) return;
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

  // Deliberately no Whop Agent writebacks. The cancellation save offer is
  // sent to real members and the bridge destination receives their event
  // data, so both are only ever set by a human through the validated
  // whop-agent/save-offer-config and whop-agent/bridge-config routes —
  // never promoted from a crawl, an account harvest, or a model guess.
};

/**
 * Promotes every trusted, applicable client_facts suggestion into its
 * real column for this engagement. Safe to run generically for any worker.
 */
/**
 * The single trust rule every caller uses — the writeback loop below and
 * the dossiers deciding whether a fact pre-fills a field or is only shown
 * as a suggestion — so the two can never disagree.
 *
 * A fact a human confirmed or edited is trusted whatever its source; a
 * rejected one never is. Otherwise the key's own writeback rule decides,
 * and a key with no writeback falls back to the default (scraped/account/
 * user values, or a Jev score at or above the threshold).
 */
export function isFactTrusted(fact: ClientFact): boolean {
  if (fact.status === "rejected") return false;
  if (fact.status === "confirmed" || fact.status === "edited") return true;
  const def = WRITEBACKS[fact.key];
  return def ? def.isTrusted(fact) : isDirectlyTrusted(fact) || isTrustedJev(fact);
}

export async function applyResolvableFacts(engagementId: string): Promise<string[]> {
  const facts = await getClientFacts(engagementId);
  const factList = Array.isArray(facts) ? facts : Object.values(facts);
  const applied: string[] = [];

  for (const fact of factList) {
    const def = WRITEBACKS[fact.key];
    if (!def || !isFactTrusted(fact)) continue;
    try {
      await def.apply(engagementId, fact.value);
      applied.push(fact.key);
    } catch (err) {
      console.error(`[field-writeback] failed to apply ${fact.key} for ${engagementId}:`, err);
    }
  }
  return applied;
}