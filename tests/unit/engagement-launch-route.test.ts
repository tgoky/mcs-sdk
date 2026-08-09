import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn(), update: vi.fn() } }));

import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { fakeDb } from "../helpers/fake-db";

async function importRoute() {
  const mod = await import("@/app/api/engagements/[id]/launch/route");
  return mod.POST;
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/engagements/[id]/launch", () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue({ whopUserId: "user-1" } as any);
  });

  it("returns 401 with no session", async () => {
    vi.mocked(getSession).mockResolvedValue({} as any);
    const POST = await importRoute();
    const res = await POST(new Request("http://x", { method: "POST" }), makeParams("e1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when the engagement isn't found or isn't owned by this tenant", async () => {
    Object.assign(db, fakeDb([]));
    const POST = await importRoute();
    const res = await POST(new Request("http://x", { method: "POST" }), makeParams("e1"));
    expect(res.status).toBe(404);
  });

  it("sets launchedAt and does not touch any skill registry or dispatcher", async () => {
    const fake = fakeDb([{ engagementId: "e1", launchedAt: null }]);
    Object.assign(db, fake);
    const POST = await importRoute();
    const res = await POST(new Request("http://x", { method: "POST" }), makeParams("e1"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(fake.update).toHaveBeenCalled();
    expect(data.launchedAt).toBeTruthy();
  });

  it("is idempotent — an already-launched engagement is not re-updated", async () => {
    const existing = "2026-01-01T00:00:00.000Z";
    const fake = fakeDb([{ engagementId: "e1", launchedAt: new Date(existing) }]);
    Object.assign(db, fake);
    const POST = await importRoute();
    const res = await POST(new Request("http://x", { method: "POST" }), makeParams("e1"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(fake.update).not.toHaveBeenCalled();
    expect(data.launchedAt).toBe(existing);
  });
});
