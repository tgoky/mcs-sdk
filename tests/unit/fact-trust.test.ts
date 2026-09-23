import { describe, it, expect, vi } from "vitest";

// The trust rule is pure; its module only imports the writeback that uses the DB.
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/features/cold-open/server/config", () => ({ upsertColdOpenConfig: vi.fn(), getColdOpenConfig: vi.fn() }));
import { confidenceTier, factTier, LIKELY_CONFIDENCE_FLOOR } from "@/lib/fact-trust";
import type { ClientFact } from "@/lib/client-facts";

function fact(extra: Partial<ClientFact>): ClientFact {
  return { key: "offerName", value: "Growth Plan", source: "website", sourceDetail: null, status: "suggested", confidence: null, evidence: null, updatedAt: new Date(), ...extra };
}

describe("factTier", () => {
  it("asks when nothing usable is on file", () => {
    expect(factTier(null)).toBe("ask");
    expect(factTier(fact({ status: "rejected" }))).toBe("ask");
    expect(factTier(fact({ value: "  " }))).toBe("ask");
    expect(factTier(fact({ value: [] }))).toBe("ask");
  });

  it("treats a person's answer and scraped or account data as done", () => {
    expect(factTier(fact({ source: "llm", status: "confirmed" }))).toBe("done");
    expect(factTier(fact({ source: "llm", status: "edited" }))).toBe("done");
    expect(factTier(fact({ source: "website" }))).toBe("done");
    expect(factTier(fact({ source: "account" }))).toBe("done");
  });

  it("splits Jev scores into done, we-think and ask at the same thresholds as writeback", () => {
    expect(factTier(fact({ source: "jev", confidence: 90 }))).toBe("done");
    expect(factTier(fact({ source: "jev", confidence: 75 }))).toBe("done");
    expect(factTier(fact({ source: "jev", confidence: 60 }))).toBe("likely");
    expect(factTier(fact({ source: "jev", confidence: LIKELY_CONFIDENCE_FLOOR }))).toBe("likely");
    expect(factTier(fact({ source: "jev", confidence: 20 }))).toBe("ask");
    expect(factTier(fact({ source: "jev", confidence: null }))).toBe("ask");
  });

  it("shows an unscored Claude reading as 'we think', never as settled", () => {
    expect(factTier(fact({ source: "llm" }))).toBe("likely");
  });
});

describe("confidenceTier", () => {
  it("uses the same bands for scores that aren't stored facts", () => {
    expect(confidenceTier(80)).toBe("done");
    expect(confidenceTier(50)).toBe("likely");
    expect(confidenceTier(10)).toBe("ask");
    expect(confidenceTier(null)).toBe("ask");
  });
});
