// src/lib/client-profile.ts
//
// Phase 4 of the client-workspace/worker restructure: facts that
// genuinely belong to the client, not to one product's onboarding flow —
// so enabling a second worker doesn't re-ask for something already known.
// Deliberately starts with exactly one field. "Name" looked like an
// obvious second candidate, but engagements.buyer and repIdentityGraphs.
// operatorName are allowed to diverge on purpose today (a legal entity
// name vs. a public-facing operator name can legitimately differ) — that
// wasn't verified as a bug, so it isn't touched here. Add a field to this
// module only once its overlap is verified the same way domain was: two
// products' real schemas actually representing the same underlying fact,
// not two fields that merely sound similar.

import { db } from "@/lib/db";
import { engagements, repIdentityGraphs, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import type { ClientProfileFact } from "@/lib/worker-registry";

/**
 * Resolves the one domain a client's setup should treat as "already
 * known" — checked in order: the shared engagements.primaryDomain column
 * (the authoritative value once anything has written it), then
 * Showtime's stack.buyer_domain, then the first entry of Reputation
 * Manager's operatorDomains. Older engagements that predate
 * primaryDomain but already have one of the other two still resolve
 * correctly here without needing the backfill script run first — the
 * backfill just makes the shared column authoritative going forward
 * instead of this function re-deriving it on every read.
 */
export async function getPrimaryDomainForEngagement(engagementId: string): Promise<string | null> {
  const [engagement] = await db
    .select({ primaryDomain: engagements.primaryDomain, stack: engagements.stack })
    .from(engagements)
    .where(eq(engagements.engagementId, engagementId))
    .limit(1);

  if (!engagement) return null;
  if (engagement.primaryDomain) return engagement.primaryDomain;

  const stack = engagement.stack as Partial<EngagementStack> | null;
  if (stack?.buyer_domain) return stack.buyer_domain;

  const [repGraph] = await db
    .select({ operatorDomains: repIdentityGraphs.operatorDomains })
    .from(repIdentityGraphs)
    .where(eq(repIdentityGraphs.engagementId, engagementId))
    .limit(1);

  return repGraph?.operatorDomains?.[0] ?? null;
}

/** engagements.buyer is already the one always-populated, canonical name
 * every engagement has from creation — this is a thin wrapper, not new
 * storage, kept here so callers reach every client-profile fact through
 * one uniform module regardless of whether the underlying value lives in
 * its own column, needs a fallback chain (see getPrimaryDomainForEngagement),
 * or is computed some other way in the future. */
export async function getBuyerNameForEngagement(engagementId: string): Promise<string | null> {
  const [engagement] = await db
    .select({ buyer: engagements.buyer })
    .from(engagements)
    .where(eq(engagements.engagementId, engagementId))
    .limit(1);
  return engagement?.buyer ?? null;
}

/**
 * The single entry point Phase 5's enablement flow (chat or form) calls
 * for any worker config field tagged `derivableFrom` in worker-registry.ts
 * — one switch here instead of every caller needing to know which
 * function backs which fact name. Adding a new ClientProfileFact means
 * adding one case here and the getter it calls; nothing else in this
 * module's callers needs to change.
 */
export async function resolveClientProfileFact(engagementId: string, fact: ClientProfileFact): Promise<string | null> {
  switch (fact) {
    case "primaryDomain":
      return getPrimaryDomainForEngagement(engagementId);
    case "buyerName":
      return getBuyerNameForEngagement(engagementId);
  }
}

/** Sets the shared primaryDomain column — call this whenever any
 * product's onboarding collects a domain, so the next worker enabled on
 * this client sees it as already known instead of re-deriving it from a
 * product-specific field each time. Never overwrites a non-empty value
 * with an empty one — a worker that doesn't collect a domain at all
 * shouldn't be able to blank out one a different worker already set. */
export async function setPrimaryDomainForEngagement(engagementId: string, domain: string): Promise<void> {
  const trimmed = domain.trim();
  if (!trimmed) return;

  await db
    .update(engagements)
    .set({ primaryDomain: trimmed, updatedAt: new Date() })
    .where(eq(engagements.engagementId, engagementId));
}
