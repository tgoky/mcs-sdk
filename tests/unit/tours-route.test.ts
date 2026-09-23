import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/workspace", () => ({ getActiveWorkspace: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/lib/engagement-stack", () => ({ setEngagementStackEntry: vi.fn() }));

import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import { setEngagementStackEntry } from "@/lib/engagement-stack";
import { TOURS } from "@/lib/tours/tour-definitions";
import { fakeDb } from "../helpers/fake-db";
import { PATCH } from "@/app/api/engagements/[id]/tours/route";

const params = { params: Promise.resolve({ id: "e1" }) };
const patch = (body: unknown) => new Request("http://x", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("tours route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({ whopUserId: "u1" } as any);
    vi.mocked(getActiveWorkspace).mockResolvedValue({ workspaceId: "ws1" } as any);
    Object.assign(db, fakeDb([{ engagementId: "e1" }]));
  });

  it("rejects a tour id that isn't a real tour", async () => {
    const res = await PATCH(patch({ tourId: "__proto__", status: "in_progress", currentStepId: "a" }), params);
    expect(res.status).toBe(400);
    expect(setEngagementStackEntry).not.toHaveBeenCalled();
  });

  it("writes only that tour's entry, keeping string step ids", async () => {
    const tourId = TOURS[0].id;
    const res = await PATCH(patch({ tourId, status: "in_progress", currentStepId: "s2", completedStepIds: ["s1", 5, "s2"] }), params);
    expect(res.status).toBe(200);
    expect(setEngagementStackEntry).toHaveBeenCalledWith("e1", "tour_state", tourId, expect.objectContaining({ status: "in_progress", currentStepId: "s2", completedStepIds: ["s1", "s2"] }));
  });

  it("accepts the welcome nudge's reserved id", async () => {
    const res = await PATCH(patch({ tourId: "welcome-nudge", status: "completed", currentStepId: "dismissed" }), params);
    expect(res.status).toBe(200);
  });
});
