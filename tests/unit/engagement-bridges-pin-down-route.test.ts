import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn(), update: vi.fn() } }));
vi.mock("@/lib/engagement-skills", () => ({
  isSkillEnabledForEngagement: vi.fn(),
  setSkillEnabledForEngagement: vi.fn(),
}));
vi.mock("@/lib/skill-dispatch", () => ({ dispatchSkillRun: vi.fn() }));

import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { isSkillEnabledForEngagement, setSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { dispatchSkillRun } from "@/lib/skill-dispatch";
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

describe("GET /api/engagements/[id]/bridges/pin-down", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({ whopUserId: "user-1" } as any);
  });

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

  it("pre-fills from stack + top-level columns, defaulting the template", async () => {
    Object.assign(
      db,
      fakeDb([
        {
          buyer: "Acme",
          stack: { buyer_domain: "acme.com", existing_confirmation_page_url: "https://acme.com/thanks", booking_platform: "calendly" },
          rawVoiceCorpus: "some pasted sample text",
          confirmationPageTemplate: "aurora",
          offerDetails: { name: "Growth Plan" },
        },
      ])
    );
    vi.mocked(isSkillEnabledForEngagement).mockResolvedValue(true);

    const { GET } = await importRoute();
    const res = await GET(new Request("http://x"), makeParams("e1"));
    const data = await res.json();

    expect(data.buyer).toBe("Acme");
    expect(data.enabled).toBe(true);
    expect(data.marketingDomain).toBe("acme.com");
    expect(data.existingConfirmationPageUrl).toBe("https://acme.com/thanks");
    expect(data.rawVoiceCorpus).toBe("some pasted sample text");
    expect(data.confirmationPageTemplate).toBe("aurora");
  });

  it("defaults confirmationPageTemplate to signal when never configured", async () => {
    Object.assign(db, fakeDb([{ buyer: "Acme", stack: {}, rawVoiceCorpus: null, confirmationPageTemplate: null, offerDetails: null }]));
    vi.mocked(isSkillEnabledForEngagement).mockResolvedValue(false);

    const { GET } = await importRoute();
    const res = await GET(new Request("http://x"), makeParams("e1"));
    const data = await res.json();

    expect(data.confirmationPageTemplate).toBe("signal");
    expect(data.marketingDomain).toBe("");
  });
});

describe("POST /api/engagements/[id]/bridges/pin-down", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({ whopUserId: "user-1" } as any);
    vi.mocked(setSkillEnabledForEngagement).mockResolvedValue(undefined);
    vi.mocked(dispatchSkillRun).mockResolvedValue("run-456");
  });

  it("returns 401 with no session", async () => {
    vi.mocked(getSession).mockResolvedValue({} as any);
    const { POST } = await importRoute();
    const res = await POST(postBody({ voiceSource: "scrape", marketingDomain: "acme.com" }), makeParams("e1"));
    expect(res.status).toBe(401);
  });

  it("rejects scrape mode with no marketing domain", async () => {
    const { POST } = await importRoute();
    const res = await POST(postBody({ voiceSource: "scrape", marketingDomain: "" }), makeParams("e1"));
    expect(res.status).toBe(400);
    expect(dispatchSkillRun).not.toHaveBeenCalled();
  });

  it("rejects manual mode with fewer than 50 words", async () => {
    const { POST } = await importRoute();
    const res = await POST(postBody({ voiceSource: "manual", rawVoiceCorpus: "too short" }), makeParams("e1"));
    expect(res.status).toBe(400);
    expect(dispatchSkillRun).not.toHaveBeenCalled();
  });

  it("returns 404 when the engagement isn't found or isn't owned by this tenant", async () => {
    Object.assign(db, fakeDb([]));
    const { POST } = await importRoute();
    const res = await POST(postBody({ voiceSource: "scrape", marketingDomain: "acme.com" }), makeParams("e1"));
    expect(res.status).toBe(404);
  });

  it("merges into the existing stack instead of overwriting it, then enables and dispatches", async () => {
    const fake = fakeDb([
      { engagementId: "e1", buyer: "Acme", stack: { booking_platform: "calendly", email_platform: "resend" } },
    ]);
    Object.assign(db, fake);

    const { POST } = await importRoute();
    const res = await POST(
      postBody({ voiceSource: "scrape", marketingDomain: "acme.com", confirmationPageTemplate: "aurora" }),
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
        confirmationPageTemplate: "aurora",
      })
    );
    expect(setSkillEnabledForEngagement).toHaveBeenCalledWith("e1", "pin-down", true);
    expect(dispatchSkillRun).toHaveBeenCalledWith("e1", "pin-down", "Acme");
    expect(data.runId).toBe("run-456");
  });

  it("defaults confirmationPageTemplate to signal when not provided", async () => {
    const fake = fakeDb([{ engagementId: "e1", buyer: "Acme", stack: {} }]);
    Object.assign(db, fake);

    const { POST } = await importRoute();
    await POST(postBody({ voiceSource: "scrape", marketingDomain: "acme.com" }), makeParams("e1"));

    expect(fake.set).toHaveBeenCalledWith(expect.objectContaining({ confirmationPageTemplate: "signal" }));
  });
});
