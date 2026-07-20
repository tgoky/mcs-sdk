import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn() } }));

import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { fakeDb } from "../helpers/fake-db";

async function importRoute() {
  // Re-imported fresh per test file run; route module has no per-test state.
  const mod = await import("@/app/api/skill-runs/recent/route");
  return mod.GET;
}

function run(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "run-1",
    skillName: "pile-on",
    status: "success",
    phase: null,
    startedAt: new Date("2026-07-01T00:00:00Z"),
    completedAt: null,
    engagementId: "eng-1",
    buyerName: "Sarah Jenkins",
    errorMessage: null,
    steps: null,
    stepCount: 0,
    ...overrides,
  };
}

describe("GET /api/skill-runs/recent", () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue({ whopUserId: "user-1" } as any);
  });

  it("returns 401 when there's no authenticated session", async () => {
    vi.mocked(getSession).mockResolvedValue({} as any);
    const GET = await importRoute();
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the tenant's runs shaped for the client", async () => {
    Object.assign(db, fakeDb([run()]));
    const GET = await importRoute();
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.runs).toHaveLength(1);
    expect(body.runs[0]).toMatchObject({
      id: "run-1",
      skillName: "pile-on",
      buyerName: "Sarah Jenkins",
    });
    // The raw `steps` array is never sent to the client — only the
    // extracted subjectLabel. Leaking the full step log would expose
    // internal phase codenames and buyer PII into a payload polled every
    // 5 seconds by a component with no reason to hold it.
    expect(body.runs[0]).not.toHaveProperty("steps");
  });

  it("extracts subjectLabel from the most recent non-empty step label", async () => {
    Object.assign(
      db,
      fakeDb([
        run({
          steps: [
            { label: "Run started" },
            { label: "" }, // blank labels should be skipped, not treated as "found"
            { label: "  Priya Patel <priya@example.com>  " },
          ],
        }),
      ])
    );
    const GET = await importRoute();
    const res = await GET();
    const body = await res.json();
    expect(body.runs[0].subjectLabel).toBe("Priya Patel <priya@example.com>");
  });

  it("returns null subjectLabel when there are no steps yet", async () => {
    Object.assign(db, fakeDb([run({ steps: null })]));
    const GET = await importRoute();
    const res = await GET();
    const body = await res.json();
    expect(body.runs[0].subjectLabel).toBeNull();
  });

  it("returns null subjectLabel when every step label is blank", async () => {
    Object.assign(db, fakeDb([run({ steps: [{ label: "" }, { label: "   " }] })]));
    const GET = await importRoute();
    const res = await GET();
    const body = await res.json();
    expect(body.runs[0].subjectLabel).toBeNull();
  });

  it("scopes the query to the caller's whopUserId (tenant isolation)", async () => {
    const fake = fakeDb([run()]);
    Object.assign(db, fake);
    const GET = await importRoute();
    await GET();
    // The where() clause is built from drizzle's eq(engagements.whopUserId, ...)
    // — we can't easily inspect the SQL from a mock, but we can confirm the
    // handler actually calls .where() at all (i.e. it isn't accidentally
    // scanning every tenant's runs unfiltered).
    expect(fake.where).toHaveBeenCalled();
  });

  it("returns 500 and never throws when the database call fails", async () => {
    Object.assign(db, {
      select: vi.fn(() => {
        throw new Error("connection reset");
      }),
    });
    const GET = await importRoute();
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});
