import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/workspace", () => ({ getActiveWorkspace: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/lib/engagement-skills", () => ({ isSkillEnabledForEngagement: vi.fn() }));
vi.mock("@/lib/worker-config-completeness", () => ({ getMissingRequiredFields: vi.fn() }));

import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import { isSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { getMissingRequiredFields } from "@/lib/worker-config-completeness";
import { fakeDb } from "../helpers/fake-db";

const params = { params: Promise.resolve({ id: "e1" }) };
const req = (product: string) => new Request(`http://x/api/engagements/e1/worker-status?product=${product}`);

describe("GET /api/engagements/[id]/worker-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({ whopUserId: "user-1" } as any);
    vi.mocked(getActiveWorkspace).mockResolvedValue({ workspaceId: "ws-1" } as any);
    Object.assign(db, fakeDb([{ engagementId: "e1" }]));
  });

  it("reports each Showtime worker as ready, needs setup (with what's missing), or off", async () => {
    vi.mocked(isSkillEnabledForEngagement).mockImplementation(async (_id, skill) => skill !== "leak-map");
    vi.mocked(getMissingRequiredFields).mockImplementation(async (skill) =>
      skill === "pre-call-read" ? [{ key: "slackWebhookUrl", label: "Slack webhook URL", reason: "Not set." }] : []
    );

    const { GET } = await import("@/app/api/engagements/[id]/worker-status/route");
    const data = await (await GET(req("showtime"), params)).json();
    const byId = Object.fromEntries(data.workers.map((w: any) => [w.workerId, w]));

    expect(data.workers).toHaveLength(5);
    expect(byId["pin-down"].status).toBe("ready");
    expect(byId["pre-call-read"].status).toBe("needs_setup");
    expect(byId["pre-call-read"].missing[0].label).toBe("Slack webhook URL");
    expect(byId["leak-map"].status).toBe("off");
    // Nothing is checked for a switched-off worker.
    expect(getMissingRequiredFields).not.toHaveBeenCalledWith("leak-map", "e1");
  });

  it("400s on an unknown product and 404s on someone else's client", async () => {
    const { GET } = await import("@/app/api/engagements/[id]/worker-status/route");
    expect((await GET(req("nope"), params)).status).toBe(400);
    Object.assign(db, fakeDb([]));
    expect((await GET(req("showtime"), params)).status).toBe(404);
  });
});
