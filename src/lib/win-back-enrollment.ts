// src/lib/win-back-enrollment.ts
//
// One active Win-Back cadence per person. The dashboard/chat enrollment
// checked for an active cadence and then inserted (two at once could both
// pass), and the booking-webhook path only deduplicated per booking, so one
// person could end up in two cadences at once and get every email twice.
// Both paths now enroll through this: a lock on the person, the check, then
// the insert, in one transaction.
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { winBackEnrollments } from "@/models/schema";

type NewEnrollment = typeof winBackEnrollments.$inferInsert;

export type EnrollOutcome =
  | { status: "enrolled"; id: string }
  | { status: "already_active"; existingId: string }
  | { status: "already_enrolled_for_booking" };

export async function enrollInWinBackOnce(values: NewEnrollment & { id: string; engagementId: string; prospectEmail: string }): Promise<EnrollOutcome> {
  const person = `${values.engagementId}:${values.prospectEmail.trim().toLowerCase()}`;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${person}))`);
    const [active] = await tx
      .select({ id: winBackEnrollments.id })
      .from(winBackEnrollments)
      .where(
        and(
          eq(winBackEnrollments.engagementId, values.engagementId),
          sql`lower(${winBackEnrollments.prospectEmail}) = ${values.prospectEmail.trim().toLowerCase()}`,
          eq(winBackEnrollments.status, "active")
        )
      )
      .limit(1);
    if (active) return { status: "already_active", existingId: active.id };

    // The unique index on (engagementId, sourceBookingId) still settles two
    // deliveries for the same booking.
    const [row] = await tx
      .insert(winBackEnrollments)
      .values(values)
      .onConflictDoNothing({ target: [winBackEnrollments.engagementId, winBackEnrollments.sourceBookingId] })
      .returning({ id: winBackEnrollments.id });
    return row ? { status: "enrolled", id: row.id } : { status: "already_enrolled_for_booking" };
  });
}
