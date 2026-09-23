import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: { select: vi.fn(), update: vi.fn() } }));
vi.mock("@/lib/client-facts", () => ({ getClientFacts: vi.fn() }));
vi.mock("@/features/cold-open/server/config", () => ({ upsertColdOpenConfig: vi.fn(), getColdOpenConfig: vi.fn() }));

import { db } from "@/lib/db";
import { getClientFacts } from "@/lib/client-facts";
import { applyResolvableFacts } from "@/lib/field-writeback";
import { fakeDb } from "../helpers/fake-db";

function fact(key: string, value: unknown, source: string, extra: Record<string, unknown> = {}) {
  return { key, value, source, status: "suggested", confidence: null, sourceDetail: null, evidence: null, ...extra };
}

describe("applyResolvableFacts trust rules", () => {
  let fake: ReturnType<typeof fakeDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Every lookup finds an empty engagement / identity graph row.
    fake = fakeDb([{ stack: {}, offerDetails: null, operatorHandles: {} }]);
    Object.assign(db, fake);
  });

  it("never applies an unscored model reading of the website", async () => {
    vi.mocked(getClientFacts).mockResolvedValue({ offerName: fact("offerName", "Growth Program", "llm") } as any);
    const applied = await applyResolvableFacts("e1");
    expect(applied).toEqual([]);
    expect(fake.set).not.toHaveBeenCalled();
  });

  it("applies the same reading once Jev scores it at or above the threshold", async () => {
    vi.mocked(getClientFacts).mockResolvedValue({ offerName: fact("offerName", "Growth Program", "jev", { confidence: 80 }) } as any);
    expect(await applyResolvableFacts("e1")).toEqual(["offerName"]);
  });

  it("keeps a low Jev score as a suggestion", async () => {
    vi.mocked(getClientFacts).mockResolvedValue({ offerName: fact("offerName", "Growth Program", "jev", { confidence: 40 }) } as any);
    expect(await applyResolvableFacts("e1")).toEqual([]);
  });

  it("refuses to store handles given as a list", async () => {
    vi.mocked(getClientFacts).mockResolvedValue({
      operatorHandles: fact("operatorHandles", ["https://facebook.com/acme"], "account"),
    } as any);
    await applyResolvableFacts("e1");
    expect(fake.set).not.toHaveBeenCalled();
  });

  it("has no Whop save-offer or bridge writeback", async () => {
    vi.mocked(getClientFacts).mockResolvedValue({
      whopSaveOffer: fact("whopSaveOffer", { discountPercentage: 20 }, "user"),
      whopBridgeDestinationUrl: fact("whopBridgeDestinationUrl", "https://example.com", "account"),
    } as any);
    expect(await applyResolvableFacts("e1")).toEqual([]);
    expect(fake.set).not.toHaveBeenCalled();
  });
});
