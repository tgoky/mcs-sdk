// tests/integration/win-back-enrollment-race.test.ts
//
// enrollment-service.ts's cancelled branch used to SELECT for an existing
// winBackEnrollments row keyed by sourceBookingId, check it was empty in
// JS, and only later INSERT — a check-then-act gap with no lock between
// the read and the write, despite the code's own comment calling it "the
// authoritative check." The same booking can legitimately reach this
// branch from more than one source at nearly the same instant — a real
// booking.cancelled webhook, a rep's Slack/dashboard click, Recall bot
// telemetry, or the assumed-no-show sweep (see outcome-resolution.ts) —
// and nothing serializes the resulting Inngest invocations against each
// other. Two concurrent deliveries for the same booking could both see
// "not enrolled yet" and both insert, double-enrolling (and
// double-emailing/texting) one prospect for one missed call.
//
// This proves the fix directly against the real schema: winBackEnrollments
// now has a genuine unique index on (engagementId, sourceBookingId), and
// the insert uses onConflictDoNothing as an atomic claim — exercised here
// exactly as enrollment-service.ts's cancelled branch runs it.
import { describe, it, expect, afterEach } from "vitest";
import crypto from "crypto";

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

d("winBackEnrollments — concurrent double-enrollment race on the same booking", () => {
  const engagementId = `test-eng-winback-${crypto.randomUUID()}`;
  const workspaceId = `test-ws-winback-${crypto.randomUUID()}`;
  const whopUserId = `test-user-winback-${crypto.randomUUID()}`;
  const bookingId = `booking-${crypto.randomUUID()}`;

  afterEach(async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, winBackEnrollments } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(winBackEnrollments).where(eq(winBackEnrollments.engagementId, engagementId));
    await db.delete(engagements).where(eq(engagements.engagementId, engagementId));
    await db.delete(workspaces).where(eq(workspaces.workspaceId, workspaceId));
  });

  it("two concurrent enrollment attempts for the same booking: exactly one row lands", async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, winBackEnrollments } = await import("@/models/schema");
    const { eq, and } = await import("drizzle-orm");

    await db.insert(workspaces).values({ workspaceId, whopUserId, name: "Test Workspace" });
    await db.insert(engagements).values({ engagementId, whopUserId, workspaceId, buyer: "Test Buyer" });

    // Mirrors enrollment-service.ts's cancelled-branch claim exactly — the
    // atomic INSERT ... ON CONFLICT DO NOTHING that replaced the old
    // SELECT-then-INSERT.
    const claimEnrollment = (prospectEmail: string) =>
      db
        .insert(winBackEnrollments)
        .values({
          id: crypto.randomUUID(),
          engagementId,
          prospectEmail,
          prospectName: "Test Prospect",
          recoveryWindowDays: 30,
          status: "active",
          sourceBookingId: bookingId,
        })
        .onConflictDoNothing({ target: [winBackEnrollments.engagementId, winBackEnrollments.sourceBookingId] })
        .returning({ id: winBackEnrollments.id });

    // Two "different sources" racing for the same booking — e.g. a
    // platform webhook and a rep's Slack click landing at nearly the same
    // instant, exactly the scenario the module's own header documents.
    const [a, b] = await Promise.all([
      claimEnrollment("prospect@example.com"),
      claimEnrollment("prospect@example.com"),
    ]);

    const claimedCount = [a, b].filter((r) => r.length > 0).length;
    expect(claimedCount).toBe(1); // exactly one insert lands — the other's onConflictDoNothing returns zero rows, not a throw and not a second row

    const rows = await db
      .select()
      .from(winBackEnrollments)
      .where(and(eq(winBackEnrollments.engagementId, engagementId), eq(winBackEnrollments.sourceBookingId, bookingId)));
    expect(rows).toHaveLength(1); // never double-enrolled in the DB, regardless of how many sources raced for it
  });

  it("a legacy row with a null sourceBookingId never blocks a real enrollment", async () => {
    // Confirms the unique index's nullability behavior matches Postgres
    // semantics (NULL is distinct from NULL) — legacy rows enrolled
    // before sourceBookingId existed must never collide with each other
    // or with a real, keyed enrollment.
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, winBackEnrollments } = await import("@/models/schema");
    const { eq, and, isNull } = await import("drizzle-orm");

    await db.insert(workspaces).values({ workspaceId, whopUserId, name: "Test Workspace" });
    await db.insert(engagements).values({ engagementId, whopUserId, workspaceId, buyer: "Test Buyer" });

    const insertLegacyRow = (email: string) =>
      db.insert(winBackEnrollments).values({
        id: crypto.randomUUID(),
        engagementId,
        prospectEmail: email,
        prospectName: "Legacy Prospect",
        recoveryWindowDays: 30,
        status: "active",
        sourceBookingId: null,
      });

    await insertLegacyRow("legacy1@example.com");
    await insertLegacyRow("legacy2@example.com"); // must not throw — two nulls are not a conflict

    const [keyed] = await db
      .insert(winBackEnrollments)
      .values({
        id: crypto.randomUUID(),
        engagementId,
        prospectEmail: "real@example.com",
        prospectName: "Real Prospect",
        recoveryWindowDays: 30,
        status: "active",
        sourceBookingId: bookingId,
      })
      .onConflictDoNothing({ target: [winBackEnrollments.engagementId, winBackEnrollments.sourceBookingId] })
      .returning({ id: winBackEnrollments.id });
    expect(keyed).toBeDefined(); // real, keyed enrollment succeeds independent of the legacy nulls

    const legacyRows = await db
      .select()
      .from(winBackEnrollments)
      .where(and(eq(winBackEnrollments.engagementId, engagementId), isNull(winBackEnrollments.sourceBookingId)));
    expect(legacyRows).toHaveLength(2);
  });
});
