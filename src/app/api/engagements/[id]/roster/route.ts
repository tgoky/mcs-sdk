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
import { getActiveWorkspace } from "@/lib/workspace";
import { and, eq, gte, lt, inArray, desc } from "drizzle-orm";
import { deriveRosterStatus, type RosterStatus } from "@/lib/roster-status";

// Re-exported so existing consumers (pre-call-read-pipeline.tsx,
// master-roster-calendar.tsx) don't need an import-path change — the type
// itself now lives in src/lib/roster-status.ts alongside the function that
// derives it.
export type { RosterStatus };

export const runtime = "nodejs";
export const revalidate = 0;

export type ResearchStatus = "completed" | "skipped_low_confidence" | "failed" | null;
export type SynthesisStatus = "completed" | "failed" | null;
export type CallOutcome = "showed" | "no_show" | "rescheduled" | "cancelled" | null;
export type OutcomeSource = "dashboard" | "slack" | "recall_bot" | "auto_sweep" | null;
// Whether the sales-call outcome (not the brief-delivery pipeline status
// above — a distinct concern) is known yet. "awaiting_outcome" is new:
// the call's estimated end time has passed and nothing — not a manual
// click, not Recall telemetry, not the CRM check, not the auto-sweep —
// has resolved it yet. Previously the UI had no way to distinguish this
// from a call that's simply upcoming; both just showed as "scheduled"
// indefinitely. Same 90-minute default-duration convention crons.ts's
// assumed-no-show sweep uses, so this and the sweep agree on when a call
// is "over" without a real callEndTime to go on.
export type OutcomeStatus = "future" | "awaiting_outcome" | "resolved" | "cancelled";

const UNKNOWN_DURATION_DEFAULT_MS = 90 * 60 * 1000;

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
  // The heuristic model's pre-call prediction, only present when
  // show_rate_scoring_enabled was on for this booking — null just means
  // scoring wasn't enabled, not that anything failed.
  predictedShowProbability: number | null;
  // Fix: this used to read from showRateFeatures.actualOutcome, which is
  // only ever written when show-rate scoring is enabled for the booking
  // — so on any engagement without that feature on, this was null even
  // when a real outcome had been logged. resolveCallOutcome
  // (outcome-resolution.ts) always writes to briefOutcomeLog regardless
  // of show-rate scoring; that's the actual ground truth, and it's what
  // this now reads from — the same table pre-call-read-view.tsx's
  // CallCard and pile-on-pipeline's stage already read from, so the
  // roster finally agrees with the pages it's supposed to summarize.
  actualOutcome: CallOutcome;
  // From briefOutcomeLog's latest row for this booking — how the outcome
  // above was actually confirmed. Null means no outcome has been logged
  // yet (distinct from actualOutcome being null for a different reason,
  // e.g. show-rate scoring being off).
  outcomeSource: OutcomeSource;
  outcomeStatus: OutcomeStatus;
}

function deriveOutcomeStatus(row: {
  bookingStatus: string;
  callTime: Date;
  callEndTime: Date | null;
  outcome: CallOutcome;
  now: Date;
}): OutcomeStatus {
  if (row.bookingStatus === "cancelled") return "cancelled";
  if (row.outcome) return "resolved";
  const readyAt = row.callEndTime ?? new Date(row.callTime.getTime() + UNKNOWN_DURATION_DEFAULT_MS);
  return readyAt < row.now ? "awaiting_outcome" : "future";
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: engagementId } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const [tenant] = await db
      .select({ engagementId: engagements.engagementId })
      .from(engagements)
      .where(
        and(
          eq(engagements.engagementId, engagementId),
          eq(engagements.whopUserId, session.whopUserId),
          eq(engagements.workspaceId, activeWorkspace.workspaceId)
        )
      )
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
            .select({
              bookingId: briefOutcomeLog.bookingId,
              source: briefOutcomeLog.source,
              outcome: briefOutcomeLog.outcome,
              loggedAt: briefOutcomeLog.loggedAt,
            })
            .from(briefOutcomeLog)
            .where(and(eq(briefOutcomeLog.engagementId, engagementId), inArray(briefOutcomeLog.bookingId, bookingIds)))
            .orderBy(desc(briefOutcomeLog.loggedAt))
        : [];
    // First row wins per bookingId, since outcomeLogRows is already
    // ordered newest-first — append-only log, so "latest" is "current".
    const latestSourceByBooking = new Map<string, OutcomeSource>();
    const latestOutcomeByBooking = new Map<string, CallOutcome>();
    for (const row of outcomeLogRows) {
      if (!latestSourceByBooking.has(row.bookingId)) {
        latestSourceByBooking.set(row.bookingId, (row.source as OutcomeSource) ?? null);
        latestOutcomeByBooking.set(row.bookingId, (row.outcome as CallOutcome) ?? null);
      }
    }

    const requestNow = new Date();
    const entries: RosterEntry[] = rows.map((r) => {
      const outcome = latestOutcomeByBooking.get(r.externalCallId) ?? null;
      return {
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
        actualOutcome: outcome,
        outcomeSource: latestSourceByBooking.get(r.externalCallId) ?? null,
        outcomeStatus: deriveOutcomeStatus({
          bookingStatus: r.bookingStatus,
          callTime: r.callTime,
          callEndTime: r.callEndTime,
          outcome,
          now: requestNow,
        }),
      };
    });

    return NextResponse.json({ entries });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}