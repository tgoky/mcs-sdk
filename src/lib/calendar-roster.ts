// src/lib/calendar-roster.ts
//
// Backs /dashboard/calendar — the account-wide "senior brother" of the
// per-engagement master roster (src/app/dashboard/engagements/[id]/
// master-roster-calendar.tsx): every client's booked calls, on one
// timeline, instead of opening one engagement at a time.
//
// Scope of this first pass, stated plainly rather than silently: this
// covers the booking-roster layer only (Pin-Down/Pile-On/Pre-Call-Read
// calls) — the same layer src/app/api/engagements/[id]/roster/route.ts
// serves per-engagement, aggregated across clients with the exact same
// status-derivation logic (see src/lib/roster-status.ts, extracted from
// that route so both stay in lockstep). Win-Back recovery-cadence steps
// and Leak Map audit dates are a real next layer for this same query, not
// a different page — deliberately left out of this pass rather than
// guessed at, same reasoning outlined for the still-unbuilt panels.
import { db } from "@/lib/db";
import { engagements, bookingRoster, briefedCallsLog } from "@/models/schema";
import { and, eq, gte, lt, isNull, inArray } from "drizzle-orm";
import { deriveRosterStatus, type RosterStatus } from "@/lib/roster-status";

export interface CalendarCallEntry {
  id: string;
  engagementId: string;
  buyer: string;
  externalCallId: string;
  prospectName: string | null;
  callTime: string;
  callEndTime: string | null;
  status: RosterStatus;
  runId: string | null;
}

/**
 * Every client's booked calls in [rangeStart, rangeEnd) for one tenant/
 * workspace, newest-first-by-time within each day once the caller groups
 * them. Same two-step "collect ids, then batch-join briefedCallsLog"
 * shape the per-engagement roster route uses, just seeded from every
 * engagement's bookings instead of one.
 */
export async function getCallsAcrossEngagements(
  whopUserId: string,
  workspaceId: string,
  rangeStart: Date,
  rangeEnd: Date
): Promise<CalendarCallEntry[]> {
  const clientEngagements = await db
    .select({ engagementId: engagements.engagementId, buyer: engagements.buyer })
    .from(engagements)
    .where(and(eq(engagements.whopUserId, whopUserId), eq(engagements.workspaceId, workspaceId), isNull(engagements.deletedAt)));

  if (clientEngagements.length === 0) return [];
  const buyerByEngagementId = new Map(clientEngagements.map((e) => [e.engagementId, e.buyer]));
  const engagementIds = clientEngagements.map((e) => e.engagementId);

  const rows = await db
    .select({
      id: bookingRoster.id,
      engagementId: bookingRoster.engagementId,
      externalCallId: bookingRoster.externalCallId,
      prospectName: bookingRoster.prospectName,
      callTime: bookingRoster.callTime,
      callEndTime: bookingRoster.callEndTime,
      bookingStatus: bookingRoster.status,
      researchStatus: briefedCallsLog.researchStatus,
      aiSynthesisStatus: briefedCallsLog.aiSynthesisStatus,
      briefDeliveredAt: briefedCallsLog.briefDeliveredAt,
      runId: briefedCallsLog.runId,
    })
    .from(bookingRoster)
    .leftJoin(
      briefedCallsLog,
      and(eq(briefedCallsLog.engagementId, bookingRoster.engagementId), eq(briefedCallsLog.callId, bookingRoster.externalCallId))
    )
    .where(
      and(inArray(bookingRoster.engagementId, engagementIds), gte(bookingRoster.callTime, rangeStart), lt(bookingRoster.callTime, rangeEnd))
    );

  return rows
    .map((r) => ({
      id: r.id,
      engagementId: r.engagementId,
      buyer: buyerByEngagementId.get(r.engagementId) ?? "Unknown client",
      externalCallId: r.externalCallId,
      prospectName: r.prospectName,
      callTime: r.callTime.toISOString(),
      callEndTime: r.callEndTime ? r.callEndTime.toISOString() : null,
      status: deriveRosterStatus({
        bookingStatus: r.bookingStatus,
        researchStatus: r.researchStatus,
        aiSynthesisStatus: r.aiSynthesisStatus,
        briefDeliveredAt: r.briefDeliveredAt,
      }),
      runId: r.runId,
    }))
    .sort((a, b) => a.callTime.localeCompare(b.callTime));
}
