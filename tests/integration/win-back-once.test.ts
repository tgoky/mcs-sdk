// tests/integration/win-back-once.test.ts
//
// - One person could be in two Win-Back cadences at once (two enrollments
//   at the same moment, or a second booking's no-show while the first
//   cadence was still running), getting every email twice.
// - The no-show sweep runs every 15 minutes and records nothing until a
//   person approves, so each pass queued another approval item for the
//   same call.
import { describe, it, expect, afterAll, vi } from "vitest";
import crypto from "crypto";

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

const engagementId = `test-eng-winback-${crypto.randomUUID()}`;
const workspaceId = `test-ws-winback-${crypto.randomUUID()}`;
const whopUserId = `test-user-winback-${crypto.randomUUID()}`;

vi.mock("@/lib/engagement-skills", () => ({ isSkillEnabledForEngagement: async () => true }));
vi.mock("@/lib/notify", () => ({ notifyUser: async () => {} }));

d("Win-Back happens once", () => {
  afterAll(async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, winBackEnrollments, pendingActions, briefedCallsLog } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(pendingActions).where(eq(pendingActions.engagementId, engagementId));
    await db.delete(winBackEnrollments).where(eq(winBackEnrollments.engagementId, engagementId));
    await db.delete(briefedCallsLog).where(eq(briefedCallsLog.engagementId, engagementId));
    await db.delete(engagements).where(eq(engagements.engagementId, engagementId));
    await db.delete(workspaces).where(eq(workspaces.workspaceId, workspaceId));
  });

  it("keeps one active cadence per person", async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, winBackEnrollments } = await import("@/models/schema");
    const { eq, and } = await import("drizzle-orm");
    const { enrollInWinBackOnce } = await import("@/lib/win-back-enrollment");
    await db.insert(workspaces).values({ workspaceId, whopUserId, name: "Test Workspace" });
    await db.insert(engagements).values({ engagementId, whopUserId, workspaceId, buyer: "Test Buyer", stack: {} as never });

    const enroll = (email: string, sourceBookingId: string | null) =>
      enrollInWinBackOnce({ id: crypto.randomUUID(), engagementId, prospectEmail: email, prospectName: "Pat", runId: null, sourceBookingId, recoveryWindowDays: 30, status: "active" });

    // Two at once for the same person (different case, too): one cadence.
    const results = await Promise.all([enroll("pat@example.com", null), enroll("Pat@Example.com", null)]);
    expect(results.map((r) => r.status).sort()).toEqual(["already_active", "enrolled"]);
    // A second booking's no-show while that cadence runs: not a second one.
    expect((await enroll("pat@example.com", "booking_2")).status).toBe("already_active");

    const active = await db.select().from(winBackEnrollments).where(and(eq(winBackEnrollments.engagementId, engagementId), eq(winBackEnrollments.status, "active")));
    expect(active).toHaveLength(1);
  });

  it("queues one approval item per suspected no-show, however often the sweep runs", async () => {
    const { db } = await import("@/lib/db");
    const { pendingActions, briefedCallsLog } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    const { resolveCallOutcome } = await import("@/features/pre-call-read/server/outcome-resolution");
    await db.insert(briefedCallsLog).values({ engagementId, callId: `call_${crypto.randomUUID()}`, callTime: new Date(Date.now() - 3 * 3600_000), prospectEmail: "sam@example.com", prospectName: "Sam" }).returning();
    const [call] = await db.select({ callId: briefedCallsLog.callId }).from(briefedCallsLog).where(eq(briefedCallsLog.engagementId, engagementId));

    for (let pass = 0; pass < 3; pass++) {
      const result = await resolveCallOutcome({ engagementId, bookingId: call.callId, outcome: "no_show", source: "auto_sweep" });
      expect(result.winBack).toBe("pending_review");
    }
    const queued = await db.select().from(pendingActions).where(eq(pendingActions.engagementId, engagementId));
    expect(queued).toHaveLength(1);
  });
});
