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
// Additive deep harvesters:
//   1. Auto-harvested social & review handles (JSON-LD schema & footer links)
//   2. Public review baselines (Trustpilot star ratings & review counts)
//   3. Upfront same-name domain collision pre-checks across common TLDs

import { getPrimaryDomainForEngagement } from "@/lib/client-profile";
import { getClientFact, upsertClientFact } from "@/lib/client-facts";
import { runDiscoveryPrefill } from "@/features/pin-down/server/discovery-prefill";
import { resolveWebsiteDerivedChoices, verifyReputationExtractions } from "@/lib/field-resolvers";

export interface DiscoverClientResult {
  ran: boolean;
  domain?: string;
  factsWritten: string[];
  notes: string[];
}

/**
 * Upfront Same-Name Collision Harvester
 * Checks if another business with the exact same name exists on a different TLD / registry.
 */
async function checkUpfrontCollisions(operatorName: string, siteDomain: string) {
  const collisions: Array<{ name: string; domain?: string; source: "collision_check" }> = [];
  const nameSlug = operatorName.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!nameSlug) return collisions;

  const commonTLDs = [".org", ".co", ".net", ".io"];
  const currentTLD = siteDomain.slice(siteDomain.lastIndexOf("."));

  for (const tld of commonTLDs) {
    if (tld === currentTLD) continue;
    const testDomain = `${nameSlug}${tld}`;
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 1500);
      const res = await fetch(`https://${testDomain}`, { method: "HEAD", signal: controller.signal });
      clearTimeout(t);
      if (res.ok) {
        collisions.push({
          name: `${operatorName} (${tld.toUpperCase()} Variant)`,
          domain: testDomain,
          source: "collision_check",
        });
      }
    } catch {
      // Unreachable domain = no collision
    }
  }
  return collisions;
}

/**
 * Crawls whatever domain is already on file for this client (via
 * client-profile.ts's existing resolver — engagements.primaryDomain,
 * falling back to stack.buyer_domain / a rep identity graph domain) and
 * writes the results into the shared fact store as "suggested" facts.
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

  // Human-touched facts are never re-suggested by a re-crawl. A "rejected"
  // or "edited" row rewritten here would flow back through verification
  // and could auto-apply again — silently undoing the operator's decision.
  async function writeSuggestion(key: string, value: unknown, evidence?: string) {
    if (value === undefined || value === null || value === "") return;
    if (Array.isArray(value) && value.length === 0) return;

    const existing = await getClientFact(engagementId, key);
    if (existing && (existing.status === "rejected" || existing.status === "edited")) return;

    await write(key, value, evidence);
  }

  // Core website crawl facts
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

  // Reputation Manager extractions from the prefill pass
  if (prefill.suggestedCompetitors?.length) {
    await writeSuggestion("competitors", prefill.suggestedCompetitors, "Extracted from the crawled copy by the prefill pass.");
  }
  if (prefill.suggestedEntities?.length) {
    await writeSuggestion("entities", prefill.suggestedEntities, "Extracted from the crawled copy by the prefill pass.");
  }
  if (prefill.suggestedSeedPrompts?.length) {
    await writeSuggestion("seedPanelPrompts", prefill.suggestedSeedPrompts, "Generated from the crawled copy by the prefill pass.");
  }

  // Deep Harvester Extractions: Social handles & review baseline
  if (prefill.suggestedHandles && Object.keys(prefill.suggestedHandles).length > 0) {
    await writeSuggestion("operatorHandles", prefill.suggestedHandles, "Extracted from homepage footer and JSON-LD schema.");
  }
  if (prefill.suggestedReviewBaseline) {
    await writeSuggestion("reviewBaseline", prefill.suggestedReviewBaseline, "Harvested from public review platform.");
  }

  // Upfront Same-Name Domain Collision Harvester
  if (prefill.suggestedBuyerName) {
    try {
      const collisions = await checkUpfrontCollisions(prefill.suggestedBuyerName, siteDomain);
      if (collisions.length > 0) {
        await writeSuggestion("collisions", collisions, "Upfront same-name collision harvester.");
      }
    } catch (err) {
      console.warn(`[discover-client] upfront collision check failed for ${engagementId}:`, err);
    }
  }

  // Chains straight into the Jev resolvers — rawVoiceCorpus and candidate lists
  // were just written above.
  if (factsWritten.includes("rawVoiceCorpus")) {
    try {
      await resolveWebsiteDerivedChoices(engagementId);
      await verifyReputationExtractions(engagementId);
    } catch (err) {
      console.warn(`[discover-client] website-derived Jev resolution skipped for ${engagementId}:`, err instanceof Error ? err.message : err);
    }
  }

  return { ran: true, domain, factsWritten, notes: prefill.notes };
}