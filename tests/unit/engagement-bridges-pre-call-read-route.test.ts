import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn(), update: vi.fn() } }));
vi.mock("@/lib/credentials", () => ({ storeCredential: vi.fn() }));

import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { storeCredential } from "@/lib/credentials";
import { fakeDb } from "../helpers/fake-db";

async function importRoute() {
  return import("@/app/api/engagements/[id]/bridges/pre-call-read/route");
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

describe("GET /api/engagements/[id]/bridges/pre-call-read", () => {
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

  it("defaults to sane values when never configured", async () => {
    Object.assign(db, fakeDb([{ buyer: "Acme", stack: {} }]));
    const { GET } = await importRoute();
    const res = await GET(new Request("http://x"), makeParams("e1"));
    const data = await res.json();

    expect(data.briefTriggerType).toBe("nightly");
    expect(data.videoEngagementPlatform).toBe("none");
    expect(data.prospectResearchSourcesUsed).toEqual([]);
  });

  it("pre-fills nested video_engagement_meta correctly", async () => {
    Object.assign(
      db,
      fakeDb([
        {
          buyer: "Acme",
          stack: {
            brief_trigger_type: "dynamic_webhook",
            video_engagement_platform: "wistia",
            video_engagement_meta: { wistia_video_id: "abc123" },
            prospect_research_sources_used: ["apollo"],
          },
        },
      ])
    );
    const { GET } = await importRoute();
    const res = await GET(new Request("http://x"), makeParams("e1"));
    const data = await res.json();

    expect(data.briefTriggerType).toBe("dynamic_webhook");
    expect(data.videoEngagementWistiaVideoId).toBe("abc123");
    expect(data.prospectResearchSourcesUsed).toEqual(["apollo"]);
  });
});

describe("POST /api/engagements/[id]/bridges/pre-call-read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({ whopUserId: "user-1" } as any);
  });

  it("returns 401 with no session", async () => {
    vi.mocked(getSession).mockResolvedValue({} as any);
    const { POST } = await importRoute();
    const res = await POST(postBody({}), makeParams("e1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when the engagement isn't found or isn't owned by this tenant", async () => {
    Object.assign(db, fakeDb([]));
    const { POST } = await importRoute();
    const res = await POST(postBody({}), makeParams("e1"));
    expect(res.status).toBe(404);
  });

  it("merges into the existing stack instead of overwriting it", async () => {
    const fake = fakeDb([{ engagementId: "e1", stack: { booking_platform: "calendly" } }]);
    Object.assign(db, fake);

    const { POST } = await importRoute();
    const res = await POST(postBody({ briefTriggerType: "dynamic_webhook", videoEngagementPlatform: "wistia" }), makeParams("e1"));

    expect(res.status).toBe(200);
    expect(fake.set).toHaveBeenCalledWith(
      expect.objectContaining({
        stack: expect.objectContaining({
          booking_platform: "calendly",
          brief_trigger_type: "dynamic_webhook",
          video_engagement_platform: "wistia",
        }),
      })
    );
  });

  it("stores the video engagement credential only when a non-empty key is provided", async () => {
    const fake = fakeDb([{ engagementId: "e1", stack: {} }]);
    Object.assign(db, fake);
    const { POST } = await importRoute();

    await POST(postBody({ videoEngagementPlatform: "wistia", videoEngagementApiKey: "" }), makeParams("e1"));
    expect(storeCredential).not.toHaveBeenCalled();

    await POST(postBody({ videoEngagementPlatform: "wistia", videoEngagementApiKey: "secret123" }), makeParams("e1"));
    expect(storeCredential).toHaveBeenCalledWith("e1", "wistia", "secrets://e1/wistia_key", "secret123");
  });

  it("never stores a credential for loom (no analytics API available)", async () => {
    const fake = fakeDb([{ engagementId: "e1", stack: {} }]);
    Object.assign(db, fake);
    const { POST } = await importRoute();

    await POST(postBody({ videoEngagementPlatform: "loom", videoEngagementApiKey: "secret123" }), makeParams("e1"));
    expect(storeCredential).not.toHaveBeenCalled();
  });

  it("stores apollo/pdl credentials only when the source is selected and a key is given", async () => {
    const fake = fakeDb([{ engagementId: "e1", stack: {} }]);
    Object.assign(db, fake);
    const { POST } = await importRoute();

    await POST(
      postBody({ prospectResearchSourcesUsed: ["apollo"], apolloApiKey: "apollo-key", pdlApiKey: "pdl-key" }),
      makeParams("e1")
    );

    expect(storeCredential).toHaveBeenCalledWith("e1", "apollo", "secrets://e1/apollo_key", "apollo-key");
    expect(storeCredential).not.toHaveBeenCalledWith("e1", "pdl", expect.anything(), expect.anything());
  });
});
