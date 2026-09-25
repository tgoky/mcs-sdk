import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn(), update: vi.fn() } }));
vi.mock("@/lib/workspace", () => ({
  getActiveWorkspace: vi.fn(),
  isPackageInstalledInWorkspace: vi.fn(),
}));
vi.mock("@/lib/engagement-skills", () => ({
  isSkillEnabledForEngagement: vi.fn(),
  setSkillEnabledForEngagement: vi.fn(),
}));
vi.mock("@/lib/skill-dispatch", () => ({ dispatchSkillRun: vi.fn() }));
vi.mock("@/lib/client-profile", () => ({
  getPrimaryDomainForEngagement: vi.fn(),
  seedPrimaryDomainFromUrl: vi.fn(),
}));
vi.mock("@/lib/client-facts", () => ({
  getClientFacts: vi.fn(),
  recordDossierDecisions: vi.fn(),
  getClientFact: vi.fn(),
  confirmClientFact: vi.fn(),
  editClientFact: vi.fn(),
}));
// Connection-based suggestions have their own test (derived-suggestions.test.ts).
vi.mock("@/lib/derived-suggestions", () => ({ showtimeConnectionSuggestions: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/credentials", () => ({ syncMarkersForChosenPlatforms: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/field-writeback", async () => {
  // Keep the real trust rule (it decides pre-fill vs suggestion); only the
  // DB-writing writeback is stubbed.
  const actual = await vi.importActual<typeof import("@/lib/field-writeback")>("@/lib/field-writeback");
  return { isFactTrusted: actual.isFactTrusted, applyResolvableFacts: vi.fn() };
});

import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { getActiveWorkspace, isPackageInstalledInWorkspace } from "@/lib/workspace";
import { isSkillEnabledForEngagement, setSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { dispatchSkillRun } from "@/lib/skill-dispatch";
import { getPrimaryDomainForEngagement, seedPrimaryDomainFromUrl } from "@/lib/client-profile";
import { confirmClientFact, editClientFact, getClientFact, getClientFacts, recordDossierDecisions } from "@/lib/client-facts";
import { applyResolvableFacts } from "@/lib/field-writeback";
import { fakeDb } from "../helpers/fake-db";

async function importRoute() {
  return import("@/app/api/engagements/[id]/bridges/pin-down/route");
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function postBody(body: unknown) {
  return new Request("http://x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function resetCommonMocks() {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue({ whopUserId: "user-1" } as any);
  vi.mocked(getActiveWorkspace).mockResolvedValue({ workspaceId: "ws-1" } as any);
  vi.mocked(isPackageInstalledInWorkspace).mockResolvedValue(true);
  vi.mocked(applyResolvableFacts).mockResolvedValue([]);
  vi.mocked(getClientFacts).mockResolvedValue({});
  vi.mocked(getPrimaryDomainForEngagement).mockResolvedValue(null);
  vi.mocked(seedPrimaryDomainFromUrl).mockResolvedValue(undefined);
  vi.mocked(isSkillEnabledForEngagement).mockResolvedValue(false);
  vi.mocked(setSkillEnabledForEngagement).mockResolvedValue(undefined);
  vi.mocked(dispatchSkillRun).mockResolvedValue("run-456");
  vi.mocked(recordDossierDecisions).mockResolvedValue(undefined);
}

function fact(key: string, value: unknown, source: string, extra: Record<string, unknown> = {}) {
  return { key, value, source, status: "suggested", confidence: null, sourceDetail: null, evidence: null, updatedAt: new Date(), ...extra };
}

describe("GET /api/engagements/[id]/bridges/pin-down", () => {
  beforeEach(resetCommonMocks);

  it("returns 401 with no session", async () => {
    vi.mocked(getSession).mockResolvedValue({} as any);
    const { GET } = await importRoute();
    const res = await GET(new Request("http://x"), makeParams("e1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when the engagement isn't found or isn't owned by this tenant", async () => {
    Object.assign(db, fakeDb([]));
    const { GET } = await importRoute();
    const res = await GET(new Request("http://x"), makeParams("e1"));
    expect(res.status).toBe(404);
  });

  it("never promotes facts into an engagement this tenant doesn't own", async () => {
    Object.assign(db, fakeDb([]));
    const { GET } = await importRoute();
    await GET(new Request("http://x"), makeParams("someone-elses-engagement"));
    expect(applyResolvableFacts).not.toHaveBeenCalled();
  });

  it("pre-fills from the saved stack and offer details", async () => {
    Object.assign(
      db,
      fakeDb([
        {
          buyer: "Acme",
          stack: { buyer_domain: "acme.com", booking_platform: "calendly", email_platform: "hubspot" },
          offerDetails: { name: "Growth Plan", price: "$997", vertical: "coaching", icp: "founders", traffic_temperature: "cold" },
          castingChoice: "founder_on_camera",
          confirmationPageUrl: null,
          rawVoiceCorpus: "some sample text",
        },
      ])
    );
    vi.mocked(isSkillEnabledForEngagement).mockResolvedValue(true);

    const { GET } = await importRoute();
    const res = await GET(new Request("http://x"), makeParams("e1"));
    const data = await res.json();

    expect(res.status).toBe(200);
    // Loading only reads: promotion happens on Save, not on a page load.
    expect(applyResolvableFacts).not.toHaveBeenCalled();
    expect(data.buyer).toBe("Acme");
    expect(data.enabled).toBe(true);
    expect(data.hasVoiceCorpus).toBe(true);
    expect(data.config.buyerDomain).toBe("acme.com");
    expect(data.config.bookingPlatform).toBe("calendly");
    expect(data.config.offerName).toBe("Growth Plan");
    expect(data.config.offerPrice).toBe("$997");
    expect(data.config.trafficTemperature).toBe("cold");
  });
});

describe("GET pin-down suggestions", () => {
  beforeEach(resetCommonMocks);

  it("pre-fills only trusted facts; unscored or low-scored guesses come back as suggestions", async () => {
    Object.assign(db, fakeDb([{ buyer: "Acme", stack: {}, offerDetails: null, castingChoice: null, confirmationPageUrl: null, rawVoiceCorpus: null }]));
    vi.mocked(getClientFacts).mockResolvedValue({
      offerName: fact("offerName", "Growth Program", "jev", { confidence: 90 }),
      offerPrice: fact("offerPrice", "$2,000", "llm"),
      trafficTemperature: fact("trafficTemperature", "hot", "jev", { confidence: 40 }),
      bookingPlatform: fact("bookingPlatform", "calendly", "website"),
      offerIcp: fact("offerIcp", "Founders", "llm", { status: "rejected" }),
    } as any);

    const { GET } = await importRoute();
    const data = await (await GET(new Request("http://x"), makeParams("e1"))).json();

    expect(data.config.offerName).toBe("Growth Program");
    expect(data.config.bookingPlatform).toBe("calendly");
    expect(data.config.offerPrice).toBe("");
    expect(data.config.trafficTemperature).toBe("");
    expect(data.config.offerIcp).toBe("");
    expect(Object.keys(data.suggestions).sort()).toEqual(["offerPrice", "trafficTemperature"]);
    expect(data.suggestions.trafficTemperature.confidence).toBe(40);
  });

  it("never pre-fills the offer name with the client's name, or SMS/briefs with a default", async () => {
    Object.assign(db, fakeDb([{ buyer: "Acme", stack: {}, offerDetails: null, castingChoice: null, confirmationPageUrl: null, rawVoiceCorpus: null }]));
    const { GET } = await importRoute();
    const data = await (await GET(new Request("http://x"), makeParams("e1"))).json();

    expect(data.config.offerName).toBe("");
    expect(data.config.smsPlatform).toBeNull();
    expect(data.config.adDataPlatform).toBeNull();
    expect(data.config.briefLandingDestination).toBeNull();
  });
});

describe("POST /api/engagements/[id]/bridges/pin-down", () => {
  beforeEach(resetCommonMocks);

  it("returns 401 with no session", async () => {
    vi.mocked(getSession).mockResolvedValue({} as any);
    const { POST } = await importRoute();
    const res = await POST(postBody({ buyerDomain: "acme.com" }), makeParams("e1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when Showtime isn't installed in the workspace", async () => {
    vi.mocked(isPackageInstalledInWorkspace).mockResolvedValue(false);
    const { POST } = await importRoute();
    const res = await POST(postBody({ buyerDomain: "acme.com" }), makeParams("e1"));
    expect(res.status).toBe(403);
    expect(dispatchSkillRun).not.toHaveBeenCalled();
  });

  it("returns 404 when the engagement isn't found or isn't owned by this tenant", async () => {
    Object.assign(db, fakeDb([]));
    const { POST } = await importRoute();
    const res = await POST(postBody({ buyerDomain: "acme.com" }), makeParams("e1"));
    expect(res.status).toBe(404);
    expect(dispatchSkillRun).not.toHaveBeenCalled();
  });

  it("merges into the existing stack instead of overwriting it, then dispatches", async () => {
    const fake = fakeDb([
      { engagementId: "e1", buyer: "Acme", stack: { booking_platform: "calendly", email_platform: "resend" }, offerDetails: null },
    ]);
    Object.assign(db, fake);

    const { POST } = await importRoute();
    const res = await POST(
      postBody({ buyerDomain: "acme.com", offerName: "Growth Plan", offerPrice: "$997", trafficTemperature: "cold" }),
      makeParams("e1")
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(fake.set).toHaveBeenCalledWith(
      expect.objectContaining({
        stack: expect.objectContaining({
          booking_platform: "calendly",
          email_platform: "resend",
          buyer_domain: "acme.com",
        }),
        offerDetails: expect.objectContaining({ name: "Growth Plan", price: "$997", traffic_temperature: "cold" }),
      })
    );
    expect(setSkillEnabledForEngagement).toHaveBeenCalledWith("e1", "pin-down", true);
    expect(seedPrimaryDomainFromUrl).toHaveBeenCalledWith("e1", "acme.com");
    expect(dispatchSkillRun).toHaveBeenCalledWith("e1", "pin-down", "Acme");
    expect(data.runId).toBe("run-456");
    // Save is where trusted facts the body didn't carry reach config.
    expect(applyResolvableFacts).toHaveBeenCalledWith("e1");
  });

  it("refuses to save without a traffic temperature instead of assuming warm", async () => {
    Object.assign(db, fakeDb([{ engagementId: "e1", buyer: "Acme", stack: {}, offerDetails: null, castingChoice: null }]));
    const { POST } = await importRoute();
    const res = await POST(postBody({ buyerDomain: "acme.com", offerName: "Growth" }), makeParams("e1"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cold, warm or hot/);
    expect(dispatchSkillRun).not.toHaveBeenCalled();
  });

  it("rejects a brief destination that can't be delivered", async () => {
    Object.assign(db, fakeDb([{ engagementId: "e1", buyer: "Acme", stack: {}, offerDetails: null, castingChoice: null }]));
    const { POST } = await importRoute();
    const res = await POST(postBody({ buyerDomain: "acme.com", trafficTemperature: "warm", briefLandingDestination: "email" }), makeParams("e1"));
    expect(res.status).toBe(400);
  });

  it("leaves SMS and ad data unset, stores a listed vertical id, and records suggestion decisions", async () => {
    const fake = fakeDb([{ engagementId: "e1", buyer: "Acme", stack: {}, offerDetails: null, castingChoice: null }]);
    Object.assign(db, fake);
    const { POST } = await importRoute();
    await POST(postBody({ buyerDomain: "acme.com", trafficTemperature: "warm", offerName: "Growth", offerVertical: "coaching" }), makeParams("e1"));

    const saved = fake.set.mock.calls[0][0];
    expect(saved.stack.sms_platform).toBeUndefined();
    expect(saved.stack.ad_data_platform).toBeUndefined();
    expect(saved.offerDetails.vertical).toBe("coaching_consulting");
    expect(recordDossierDecisions).toHaveBeenCalledWith("e1", expect.objectContaining({ offerName: "Growth", trafficTemperature: "warm" }));
  });

  it("saves the ids the setup screen picked and records whether Jev's pick was kept", async () => {
    const fake = fakeDb([{ engagementId: "e1", buyer: "Acme", stack: { hosting_platform_meta: { webflow_collection_id: "col-1" } }, offerDetails: null, castingChoice: null }]);
    Object.assign(db, fake);
    vi.mocked(getClientFact).mockImplementation(async (_id, key) =>
      key === "pick:target_list_id"
        ? (fact(key, { id: "L1", name: "New leads", resource: "klaviyo-lists" }, "jev") as any)
        : key === "pick:recovery_list_id"
          ? (fact(key, { id: "L9", name: "Old", resource: "klaviyo-lists" }, "jev") as any)
          : null
    );
    const { POST } = await importRoute();
    await POST(
      postBody({
        buyerDomain: "acme.com",
        trafficTemperature: "warm",
        autoPicks: {
          target_list_id: { id: "L1", name: "New leads" },
          recovery_list_id: { id: "L2", name: "No-shows" },
          webflow_site_id: { id: "site-1", name: "Acme" },
          not_a_slot: { id: "x" },
        },
      }),
      makeParams("e1")
    );

    const saved = fake.set.mock.calls[0][0];
    expect(saved.stack.target_list_id).toBe("L1");
    expect(saved.stack.recovery_list_id).toBe("L2");
    expect(saved.stack.hosting_platform_meta).toEqual({ webflow_collection_id: "col-1", webflow_site_id: "site-1" });
    expect(saved.stack).not.toHaveProperty("not_a_slot");
    expect(confirmClientFact).toHaveBeenCalledWith("e1", "pick:target_list_id");
    expect(editClientFact).toHaveBeenCalledWith("e1", "pick:recovery_list_id", { id: "L2", name: "No-shows", resource: "klaviyo-lists" });
  });

  it("with a skill list, switches exactly those on, asks nothing Pin-Down needs when it's off, and runs nothing", async () => {
    const fake = fakeDb([{ engagementId: "e1", buyer: "Acme", stack: {}, offerDetails: null, castingChoice: null }]);
    Object.assign(db, fake);
    const { POST } = await importRoute();
    const res = await POST(postBody({ skills: ["leak-map"], bookingPlatform: "calendly" }), makeParams("e1"));

    expect(res.status).toBe(200);
    expect(setSkillEnabledForEngagement).toHaveBeenCalledWith("e1", "leak-map", true);
    for (const off of ["pin-down", "pile-on", "pre-call-read", "win-back"]) expect(setSkillEnabledForEngagement).toHaveBeenCalledWith("e1", off, false);
    expect(dispatchSkillRun).not.toHaveBeenCalled();
    const saved = fake.set.mock.calls[0][0];
    expect(saved.stack.booking_platform).toBe("calendly");
    expect(saved.stack.showtime_setup_saved_at).toEqual(expect.any(String));
  });

  it("still needs the website and lead warmth when Pin-Down is switched on", async () => {
    Object.assign(db, fakeDb([{ engagementId: "e1", buyer: "Acme", stack: {}, offerDetails: null, castingChoice: null }]));
    const { POST } = await importRoute();
    const res = await POST(postBody({ skills: ["pin-down", "leak-map"], buyerDomain: "acme.com" }), makeParams("e1"));
    expect(res.status).toBe(400);
    expect(dispatchSkillRun).not.toHaveBeenCalled();
  });

  it("keeps the client's own confirmation page when asked, and refuses when there's none", async () => {
    const fake = fakeDb([{ engagementId: "e1", buyer: "Acme", stack: {}, offerDetails: null, castingChoice: null }]);
    Object.assign(db, fake);
    const { POST } = await importRoute();
    await POST(
      postBody({ buyerDomain: "acme.com", trafficTemperature: "warm", existingConfirmationPageReuse: true, existingConfirmationPageUrl: "https://acme.com/thanks" }),
      makeParams("e1")
    );
    const saved = fake.set.mock.calls[0][0];
    expect(saved.stack.existing_confirmation_page_reuse).toBe(true);
    expect(saved.stack.existing_confirmation_page_url).toBe("https://acme.com/thanks");

    Object.assign(db, fakeDb([{ engagementId: "e1", buyer: "Acme", stack: {}, offerDetails: null, castingChoice: null }]));
    const res = await POST(postBody({ buyerDomain: "acme.com", trafficTemperature: "warm", existingConfirmationPageReuse: true }), makeParams("e1"));
    expect(res.status).toBe(400);
  });

  it("refuses to save without a website", async () => {
    Object.assign(db, fakeDb([{ engagementId: "e1", buyer: "Acme", stack: {}, offerDetails: null, castingChoice: null }]));
    const { POST } = await importRoute();
    const res = await POST(postBody({ trafficTemperature: "warm" }), makeParams("e1"));
    expect(res.status).toBe(400);
    expect(dispatchSkillRun).not.toHaveBeenCalled();
  });

  it("switches on only Pin-Down, leaving the other Showtime workers as the user set them", async () => {
    Object.assign(db, fakeDb([{ engagementId: "e1", buyer: "Acme", stack: {}, offerDetails: null, castingChoice: null }]));
    const { POST } = await importRoute();
    await POST(postBody({ buyerDomain: "acme.com", trafficTemperature: "warm" }), makeParams("e1"));
    expect(vi.mocked(setSkillEnabledForEngagement).mock.calls).toEqual([["e1", "pin-down", true]]);
  });
});
