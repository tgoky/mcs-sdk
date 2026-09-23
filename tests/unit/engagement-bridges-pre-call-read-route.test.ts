import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/workspace", () => ({
  getActiveWorkspace: vi.fn().mockResolvedValue({ workspaceId: "ws-1" }),
  isPackageInstalledInWorkspace: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn(), update: vi.fn() } }));
vi.mock("@/lib/credentials", () => ({ storeCredential: vi.fn(), hasCredential: vi.fn().mockResolvedValue(false) }));
vi.mock("@/lib/client-facts", () => ({ getClientFact: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/derived-suggestions", () => ({ showtimeConnectionSuggestions: vi.fn().mockResolvedValue({}) }));

import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { storeCredential, hasCredential } from "@/lib/credentials";
import { getClientFact } from "@/lib/client-facts";
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
    vi.mocked(hasCredential).mockResolvedValue(false);
    vi.mocked(getClientFact).mockResolvedValue(null);
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
    vi.mocked(hasCredential).mockResolvedValue(false);
    vi.mocked(getClientFact).mockResolvedValue(null);
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

  it("saves where briefs land, and leaves it alone when not sent", async () => {
    const fake = fakeDb([{ engagementId: "e1", stack: { brief_landing_destination: "slack", slack_webhook_url: "https://hooks.slack.com/x" } }]);
    Object.assign(db, fake);
    const { POST } = await importRoute();

    await POST(postBody({ briefLandingDestination: "crm_note" }), makeParams("e1"));
    expect(fake.set.mock.calls[0][0].stack.brief_landing_destination).toBe("crm_note");

    await POST(postBody({ briefTriggerType: "nightly" }), makeParams("e1"));
    expect(fake.set.mock.calls[1][0].stack.brief_landing_destination).toBe("slack");
    expect(fake.set.mock.calls[1][0].stack.slack_webhook_url).toBe("https://hooks.slack.com/x");
  });

  it("saves a channel from the connected Slack workspace, and clears the webhook it replaces", async () => {
    const fake = fakeDb([{ engagementId: "e1", stack: { slack_webhook_url: "https://hooks.slack.com/x" } }]);
    Object.assign(db, fake);
    vi.mocked(getClientFact).mockResolvedValue({ value: [{ id: "C1", name: "#sales" }] } as any);
    const { POST } = await importRoute();

    const res = await POST(postBody({ briefLandingDestination: "slack", slackChannelId: "C1", slackWebhookUrl: "" }), makeParams("e1"));
    expect(res.status).toBe(200);
    const stack = fake.set.mock.calls[0][0].stack;
    expect(stack.slack_channel_id).toBe("C1");
    expect(stack.slack_channel_name).toBe("#sales");
    expect(stack.slack_webhook_url).toBeUndefined();
  });

  it("rejects a channel that isn't in the connected workspace", async () => {
    Object.assign(db, fakeDb([{ engagementId: "e1", stack: {} }]));
    vi.mocked(getClientFact).mockResolvedValue({ value: [{ id: "C1", name: "#sales" }] } as any);
    const { POST } = await importRoute();
    expect((await POST(postBody({ briefLandingDestination: "slack", slackChannelId: "C999" }), makeParams("e1"))).status).toBe(400);
  });

  it("GET reports the Slack connection and its channels", async () => {
    Object.assign(db, fakeDb([{ engagementId: "e1", buyer: "Acme", stack: { slack_channel_id: "C1" } }]));
    vi.mocked(hasCredential).mockResolvedValue(true);
    vi.mocked(getClientFact).mockResolvedValue({ value: [{ id: "C1", name: "#sales" }] } as any);
    const { GET } = await importRoute();
    const data = await (await GET(new Request("http://x"), makeParams("e1"))).json();
    expect(data.slackConnected).toBe(true);
    expect(data.slackChannelId).toBe("C1");
    expect(data.slackChannels).toEqual([{ id: "C1", name: "#sales" }]);
  });

  it("rejects a destination briefs can't be delivered to, and a non-https webhook", async () => {
    Object.assign(db, fakeDb([{ engagementId: "e1", stack: {} }]));
    const { POST } = await importRoute();
    expect((await POST(postBody({ briefLandingDestination: "email" }), makeParams("e1"))).status).toBe(400);
    expect((await POST(postBody({ briefLandingDestination: "slack", slackWebhookUrl: "http://x" }), makeParams("e1"))).status).toBe(400);
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
