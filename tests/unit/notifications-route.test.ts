import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn() } }));

import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { fakeDb } from "../helpers/fake-db";

async function importRoute() {
  const mod = await import("@/app/api/notifications/route");
  return mod.GET;
}

function notif(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "n1",
    whopUserId: "user-1",
    type: "run_failed",
    severity: "critical",
    title: "A run failed",
    body: "Pin-Down failed for Acme Co.",
    runId: "run-1",
    engagementId: "eng-1",
    read: false,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("GET /api/notifications", () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue({ whopUserId: "user-1" } as any);
  });

  it("returns 401 with no session", async () => {
    vi.mocked(getSession).mockResolvedValue({} as any);
    const GET = await importRoute();
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("computes unreadCount from the returned rows", async () => {
    Object.assign(
      db,
      fakeDb([notif({ id: "n1", read: false }), notif({ id: "n2", read: true }), notif({ id: "n3", read: false })])
    );
    const GET = await importRoute();
    const res = await GET();
    const body = await res.json();
    expect(body.unreadCount).toBe(2);
    expect(body.notifications).toHaveLength(3);
  });

  it("returns zero unread and an empty list when there are no notifications", async () => {
    Object.assign(db, fakeDb([]));
    const GET = await importRoute();
    const res = await GET();
    const body = await res.json();
    expect(body.unreadCount).toBe(0);
    expect(body.notifications).toEqual([]);
  });

  it("scopes the query with a where clause (tenant isolation)", async () => {
    const fake = fakeDb([notif()]);
    Object.assign(db, fake);
    const GET = await importRoute();
    await GET();
    expect(fake.where).toHaveBeenCalled();
    expect(fake.limit).toHaveBeenCalledWith(30);
  });
});
