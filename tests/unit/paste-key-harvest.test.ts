import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/http", () => ({ fetchWithTimeout: vi.fn() }));
vi.mock("@/lib/client-facts", () => ({ upsertClientFact: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/lib/discover-client", () => ({ discoverClientIfNotYetCrawled: vi.fn().mockResolvedValue(null) }));

import { fetchWithTimeout } from "@/lib/http";
import { upsertClientFact } from "@/lib/client-facts";
import { db } from "@/lib/db";
import { harvestTwilioA2PStatus, harvestWhopPlans } from "@/lib/paste-key-harvest";
import { fakeDb } from "../helpers/fake-db";

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as any;
const written = (key: string) => vi.mocked(upsertClientFact).mock.calls.find((c) => c[1] === key);

describe("harvestTwilioA2PStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(db, fakeDb([{ stack: { sms_platform_meta: { twilio_account_sid: "AC1", twilio_messaging_service_sid: "MG1" } } }]));
  });

  it("keeps Twilio's raw status alongside the mapped one, so a rejection is visible", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(ok({ compliance: [{ campaign_status: "FAILED" }] }));
    await harvestTwilioA2PStatus("e1", "token");
    expect(written("smsA2p10dlcStatus")?.[2]).toBe("brand_registered");
    expect(written("smsA2pCampaignStatus")?.[2]).toBe("FAILED");
  });

  it("maps a verified campaign to campaign_approved", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(ok({ compliance: [{ campaign_status: "VERIFIED" }] }));
    await harvestTwilioA2PStatus("e1", "token");
    expect(written("smsA2p10dlcStatus")?.[2]).toBe("campaign_approved");
  });

  it("does nothing until the SIDs are known", async () => {
    Object.assign(db, fakeDb([{ stack: {} }]));
    expect(await harvestTwilioA2PStatus("e1", "token")).toEqual([]);
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });
});

describe("harvestWhopPlans", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fills the offer price when there's exactly one plan", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(ok({ data: [{ id: "p1", formatted_price: "$49/mo" }] }));
    expect(await harvestWhopPlans("e1", "key", "acct")).toEqual(["offerPrice"]);
    expect(written("offerPrice")?.[2]).toBe("$49/mo");
  });

  it("doesn't pick a price when there are several plans; keeps them to choose from", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(
      ok({ data: [{ id: "p1", title: "Community", formatted_price: "$49/mo" }, { id: "p2", title: "Mentorship", renewal_price: 2000, currency: "usd" }] })
    );
    expect(await harvestWhopPlans("e1", "key", "acct")).toEqual(["whopPlanOptions"]);
    expect(written("offerPrice")).toBeUndefined();
    expect(written("whopPlanOptions")?.[2]).toEqual([
      { name: "Community", price: "$49/mo" },
      { name: "Mentorship", price: "2000 usd" },
    ]);
  });
});
