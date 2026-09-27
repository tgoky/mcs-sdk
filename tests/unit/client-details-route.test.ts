import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/workspace", () => ({ getActiveWorkspace: vi.fn().mockResolvedValue({ workspaceId: "ws-1" }) }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/client-profile", () => ({ getPrimaryDomainForEngagement: vi.fn(async () => "acme.com"), setPrimaryDomainForEngagement: vi.fn() }));
vi.mock("@/lib/engagement-stack", () => ({ patchEngagementStack: vi.fn() }));

import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { setPrimaryDomainForEngagement } from "@/lib/client-profile";
import { patchEngagementStack } from "@/lib/engagement-stack";
import { fakeDb } from "../helpers/fake-db";
import { GET, POST } from "@/app/api/engagements/[id]/client-details/route";

const params = { params: Promise.resolve({ id: "e1" }) };
const post = (body: unknown) => POST(new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), params);

describe("/api/engagements/[id]/client-details", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({ whopUserId: "u1" } as never);
    Object.assign(db, fakeDb([{ buyer: "Acme", stack: { timezone: "America/New_York" }, queuePinWindowHours: 48 }]));
  });

  it("asks a signed-out caller to sign in, and hides clients that aren't theirs", async () => {
    vi.mocked(getSession).mockResolvedValue(null as never);
    expect((await GET(new Request("http://x"), params)).status).toBe(401);
    vi.mocked(getSession).mockResolvedValue({ whopUserId: "u1" } as never);
    Object.assign(db, fakeDb([]));
    expect((await post({ name: "X" })).status).toBe(404);
  });

  it("reads the name, website and time zone", async () => {
    const res = await GET(new Request("http://x"), params);
    expect(await res.json()).toEqual({ name: "Acme", website: "acme.com", timezone: "America/New_York", queuePinWindowHours: 48 });
  });

  it("saves the website as a bare host and the time zone on the stack", async () => {
    const res = await post({ name: "Acme Inc", website: "https://www.Acme.io/about", timezone: "Europe/London" });
    expect(res.status).toBe(200);
    expect(setPrimaryDomainForEngagement).toHaveBeenCalledWith("e1", "acme.io");
    expect(patchEngagementStack).toHaveBeenCalledWith("e1", { timezone: "Europe/London" });
  });

  it("refuses an empty name, a non-address website and an unknown time zone", async () => {
    expect(await (await post({ name: " " })).json()).toMatchObject({ field: "name" });
    expect(await (await post({ website: "not a site" })).json()).toMatchObject({ field: "website" });
    expect(await (await post({ timezone: "Mars/Olympus" })).json()).toMatchObject({ field: "timezone" });
    expect(await (await post({ queuePinWindowHours: 0 })).json()).toMatchObject({ field: "queuePinWindowHours" });
    expect(patchEngagementStack).not.toHaveBeenCalled();
  });
});
