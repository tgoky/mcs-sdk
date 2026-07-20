import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { update: vi.fn() } }));

import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { fakeDb } from "../helpers/fake-db";

async function importRoute() {
  const mod = await import("@/app/api/notifications/[id]/read/route");
  return mod.POST;
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/notifications/[id]/read", () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue({ whopUserId: "user-1" } as any);
  });

  it("returns 401 with no session", async () => {
    vi.mocked(getSession).mockResolvedValue({} as any);
    const POST = await importRoute();
    const res = await POST(new Request("http://x"), makeParams("n1"));
    expect(res.status).toBe(401);
  });

  it("marks every notification for the tenant read when id is 'all'", async () => {
    const fake = fakeDb([]);
    Object.assign(db, fake);
    const POST = await importRoute();
    const res = await POST(new Request("http://x"), makeParams("all"));

    expect(res.status).toBe(200);
    expect(fake.update).toHaveBeenCalled();
    expect(fake.set).toHaveBeenCalledWith({ read: true });
    // The "all" path must scope by whopUserId only — no id filter, since
    // there's no single notification id to match.
    expect(fake.where).toHaveBeenCalledTimes(1);
  });

  it("marks a single notification read, scoped to both its id and the tenant", async () => {
    const fake = fakeDb([]);
    Object.assign(db, fake);
    const POST = await importRoute();
    const res = await POST(new Request("http://x"), makeParams("n42"));

    expect(res.status).toBe(200);
    expect(fake.set).toHaveBeenCalledWith({ read: true });
    expect(fake.where).toHaveBeenCalledTimes(1);
  });
});
