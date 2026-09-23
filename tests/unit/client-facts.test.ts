import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: { select: vi.fn(), update: vi.fn(), insert: vi.fn() } }));

import { db } from "@/lib/db";
import { upsertClientFact, recordDossierDecisions, sameFactValue } from "@/lib/client-facts";
import { fakeDb } from "../helpers/fake-db";

function row(key: string, value: unknown, status: string, source = "website") {
  return { id: `id-${key}`, engagementId: "e1", key, value, status, source, sourceDetail: null, confidence: null, evidence: null, updatedAt: new Date() };
}

describe("upsertClientFact keeps human decisions", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["confirmed", "edited"])("never overwrites a %s fact from a machine source", async (status) => {
    const fake = fakeDb([row("offerName", "Human answer", status)]);
    Object.assign(db, fake);
    await upsertClientFact("e1", "offerName", "Crawler guess", { source: "llm" });
    expect(fake.set).not.toHaveBeenCalled();
    expect(fake.insert).not.toHaveBeenCalled();
  });

  it("doesn't re-suggest the exact value a human rejected", async () => {
    const fake = fakeDb([row("bookingPlatform", "calendly", "rejected")]);
    Object.assign(db, fake);
    await upsertClientFact("e1", "bookingPlatform", "calendly", { source: "website" });
    expect(fake.set).not.toHaveBeenCalled();
  });

  it("does suggest a different value after a rejection", async () => {
    const fake = fakeDb([row("bookingPlatform", "calendly", "rejected")]);
    Object.assign(db, fake);
    await upsertClientFact("e1", "bookingPlatform", "cal_com", { source: "account" });
    expect(fake.set).toHaveBeenCalledWith(expect.objectContaining({ value: "cal_com", status: "suggested" }));
  });

  it("lets a human edit overwrite anything", async () => {
    const fake = fakeDb([row("offerName", "Old", "confirmed")]);
    Object.assign(db, fake);
    await upsertClientFact("e1", "offerName", "New", { source: "user", status: "edited", allowOverwriteConfirmed: true });
    expect(fake.set).toHaveBeenCalledWith(expect.objectContaining({ value: "New", status: "edited" }));
  });
});

describe("recordDossierDecisions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("confirms a kept suggestion, edits a changed one, and leaves empty fields as suggestions", async () => {
    const fake = fakeDb([
      row("offerName", "Growth Program", "suggested", "jev"),
      row("offerPrice", "$2,000", "suggested", "llm"),
      row("offerIcp", "Founders", "suggested", "llm"),
      row("offerVertical", "coaching_consulting", "confirmed", "jev"),
    ]);
    Object.assign(db, fake);

    await recordDossierDecisions("e1", { offerName: "Growth Program", offerPrice: "$2,500", offerIcp: "", offerVertical: "ecommerce" });

    const sets = fake.set.mock.calls.map((c: any[]) => c[0]);
    // offerName kept -> confirmed
    expect(sets).toContainEqual(expect.objectContaining({ status: "confirmed" }));
    // offerPrice changed -> edited with the saved value
    expect(sets).toContainEqual(expect.objectContaining({ value: "$2,500", status: "edited", source: "user" }));
    // offerIcp left empty, offerVertical already human-owned: nothing written for them
    expect(sets).toHaveLength(2);
  });
});

describe("sameFactValue", () => {
  it("ignores object key order and surrounding whitespace", () => {
    expect(sameFactValue({ a: 1, b: " x " }, { b: "x", a: 1 })).toBe(true);
    expect(sameFactValue(["a", "b"], ["b", "a"])).toBe(false);
  });
});
