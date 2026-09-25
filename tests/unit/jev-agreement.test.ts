import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { bucketFor, summarizeVerdicts } from "@/lib/jev-agreement";

describe("the Jev agreement report", () => {
  it("bands confidence the way the trust tiers do", () => {
    expect(bucketFor(null)).toBe("unscored");
    expect(bucketFor(44)).toBe("0-44");
    expect(bucketFor(45)).toBe("45-74");
    expect(bucketFor(75)).toBe("75-89");
    expect(bucketFor(100)).toBe("90-100");
  });

  it("counts what people did with each suggestion, by key and band", () => {
    const rows = summarizeVerdicts([
      { key: "offerPrice", confidence: 80, verdict: "confirmed", n: 3 },
      { key: "offerPrice", confidence: 88, verdict: "edited", n: 1 },
      { key: "offerPrice", confidence: 30, verdict: "rejected", n: 2 },
      { key: "competitors", confidence: null, verdict: "confirmed", n: 1 },
      { key: "offerPrice", confidence: 80, verdict: "something-else", n: 9 },
    ]);
    expect(rows).toEqual([
      { key: "competitors", bucket: "unscored", confirmed: 1, edited: 0, rejected: 0, total: 1, agreement: 1 },
      { key: "offerPrice", bucket: "0-44", confirmed: 0, edited: 0, rejected: 2, total: 2, agreement: 0 },
      { key: "offerPrice", bucket: "75-89", confirmed: 3, edited: 1, rejected: 0, total: 4, agreement: 0.75 },
    ]);
  });
});
