// src/app/api/engagements/[id]/roster/route.ts
//
// Reads the ground-truth booking roster (src/lib/booking-roster.ts /
// models/schema.ts's bookingRoster) for one engagement across a date
// range — this is what powers the calendar/list/board views actually
// showing upcoming bookings instead of only past run diagnostics.
//
// LEFT JOINs briefedCallsLog on (engagementId, externalCallId = callId) to
// derive a real lifecycle status per booking without duplicating any state:
// no matching briefedCallsLog row means Pre-Call Read hasn't processed
// this call yet ("scheduled" — waiting on the nightly run); a row with
// briefDeliveredAt set means the brief already went out; failed
// research/synthesis status means it needs attention. bookingRoster.status
// = "cancelled" always wins regardless of brief state.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, bookingRoster, briefedCallsLog } from "@/models/schema";
import { getSession } from "@/lib/session";
import { and, eq, gte, lt } from "drizzle-orm";

export const runtime = "nodejs";
export const revalidate = 0;

export type RosterStatus = "scheduled" | "brief_delivered" | "brief_failed" | "cancelled";

export interface RosterEntry {
  id: string;
  externalCallId: string;
  prospectName: string | null;
  prospectEmail: string | null;
  prospectPhone: string | null;
  callTime: string;
  callEndTime: string | null;
  bookingPlatform: string | null;
  status: RosterStatus;
  briefDeliveredAt: string | null;
  destinationDelivered: string | null;
  briefText: string | null;
  runId: string | null;
}

function deriveRosterStatus(row: {
  bookingStatus: string;
  researchStatus: string | null;
  aiSynthesisStatus: string | null;
  briefDeliveredAt: Date | null;
}): RosterStatus {
  if (row.bookingStatus === "cancelled") return "cancelled";
  if (row.briefDeliveredAt) return "brief_delivered";
  if (row.researchStatus === "failed" || row.aiSynthesisStatus === "failed") return "brief_failed";
  return "scheduled";
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: engagementId } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [tenant] = await db
      .select({ engagementId: engagements.engagementId })
      .from(engagements)
      .where(and(eq(engagements.engagementId, engagementId), eq(engagements.whopUserId, session.whopUserId)))
      .limit(1);

    if (!tenant) {
      return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    // month: "YYYY-MM". Defaults to the current month. The calendar UI
    // requests one month at a time (plus it already fetches adjacent
    // months on navigation), so this stays a cheap indexed range scan
    // rather than ever pulling an engagement's entire booking history.
    // ?all=1 opts out of that for callers that genuinely want full
    // history (the Pre-Call-Read skill page's List/Board views).
    const wantsAll = searchParams.get("all") === "1";
    const monthParam = searchParams.get("month");
    const now = new Date();
    const [year, month] = monthParam?.match(/^\d{4}-\d{2}$/)
      ? monthParam.split("-").map(Number)
      : [now.getFullYear(), now.getMonth() + 1];

    // Widen slightly past the calendar month boundary — the grid shows a
    // few leading/trailing days from adjacent months, and those days'
    // bookings should still render instead of looking mysteriously empty.
    const rangeStart = new Date(Date.UTC(year, month - 1, 1));
    rangeStart.setUTCDate(rangeStart.getUTCDate() - 7);
    const rangeEnd = new Date(Date.UTC(year, month, 1));
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 7);

    const rows = await db
      .select({
        id: bookingRoster.id,
        externalCallId: bookingRoster.externalCallId,
        prospectName: bookingRoster.prospectName,
        prospectEmail: bookingRoster.prospectEmail,
        prospectPhone: bookingRoster.prospectPhone,
        callTime: bookingRoster.callTime,
        callEndTime: bookingRoster.callEndTime,
        bookingPlatform: bookingRoster.bookingPlatform,
        bookingStatus: bookingRoster.status,
        researchStatus: briefedCallsLog.researchStatus,
        aiSynthesisStatus: briefedCallsLog.aiSynthesisStatus,
        briefDeliveredAt: briefedCallsLog.briefDeliveredAt,
        destinationDelivered: briefedCallsLog.destinationDelivered,
        briefText: briefedCallsLog.briefText,
        runId: briefedCallsLog.runId,
      })
      .from(bookingRoster)
      .leftJoin(
        briefedCallsLog,
        and(eq(briefedCallsLog.engagementId, bookingRoster.engagementId), eq(briefedCallsLog.callId, bookingRoster.externalCallId))
      )
      .where(
        wantsAll
          ? eq(bookingRoster.engagementId, engagementId)
          : and(
              eq(bookingRoster.engagementId, engagementId),
              gte(bookingRoster.callTime, rangeStart),
              lt(bookingRoster.callTime, rangeEnd)
            )
      );

    const entries: RosterEntry[] = rows.map((r) => ({
      id: r.id,
      externalCallId: r.externalCallId,
      prospectName: r.prospectName,
      prospectEmail: r.prospectEmail,
      prospectPhone: r.prospectPhone,
      callTime: r.callTime.toISOString(),
      callEndTime: r.callEndTime ? r.callEndTime.toISOString() : null,
      bookingPlatform: r.bookingPlatform,
      status: deriveRosterStatus(r),
      briefDeliveredAt: r.briefDeliveredAt ? r.briefDeliveredAt.toISOString() : null,
      destinationDelivered: r.destinationDelivered,
      briefText: r.briefText,
      runId: r.runId,
    }));

    return NextResponse.json({ entries });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
