import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn(), update: vi.fn() } }));

import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { fakeDb } from "../helpers/fake-db";

async function importRoute() {
  return import("@/app/api/engagements/[id]/bridges/leak-map/route");
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

describe("GET /api/engagements/[id]/bridges/leak-map", () => {
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

  it("defaults to sane values when never configured", async () => {
    Object.assign(db, fakeDb([{ buyer: "Acme", stack: {} }]));
    const { GET } = await importRoute();
    const res = await GET(new Request("http://x"), makeParams("e1"));
    const data = await res.json();

    expect(data.weeklyScheduleDayOfWeek).toBe(1);
    expect(data.weeklyScheduleHour).toBe(9);
    expect(data.monthlyScheduleDayOfMonth).toBe(1);
    expect(data.leakMapTimezone).toBe("UTC");
    expect(data.auditOutputFormat).toBe("dashboard_only");
  });

  it("pre-fills from the nested schedule objects when already configured", async () => {
    Object.assign(
      db,
      fakeDb([
        {
          buyer: "Acme",
          stack: {
            weekly_summary_schedule: { dayOfWeek: 3, hourLocal: 14, timezone: "America/New_York" },
            monthly_deep_dive_schedule: { dayOfMonth: 15, hourLocal: 14, timezone: "America/New_York" },
            audit_output_format: "email",
            leak_map_report_email: "ops@acme.com",
          },
        },
      ])
    );
    const { GET } = await importRoute();
    const res = await GET(new Request("http://x"), makeParams("e1"));
    const data = await res.json();

    expect(data.weeklyScheduleDayOfWeek).toBe(3);
    expect(data.monthlyScheduleDayOfMonth).toBe(15);
    expect(data.leakMapTimezone).toBe("America/New_York");
    expect(data.auditOutputFormat).toBe("email");
    expect(data.leakMapReportEmail).toBe("ops@acme.com");
  });
});

describe("POST /api/engagements/[id]/bridges/leak-map", () => {
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

  it("rejects email delivery with no recipient", async () => {
    const { POST } = await importRoute();
    const res = await POST(postBody({ auditOutputFormat: "email", leakMapReportEmail: "" }), makeParams("e1"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the engagement isn't found or isn't owned by this tenant", async () => {
    Object.assign(db, fakeDb([]));
    const { POST } = await importRoute();
    const res = await POST(postBody({}), makeParams("e1"));
    expect(res.status).toBe(404);
  });

  it("clamps day-of-month to 28 so it always fires in February", async () => {
    const fake = fakeDb([{ engagementId: "e1", stack: {} }]);
    Object.assign(db, fake);
    const { POST } = await importRoute();
    await POST(postBody({ monthlyScheduleDayOfMonth: 31 }), makeParams("e1"));

    expect(fake.set).toHaveBeenCalledWith(
      expect.objectContaining({
        stack: expect.objectContaining({
          monthly_deep_dive_schedule: expect.objectContaining({ dayOfMonth: 28 }),
        }),
      })
    );
  });

  it("clamps an invalid hour to the fallback rather than rejecting the request", async () => {
    const fake = fakeDb([{ engagementId: "e1", stack: {} }]);
    Object.assign(db, fake);
    const { POST } = await importRoute();
    await POST(postBody({ weeklyScheduleHour: "not-a-number" }), makeParams("e1"));

    expect(fake.set).toHaveBeenCalledWith(
      expect.objectContaining({
        stack: expect.objectContaining({
          weekly_summary_schedule: expect.objectContaining({ hourLocal: 9 }),
        }),
      })
    );
  });

  it("merges into the existing stack instead of overwriting it", async () => {
    const fake = fakeDb([{ engagementId: "e1", stack: { booking_platform: "calendly" } }]);
    Object.assign(db, fake);
    const { POST } = await importRoute();
    const res = await POST(
      postBody({ weeklyScheduleDayOfWeek: 3, leakMapTimezone: "America/New_York", auditOutputFormat: "dashboard_only" }),
      makeParams("e1")
    );

    expect(res.status).toBe(200);
    expect(fake.set).toHaveBeenCalledWith(
      expect.objectContaining({
        stack: expect.objectContaining({
          booking_platform: "calendly",
          weekly_summary_schedule: expect.objectContaining({ dayOfWeek: 3, timezone: "America/New_York" }),
          monthly_deep_dive_schedule: expect.objectContaining({ timezone: "America/New_York" }),
        }),
      })
    );
  });

  it("keeps both schedules on the same hour, sourced from weeklyScheduleHour", async () => {
    const fake = fakeDb([{ engagementId: "e1", stack: {} }]);
    Object.assign(db, fake);
    const { POST } = await importRoute();
    await POST(postBody({ weeklyScheduleHour: 20 }), makeParams("e1"));

    expect(fake.set).toHaveBeenCalledWith(
      expect.objectContaining({
        stack: expect.objectContaining({
          weekly_summary_schedule: expect.objectContaining({ hourLocal: 20 }),
          monthly_deep_dive_schedule: expect.objectContaining({ hourLocal: 20 }),
        }),
      })
    );
  });
});
