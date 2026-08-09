import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn(), update: vi.fn() } }));

import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { fakeDb } from "../helpers/fake-db";

async function importRoute() {
  return import("@/app/api/engagements/[id]/bridges/win-back/route");
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

describe("GET /api/engagements/[id]/bridges/win-back", () => {
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

  it("defaults to sane values when never configured — this bridge doesn't require setup", async () => {
    Object.assign(db, fakeDb([{ buyer: "Acme", stack: {} }]));
    const { GET } = await importRoute();
    const res = await GET(new Request("http://x"), makeParams("e1"));
    const data = await res.json();

    expect(data.rescheduleMode).toBe("time_slots");
    expect(data.recoveredFromNoShowTaggingEnabled).toBe(true);
    expect(data.inboundReplyMode).toBe("none");
    expect(data.hubspotPortalId).toBe("");
  });

  it("pre-fills from the stack when already configured", async () => {
    Object.assign(
      db,
      fakeDb([
        {
          buyer: "Acme",
          stack: {
            reschedule_mode: "fresh_link",
            recovered_from_no_show_tagging_enabled: false,
            inbound_reply_mode: "native",
            hubspot_portal_id: "12345",
            email_platform: "hubspot",
          },
        },
      ])
    );
    const { GET } = await importRoute();
    const res = await GET(new Request("http://x"), makeParams("e1"));
    const data = await res.json();

    expect(data.rescheduleMode).toBe("fresh_link");
    expect(data.recoveredFromNoShowTaggingEnabled).toBe(false);
    expect(data.inboundReplyMode).toBe("native");
    expect(data.hubspotPortalId).toBe("12345");
    expect(data.emailPlatform).toBe("hubspot");
  });
});

describe("POST /api/engagements/[id]/bridges/win-back", () => {
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

  it("rejects native reply mode on a HubSpot engagement with no portal id", async () => {
    Object.assign(db, fakeDb([{ engagementId: "e1", stack: { email_platform: "hubspot" } }]));
    const { POST } = await importRoute();
    const res = await POST(postBody({ inboundReplyMode: "native", hubspotPortalId: "" }), makeParams("e1"));
    expect(res.status).toBe(400);
  });

  it("allows native reply mode on a non-HubSpot engagement with no portal id", async () => {
    const fake = fakeDb([{ engagementId: "e1", stack: { email_platform: "klaviyo" } }]);
    Object.assign(db, fake);
    const { POST } = await importRoute();
    const res = await POST(postBody({ inboundReplyMode: "native" }), makeParams("e1"));
    expect(res.status).toBe(200);
  });

  it("merges into the existing stack instead of overwriting it", async () => {
    const fake = fakeDb([
      { engagementId: "e1", stack: { booking_platform: "calendly", email_platform: "hubspot" } },
    ]);
    Object.assign(db, fake);

    const { POST } = await importRoute();
    const res = await POST(
      postBody({ rescheduleMode: "fresh_link", inboundReplyMode: "native", hubspotPortalId: "999" }),
      makeParams("e1")
    );

    expect(res.status).toBe(200);
    expect(fake.set).toHaveBeenCalledWith(
      expect.objectContaining({
        stack: expect.objectContaining({
          booking_platform: "calendly",
          email_platform: "hubspot",
          reschedule_mode: "fresh_link",
          inbound_reply_mode: "native",
          hubspot_portal_id: "999",
        }),
      })
    );
  });

  it("defaults missing fields to their sane values rather than rejecting the request", async () => {
    const fake = fakeDb([{ engagementId: "e1", stack: {} }]);
    Object.assign(db, fake);

    const { POST } = await importRoute();
    const res = await POST(postBody({}), makeParams("e1"));

    expect(res.status).toBe(200);
    expect(fake.set).toHaveBeenCalledWith(
      expect.objectContaining({
        stack: expect.objectContaining({
          reschedule_mode: "time_slots",
          recovered_from_no_show_tagging_enabled: true,
          inbound_reply_mode: "none",
        }),
      })
    );
  });
});
