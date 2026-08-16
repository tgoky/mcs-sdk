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
//
// Also LEFT JOINs showRateFeatures on (engagementId, bookingId =
// externalCallId) — the same join key convention outcome-resolution.ts
// uses. Previously this route computed researchStatus/aiSynthesisStatus
// only to derive `status` and then threw both away before returning, and
// never touched showRateFeatures at all, even though the run-detail page
// (pre-call-read-view.tsx's matchLabel()) already renders personMatchScore
// for the exact same calls. That meant the engagement-level roster — the
// one place meant to show "every call this client has ever had" — was
// strictly less informative than the single-run page it's supposed to
// aggregate. Every field below already exists in the database; this is
// wiring, not new computation.
//
// Separately queries briefOutcomeLog (append-only, latest row per bookingId
// wins — same convention outcome-resolution.ts's resolveCallOutcome uses
// when reading `prior`) for `source`: which of the four resolution paths
// confirmed this call's outcome — a rep clicking the dashboard/Slack
// button, the Recall bot's own telemetry, or the assumed-no-show sweep
// (crons.ts), which itself checks crm-activity-check.ts's
// hasPostCallCrmActivity before defaulting to "no_show". Not a drizzle
// join because "latest row per bookingId" isn't a natural join shape here;
// same reduce-to-a-Map approach the roster route below already uses.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, bookingRoster, briefedCallsLog, showRateFeatures, briefOutcomeLog } from "@/models/schema";
import { getSession } from "@/lib/session";
import { and, eq, gte, lt, inArray, desc } from "drizzle-orm";

export const runtime = "nodejs";
export const revalidate = 0;

export type RosterStatus = "scheduled" | "brief_delivered" | "brief_failed" | "cancelled";
export type ResearchStatus = "completed" | "skipped_low_confidence" | "failed" | null;
export type SynthesisStatus = "completed" | "failed" | null;
export type CallOutcome = "showed" | "no_show" | "rescheduled" | "cancelled" | null;
export type OutcomeSource = "dashboard" | "slack" | "recall_bot" | "auto_sweep" | null;

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
  // Identity verification — same Rule-14 score the run-detail page shows,
  // now available at the roster level instead of only after clicking into
  // a specific run.
  personMatchScore: number | null;
  researchStatus: ResearchStatus;
  synthesisStatus: SynthesisStatus;
  // From showRateFeatures, when show_rate_scoring_enabled was on for this
  // booking. predictedShowProbability is the heuristic model's 0-100 call
  // made *before* the call happened; actualOutcome is the confirmed
  // ground truth once someone (rep, Recall bot, or the auto-sweep) logs
  // it. Both null just means scoring wasn't enabled for this engagement,
  // not that anything failed.
  predictedShowProbability: number | null;
  actualOutcome: CallOutcome;
  // From briefOutcomeLog's latest row for this booking — how the outcome
  // above was actually confirmed. Null means no outcome has been logged
  // yet (distinct from actualOutcome being null for a different reason,
  // e.g. show-rate scoring being off).
  outcomeSource: OutcomeSource;
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
        personMatchScore: briefedCallsLog.personMatchScore,
        predictedShowProbability: showRateFeatures.predictedShowProbability,
        actualOutcome: showRateFeatures.actualOutcome,
      })
      .from(bookingRoster)
      .leftJoin(
        briefedCallsLog,
        and(eq(briefedCallsLog.engagementId, bookingRoster.engagementId), eq(briefedCallsLog.callId, bookingRoster.externalCallId))
      )
      .leftJoin(
        showRateFeatures,
        and(eq(showRateFeatures.engagementId, bookingRoster.engagementId), eq(showRateFeatures.bookingId, bookingRoster.externalCallId))
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

    const bookingIds = rows.map((r) => r.externalCallId);
    const outcomeLogRows =
      bookingIds.length > 0
        ? await db
            .select({ bookingId: briefOutcomeLog.bookingId, source: briefOutcomeLog.source, loggedAt: briefOutcomeLog.loggedAt })
            .from(briefOutcomeLog)
            .where(and(eq(briefOutcomeLog.engagementId, engagementId), inArray(briefOutcomeLog.bookingId, bookingIds)))
            .orderBy(desc(briefOutcomeLog.loggedAt))
        : [];
    // First row wins per bookingId, since outcomeLogRows is already
    // ordered newest-first — append-only log, so "latest" is "current".
    const latestSourceByBooking = new Map<string, OutcomeSource>();
    for (const row of outcomeLogRows) {
      if (!latestSourceByBooking.has(row.bookingId)) {
        latestSourceByBooking.set(row.bookingId, (row.source as OutcomeSource) ?? null);
      }
    }

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
      personMatchScore: r.personMatchScore,
      researchStatus: (r.researchStatus as ResearchStatus) ?? null,
      synthesisStatus: (r.aiSynthesisStatus as SynthesisStatus) ?? null,
      predictedShowProbability: r.predictedShowProbability,
      actualOutcome: (r.actualOutcome as CallOutcome) ?? null,
      outcomeSource: latestSourceByBooking.get(r.externalCallId) ?? null,
    }));

    return NextResponse.json({ entries });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
