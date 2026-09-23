import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: { select: vi.fn(), update: vi.fn() } }));
// Plain-value conditions so the fake below can see which provider a query asks about.
vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return { ...actual, eq: (_col: unknown, value: unknown) => ({ eq: value }), and: (...conds: unknown[]) => ({ and: conds }) };
});

import { db } from "@/lib/db";
import { syncMarkersForChosenPlatforms } from "@/lib/credentials";

// hasCredential and syncStackCredentialMarkers both read through db.select;
// this fake answers each query by what's being asked for.
function fakeStore(savedProviders: string[], stack: Record<string, unknown>) {
  const set = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
  (db as any).update = vi.fn(() => ({ set }));
  (db as any).select = vi.fn((fields: Record<string, unknown>) => {
    let provider: string | null = null;
    const chain: any = {
      from: () => chain,
      where: (cond: unknown) => {
        const text = JSON.stringify(cond);
        provider = savedProviders.find((p) => text?.includes(`"${p}"`)) ?? null;
        return chain;
      },
      limit: () => Promise.resolve("stack" in fields ? [{ stack }] : provider ? [{ id: 1 }] : []),
    };
    return chain;
  });
  return set;
}

describe("syncMarkersForChosenPlatforms", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks a chosen platform connected when its key was saved earlier", async () => {
    const set = fakeStore(["twilio"], { sms_platform: "twilio" });
    await syncMarkersForChosenPlatforms("e1", ["twilio"]);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ stack: expect.objectContaining({ sms_platform_credentials_ref: "secrets://e1/twilio_key" }) }));
  });

  it("does nothing for platforms without a saved key, or that need none", async () => {
    const set = fakeStore([], { sms_platform: "twilio", ad_data_platform: "native_crm" });
    await syncMarkersForChosenPlatforms("e1", ["twilio", "native_crm", "none", undefined]);
    expect(set).not.toHaveBeenCalled();
  });
});
