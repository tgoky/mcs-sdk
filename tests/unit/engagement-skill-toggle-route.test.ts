import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/lib/engagement-skills", () => ({ setSkillEnabledForEngagement: vi.fn() }));

import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { setSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { fakeDb } from "../helpers/fake-db";

async function importRoute() {
  const mod = await import("@/app/api/engagements/[id]/skills/[skillId]/route");
  return mod.POST;
}

function makeParams(id: string, skillId: string) {
  return { params: Promise.resolve({ id, skillId }) };
}

function postBody(enabled: boolean) {
  return new Request("http://x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
}

describe("POST /api/engagements/[id]/skills/[skillId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({ whopUserId: "user-1" } as any);
    vi.mocked(setSkillEnabledForEngagement).mockResolvedValue(undefined);
  });

  it("returns 401 with no session", async () => {
    vi.mocked(getSession).mockResolvedValue({} as any);
    const POST = await importRoute();
    const res = await POST(postBody(true), makeParams("e1", "pile-on"));
    expect(res.status).toBe(401);
  });

  it("returns 400 for an unknown skillId", async () => {
    const POST = await importRoute();
    const res = await POST(postBody(true), makeParams("e1", "counterclaim-thing"));
    expect(res.status).toBe(400);
  });

  // runOnSetup check happens before the ownership lookup — no need for a
  // real engagement row to reject this.
  it("rejects enabling pin-down here — it has its own config screen", async () => {
    const POST = await importRoute();
    const res = await POST(postBody(true), makeParams("e1", "pin-down"));
    const data = await res.json();

    expect(res.status).toBe(422);
    expect(data.configureAt).toBe("/api/engagements/e1/bridges/pin-down");
    expect(setSkillEnabledForEngagement).not.toHaveBeenCalled();
  });

  it("returns 404 when the engagement isn't found or isn't owned by this tenant", async () => {
    Object.assign(db, fakeDb([]));
    const POST = await importRoute();
    const res = await POST(postBody(true), makeParams("e1", "pile-on"));
    expect(res.status).toBe(404);
  });

  it("disabling pin-down is still plain bookkeeping — no rejection", async () => {
    Object.assign(db, fakeDb([{ engagementId: "e1" }]));
    const POST = await importRoute();
    const res = await POST(postBody(false), makeParams("e1", "pin-down"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(setSkillEnabledForEngagement).toHaveBeenCalledWith("e1", "pin-down", false);
    expect(data.runId).toBeUndefined();
  });

  // pile-on, pre-call-read, win-back, leak-map all wait on their own
  // trigger (webhook/cron) — no runOnSetup flag, so enabling them is a
  // plain toggle in both directions, never rejected.
  it.each(["pile-on", "pre-call-read", "win-back", "leak-map"])(
    "enabling %s is a plain toggle, not rejected",
    async (skillId) => {
      Object.assign(db, fakeDb([{ engagementId: "e1" }]));
      const POST = await importRoute();
      const res = await POST(postBody(true), makeParams("e1", skillId));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(setSkillEnabledForEngagement).toHaveBeenCalledWith("e1", skillId, true);
      expect(data.runId).toBeUndefined();
    }
  );
});
