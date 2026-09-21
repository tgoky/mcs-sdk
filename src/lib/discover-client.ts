// src/lib/discover-client.ts
//
// Phase 0, piece 2: the website-crawl half of the shared fact store,
// pulled out of Pin-Down's onboarding so it runs at the CLIENT level
// instead of being one product's private setup step. Reuses the exact
// crawl pipeline Pin-Down's discovery-prefill.ts already runs (Firecrawl
// via voice-scraper.ts, design-scraper.ts, the booking-platform/
// confirmation-page detection in discovery-prefill.ts itself) — nothing
// about how the crawl works changes here, only where its output lands.
//
// This does NOT replace runDiscoveryPrefill's own caller inside Pin-Down's
// wizard yet (that's a later, separate slice per the rollout order — Pin-
// Down keeps working exactly as it does today). This is additive: a second
// caller of the same crawl, for clients whose FIRST product is something
// other than Pin-Down.
//
// Fact keys below deliberately reuse worker-registry.ts's own
// WorkerConfigField.key strings (see client-facts.ts's header) so a
// per-field resolver can look these up directly once Phase 1 exists.

import { getPrimaryDomainForEngagement } from "@/lib/client-profile";
import { upsertClientFact } from "@/lib/client-facts";
import { runDiscoveryPrefill } from "@/features/pin-down/server/discovery-prefill";
import { resolveWebsiteDerivedChoices } from "@/lib/field-resolvers";

export interface DiscoverClientResult {
  ran: boolean;
  domain?: string;
  factsWritten: string[];
  notes: string[];
}

/**
 * Crawls whatever domain is already on file for this client (via
 * client-profile.ts's existing resolver — engagements.primaryDomain,
 * falling back to stack.buyer_domain / a rep identity graph domain) and
 * writes the results into the shared fact store as "suggested" facts.
 *
 * Does nothing, cheaply, if no domain is on file yet — this is meant to be
 * called opportunistically (client creation with an optional URL, or the
 * first web-dependent product's onboarding asking for a domain), not on a
 * schedule, so a no-op return here is a normal, expected outcome, not an
 * error.
 */
export async function discoverClient(engagementId: string): Promise<DiscoverClientResult> {
  const domain = await getPrimaryDomainForEngagement(engagementId);
  if (!domain) {
    return { ran: false, factsWritten: [], notes: ["No domain on file for this client yet — nothing to crawl."] };
  }

  const siteDomain: string = domain;
  const prefill = await runDiscoveryPrefill(siteDomain);
  const factsWritten: string[] = [];

  async function write(key: string, value: unknown, evidence?: string) {
    if (value === undefined || value === null || value === "") return;
    await upsertClientFact(engagementId, key, value, { source: "website", sourceDetail: siteDomain, evidence });
    factsWritten.push(key);
  }

  // operatorName is rep-onboarding's own field (derived from engagements.
  // buyer today via client-profile.ts's buyerName resolver) — a crawled
  // name is a second, independent signal for the SAME field, not a
  // conflicting one. Which one a resolver prefers is Phase 1's job, not
  // this function's; both are legitimate suggestions to have on file.
  await write("operatorName", prefill.suggestedBuyerName, "Crawled from the homepage's own branding/title.");
  await write("offerName", prefill.suggestedOfferName, "Crawled from the homepage/offer page.");
  await write("offerIcp", prefill.suggestedIcp, "Inferred from the site's own marketing copy.");
  await write("bookingPlatform", prefill.detectedBookingPlatform, "Detected from a booking-platform script/iframe signature on the homepage.");
  await write("hostingPlatform", prefill.detectedHostingPlatform, "Detected from a hosting-platform fingerprint (generator meta tag / asset path) on the homepage.");
  await write("rawVoiceCorpus", prefill.scrapedCorpus);
  await write("existingConfirmationPageUrl", prefill.existingConfirmationPageUrl);
  if (prefill.designSignal) {
    await write("designSignal", prefill.designSignal);
  }

  // Chains straight into the Jev resolvers that exist so far — the
  // evidence they need (rawVoiceCorpus) was just written above, and every
  // caller of discoverClient gets this for free instead of needing to
  // know a second function exists. Never allowed to fail the crawl
  // itself: no TYPESAFE_API_KEY/OPENROUTER_API_KEY configured is the
  // expected, common state today (Jev's contract is confirmed against
  // real docs now, but no environment in this project has a live key
  // yet), not a bug to surface as an error.
  if (factsWritten.includes("rawVoiceCorpus")) {
    try {
      await resolveWebsiteDerivedChoices(engagementId);
    } catch (err) {
      console.warn(`[discover-client] website-derived Jev resolution skipped for ${engagementId}:`, err instanceof Error ? err.message : err);
    }
  }

  return { ran: true, domain, factsWritten, notes: prefill.notes };
}
