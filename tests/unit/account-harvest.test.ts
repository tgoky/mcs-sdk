import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/http", () => ({ fetchWithTimeout: vi.fn() }));
vi.mock("@/lib/client-facts", () => ({ upsertClientFact: vi.fn() }));
vi.mock("@/lib/client-profile", () => ({ seedPrimaryDomainFromUrl: vi.fn() }));
vi.mock("@/lib/discover-client", () => ({ discoverClientIfNotYetCrawled: vi.fn().mockResolvedValue(null) }));

import { fetchWithTimeout } from "@/lib/http";
import { upsertClientFact } from "@/lib/client-facts";
import { discoverClientIfNotYetCrawled } from "@/lib/discover-client";
import { harvestAccountMetadata, harvestGHLLocation, isHarvestableProvider } from "@/lib/account-harvest";

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as any;
}

async function flushDynamicImports() {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

describe("isHarvestableProvider", () => {
  it("covers the Composio OAuth providers only", () => {
    for (const p of ["calendly", "hubspot", "klaviyo", "mailchimp", "slack"]) expect(isHarvestableProvider(p)).toBe(true);
    // Paste-a-key and Whop providers are harvested elsewhere; these were dead duplicates.
    for (const p of ["instantly", "smartlead", "lemlist", "reply_io", "whop"]) expect(isHarvestableProvider(p)).toBe(false);
  });
});

describe("harvestGHLLocation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves social handles as a platform -> handle map, not a list", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(
      jsonResponse({
        location: {
          timezone: "America/New_York",
          website: "https://acme.com",
          social: { facebookUrl: "https://facebook.com/acme", linkedIn: "https://linkedin.com/company/acme", googlePlacesId: "xyz", youtube: "" },
        },
      })
    );

    await harvestGHLLocation("e1", "key", "loc1");

    const handles = vi.mocked(upsertClientFact).mock.calls.find((c) => c[1] === "operatorHandles")?.[2];
    expect(handles).toEqual({ facebook: "https://facebook.com/acme", linkedin: "https://linkedin.com/company/acme" });
  });

  it("starts the website crawl after seeding the domain", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(jsonResponse({ location: { website: "https://acme.com", social: {} } }));
    await harvestGHLLocation("e1", "key", "loc1");
    await flushDynamicImports();
    expect(discoverClientIfNotYetCrawled).toHaveBeenCalledWith("e1");
  });
});

describe("harvestAccountMetadata", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hands off to the crawl-if-not-yet-crawled check after a harvest", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(jsonResponse({ account_timezone: "UTC", account_name: "Acme" }));
    await harvestAccountMetadata("e1", "mailchimp", "key-us1");
    await flushDynamicImports();
    expect(discoverClientIfNotYetCrawled).toHaveBeenCalledWith("e1");
  });

  it("does nothing for providers it doesn't harvest", async () => {
    const result = await harvestAccountMetadata("e1", "instantly", "key");
    expect(result).toEqual({ factsWritten: [] });
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });
});
