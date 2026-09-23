import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/client-profile", () => ({ getPrimaryDomainForEngagement: vi.fn() }));
vi.mock("@/lib/client-facts", () => ({ getClientFact: vi.fn(), upsertClientFact: vi.fn() }));
vi.mock("@/features/pin-down/server/discovery-prefill", () => ({ runDiscoveryPrefill: vi.fn() }));
vi.mock("@/lib/field-resolvers", () => ({
  resolveWebsiteDerivedChoices: vi.fn(),
  verifyReputationExtractions: vi.fn(),
  verifyWebsiteReadings: vi.fn(),
  resolveColdOpenDerivedFields: vi.fn(),
  resolveDeepSiteReadings: vi.fn(),
}));

import { getPrimaryDomainForEngagement } from "@/lib/client-profile";
import { getClientFact, upsertClientFact } from "@/lib/client-facts";
import { runDiscoveryPrefill } from "@/features/pin-down/server/discovery-prefill";
import {
  resolveWebsiteDerivedChoices,
  verifyReputationExtractions,
  verifyWebsiteReadings,
  resolveColdOpenDerivedFields,
  resolveDeepSiteReadings,
} from "@/lib/field-resolvers";
import { discoverClient, discoverClientIfNotYetCrawled } from "@/lib/discover-client";

function sourceOf(key: string) {
  return vi.mocked(upsertClientFact).mock.calls.find((c) => c[1] === key)?.[3]?.source;
}

describe("discoverClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The same-name collision check makes real HEAD requests; no network in tests.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no network in tests")));
    vi.mocked(getPrimaryDomainForEngagement).mockResolvedValue("acme.com");
    vi.mocked(getClientFact).mockResolvedValue(null);
    vi.mocked(runDiscoveryPrefill).mockResolvedValue({
      suggestedBuyerName: "Acme",
      suggestedOfferName: "Growth Program",
      suggestedIcp: "Founders",
      suggestedOfferPrice: "$2,000",
      suggestedOfferVertical: "coaching",
      suggestedHeroVideoUrl: "https://fast.wistia.net/embed/iframe/abc",
      detectedBookingPlatform: "calendly",
      scrapedCorpus: "Acme copy",
      notes: [],
    } as any);
  });

  it("saves model readings as unscored 'llm' facts and scraped values as 'website'", async () => {
    await discoverClient("e1");

    for (const key of ["operatorName", "offerName", "offerIcp", "offerPrice", "offerVertical"]) {
      expect(sourceOf(key)).toBe("llm");
    }
    expect(sourceOf("bookingPlatform")).toBe("website");
    expect(sourceOf("rawVoiceCorpus")).toBe("website");
    expect(sourceOf("heroVideoUrl")).toBe("website");
  });

  it("doesn't overwrite a reading a human already confirmed", async () => {
    vi.mocked(getClientFact).mockImplementation(async (_id: string, key: string) =>
      key === "offerName" ? ({ key, status: "confirmed" } as any) : null
    );
    await discoverClient("e1");
    expect(sourceOf("offerName")).toBeUndefined();
  });

  it("runs every resolver, including Cold Open's, even when an earlier one fails", async () => {
    vi.mocked(resolveWebsiteDerivedChoices).mockRejectedValue(new Error("Jev down"));
    await discoverClient("e1");

    expect(verifyReputationExtractions).toHaveBeenCalledWith("e1");
    expect(verifyWebsiteReadings).toHaveBeenCalledWith("e1");
    expect(resolveColdOpenDerivedFields).toHaveBeenCalledWith("e1");
    expect(resolveDeepSiteReadings).toHaveBeenCalledWith("e1");
  });

  it("saves the deep reading: checked proof as read from the site, inferences as readings for Jev", async () => {
    vi.mocked(runDiscoveryPrefill).mockResolvedValue({
      scrapedCorpus: "site copy",
      crawledAt: "2026-09-23T00:00:00.000Z",
      notes: [],
      deep: {
        testimonials: [{ quote: "They doubled our close rate", name: "Sam", role: "Founder" }],
        faqs: [{ question: "Is this for me?" }],
        objections: ["Is it worth it?"],
        offers: [{ name: "Scale Sprint", price: "$2,500" }],
        team: [],
        caseStudyResults: [],
        pressMentions: [],
        socialProfiles: { instagram: "https://instagram.com/acme" },
        bookingLinks: [],
        techStack: { emailCrm: ["hubspot"], adPixels: [], analytics: [], attribution: [], videoPlayers: [], chat: [], checkout: [] },
        contact: { emails: [], phones: [] },
        jsonLd: { offers: [] },
        pagesRead: [{ kind: "marketing_site", url: "https://acme.com", wordCount: 900 }],
      },
    } as any);
    await discoverClient("e1");

    expect(sourceOf("siteTestimonials")).toBe("website");
    expect(sourceOf("siteFaqs")).toBe("website");
    expect(sourceOf("siteObjections")).toBe("llm");
    expect(sourceOf("offerTiers")).toBe("llm");
    expect(sourceOf("socialProfiles")).toBe("website");
    expect(sourceOf("siteEmailPlatformHint")).toBe("website");
    expect(sourceOf("siteCrawl")).toBe("website");
    // Empty lists aren't saved as if something was found.
    expect(sourceOf("teamMembers")).toBeUndefined();
  });
});

describe("discoverClientIfNotYetCrawled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runDiscoveryPrefill).mockResolvedValue({ notes: [] } as any);
  });

  it("crawls when a domain is on file and the site hasn't been crawled", async () => {
    vi.mocked(getPrimaryDomainForEngagement).mockResolvedValue("acme.com");
    vi.mocked(getClientFact).mockResolvedValue(null);
    await discoverClientIfNotYetCrawled("e1");
    expect(runDiscoveryPrefill).toHaveBeenCalledWith("acme.com");
  });

  it("does nothing without a domain", async () => {
    vi.mocked(getPrimaryDomainForEngagement).mockResolvedValue(null);
    expect(await discoverClientIfNotYetCrawled("e1")).toBeNull();
    expect(runDiscoveryPrefill).not.toHaveBeenCalled();
  });

  it("does not re-crawl a site that already has a voice corpus", async () => {
    vi.mocked(getPrimaryDomainForEngagement).mockResolvedValue("acme.com");
    vi.mocked(getClientFact).mockImplementation(async (_id: string, key: string) =>
      key === "rawVoiceCorpus" ? ({ key, value: "copy" } as any) : null
    );
    expect(await discoverClientIfNotYetCrawled("e1")).toBeNull();
    expect(runDiscoveryPrefill).not.toHaveBeenCalled();
  });
});
