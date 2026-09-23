import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/client-profile", () => ({ getPrimaryDomainForEngagement: vi.fn() }));
vi.mock("@/lib/client-facts", () => ({ getClientFact: vi.fn(), upsertClientFact: vi.fn() }));
vi.mock("@/features/pin-down/server/discovery-prefill", () => ({ runDiscoveryPrefill: vi.fn() }));
vi.mock("@/lib/field-resolvers", () => ({
  resolveWebsiteDerivedChoices: vi.fn(),
  verifyReputationExtractions: vi.fn(),
  verifyWebsiteReadings: vi.fn(),
  resolveColdOpenDerivedFields: vi.fn(),
}));

import { getPrimaryDomainForEngagement } from "@/lib/client-profile";
import { getClientFact, upsertClientFact } from "@/lib/client-facts";
import { runDiscoveryPrefill } from "@/features/pin-down/server/discovery-prefill";
import {
  resolveWebsiteDerivedChoices,
  verifyReputationExtractions,
  verifyWebsiteReadings,
  resolveColdOpenDerivedFields,
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
