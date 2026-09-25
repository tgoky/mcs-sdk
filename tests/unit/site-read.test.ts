import { describe, it, expect } from "vitest";
import { isSiteReadReusable, wantsFreshRead, SITE_READ_FRESH_DAYS } from "@/lib/site-read";
import type { ClientFact } from "@/lib/client-facts";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 8, 25);
const corpus = (daysOld: number, value: unknown = "Some site copy"): ClientFact =>
  ({ key: "rawVoiceCorpus", value, status: "suggested", source: "website", sourceDetail: "acme.com", confidence: null, evidence: null, updatedAt: new Date(now - daysOld * DAY) }) as unknown as ClientFact;

describe("isSiteReadReusable", () => {
  it("reuses a recent read of the same site", () => {
    expect(isSiteReadReusable({ corpus: corpus(2), sameHost: true, now })).toBe(true);
  });

  it("reads again when asked, even if the stored read is fresh", () => {
    expect(isSiteReadReusable({ corpus: corpus(0), sameHost: true, force: true, now })).toBe(false);
  });

  it(`reads again once the stored read is ${SITE_READ_FRESH_DAYS} days old`, () => {
    expect(isSiteReadReusable({ corpus: corpus(SITE_READ_FRESH_DAYS - 1), sameHost: true, now })).toBe(true);
    expect(isSiteReadReusable({ corpus: corpus(SITE_READ_FRESH_DAYS), sameHost: true, now })).toBe(false);
  });

  it("never reuses a different site, an empty read, or no read", () => {
    expect(isSiteReadReusable({ corpus: corpus(1), sameHost: false, now })).toBe(false);
    expect(isSiteReadReusable({ corpus: corpus(1, "   "), sameHost: true, now })).toBe(false);
    expect(isSiteReadReusable({ corpus: null, sameHost: true, now })).toBe(false);
  });
});

describe("wantsFreshRead", () => {
  it("is only true for an explicit force: true", () => {
    expect(wantsFreshRead({ force: true })).toBe(true);
    expect(wantsFreshRead({ force: "true" })).toBe(false);
    expect(wantsFreshRead({})).toBe(false);
    expect(wantsFreshRead(null)).toBe(false);
  });
});
