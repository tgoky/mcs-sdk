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
import {
  resolveColdOpenDerivedFields,
  resolveWebsiteDerivedChoices,
  verifyReputationExtractions,
  verifyWebsiteReadings,
} from "@/lib/field-resolvers";

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
  const collisions: Array<{
    name: string;
    whoTheyAre: string;
    disambiguationNote: string;
    source: "collision_check";
    domain?: string;
  }> = [];

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
          name: `${operatorName} (${tld.toUpperCase().replace(".", "")} Variant)`,
          whoTheyAre: `Active web host found at ${testDomain}`,
          disambiguationNote: `Confirm if ${testDomain} belongs to ${operatorName} or an unrelated entity.`,
          source: "collision_check",
          domain: testDomain,
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
    return { ran: false, factsWritten: [], notes: ["No domain on file for this client yet. Nothing to crawl."] };
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

  // Claude's readings of the copy. Written as "llm" (never auto-applied)
  // until verifyWebsiteReadings below scores them against the same copy.
  // Human-touched facts are skipped, same as writeSuggestion.
  async function writeReading(key: string, value: unknown, evidence: string) {
    if (value === undefined || value === null || value === "") return;
    const existing = await getClientFact(engagementId, key);
    if (existing && existing.status !== "suggested") return;
    await upsertClientFact(engagementId, key, value, { source: "llm", sourceDetail: siteDomain, evidence });
    factsWritten.push(key);
  }

  await writeReading("operatorName", prefill.suggestedBuyerName, "Read from the homepage's branding/title by Claude.");
  await writeReading("offerName", prefill.suggestedOfferName, "Read from the homepage/offer page by Claude.");
  await writeReading("offerIcp", prefill.suggestedIcp, "Inferred from the site's marketing copy by Claude.");
  await writeReading("offerPrice", prefill.suggestedOfferPrice, "Read from the site's pricing copy by Claude.");
  await writeReading("offerVertical", prefill.suggestedOfferVertical, "Inferred from the site's marketing copy by Claude.");

  // Scraped directly from the page (signatures, embeds, raw text).
  await write("bookingPlatform", prefill.detectedBookingPlatform, "Detected from a booking-platform script/iframe signature on the homepage.");
  await write("hostingPlatform", prefill.detectedHostingPlatform, "Detected from a hosting-platform fingerprint (generator meta tag / asset path) on the homepage.");
  await write("rawVoiceCorpus", prefill.scrapedCorpus);
  await write("existingConfirmationPageUrl", prefill.existingConfirmationPageUrl);
  await write("heroVideoUrl", prefill.suggestedHeroVideoUrl, "Video embed found on the homepage.");
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
  // Each resolver runs on its own: one failing (a Jev or Claude error) must
  // not stop the others — previously a Showtime resolver error silently
  // skipped Reputation Manager's verification too.
  if (factsWritten.includes("rawVoiceCorpus")) {
    const resolvers: Array<[string, (id: string) => Promise<unknown>]> = [
      ["website choices", resolveWebsiteDerivedChoices],
      ["reputation extractions", verifyReputationExtractions],
      ["website readings", verifyWebsiteReadings],
      ["cold open fields", resolveColdOpenDerivedFields],
    ];
    for (const [label, resolve] of resolvers) {
      try {
        await resolve(engagementId);
      } catch (err) {
        console.warn(`[discover-client] ${label} resolution skipped for ${engagementId}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  return { ran: true, domain, factsWritten, notes: prefill.notes };
}
/**
 * Runs the website crawl after a connected account has been harvested, but
 * only when it can do something and hasn't already been done: a domain is
 * on file now (a harvest may have just seeded it from Klaviyo/GHL) and no
 * voice corpus exists yet. Without the second check every reconnect of any
 * account would re-crawl the site and repeat the Claude and Jev calls.
 */
export async function discoverClientIfNotYetCrawled(engagementId: string): Promise<DiscoverClientResult | null> {
  const domain = await getPrimaryDomainForEngagement(engagementId);
  if (!domain) return null;
  const corpus = await getClientFact(engagementId, "rawVoiceCorpus");
  if (corpus) return null;
  return discoverClient(engagementId);
}
