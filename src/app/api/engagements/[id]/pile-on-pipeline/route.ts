import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, pileOnSendLog, sequenceMessageLog, bookingRoster, briefOutcomeLog } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { and, desc, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const revalidate = 0;

export type PileOnStage =
  | "newly_booked"
  | "active_sequence"
  | "sequence_complete"
  | "call_today"
  | "call_passed"
  | "showed"
  | "no_show"
  | "cancelled";

export interface PileOnPipelineItem {
  id: string;
  bookingId: string;
  prospectEmail: string;
  sentVia: string;
  runId: string | null;
  createdAt: string;
  touchesSent: number;
  touchesTotal: number;
  callTime: string | null;
  prospectName: string | null;
  stage: PileOnStage;
  personalizedIntro: string | null;
  sendError: string | null;
}

export interface PileOnWeeklyTrend {
  thisWeek: number;
  priorWeek: number;
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
      .select({ engagementId: engagements.engagementId, pileOnSmsAssetMap: engagements.pileOnSmsAssetMap })
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

    const touchesTotal = tenant.pileOnSmsAssetMap?.messages.length ?? 0;

    // Concurrently fetch roster bookings, send logs, sequence logs, and call outcomes
    const [rosterRows, sends, sentRows, outcomeRows] = await Promise.all([
      db
        .select()
        .from(bookingRoster)
        .where(eq(bookingRoster.engagementId, engagementId))
        .orderBy(desc(bookingRoster.createdAt)),
      db
        .select()
        .from(pileOnSendLog)
        .where(eq(pileOnSendLog.engagementId, engagementId))
        .orderBy(desc(pileOnSendLog.createdAt)),
      db
        .select({ bookingId: sequenceMessageLog.bookingId, messageId: sequenceMessageLog.messageId })
        .from(sequenceMessageLog)
        .where(
          and(
            eq(sequenceMessageLog.engagementId, engagementId),
            eq(sequenceMessageLog.sequenceType, "pile_on_sms"),
            eq(sequenceMessageLog.status, "sent")
          )
        ),
      db
        .select({ bookingId: briefOutcomeLog.bookingId, outcome: briefOutcomeLog.outcome })
        .from(briefOutcomeLog)
        .where(eq(briefOutcomeLog.engagementId, engagementId))
        .orderBy(desc(briefOutcomeLog.loggedAt)),
    ]);

    // Map lookups for fast correlation
    const sendLogByBooking = new Map<string, (typeof sends)[number]>();
    for (const s of sends) {
      if (!sendLogByBooking.has(s.bookingId)) {
        sendLogByBooking.set(s.bookingId, s);
      }
    }

    const sentByBooking = new Map<string, Set<string>>();
    for (const row of sentRows) {
      if (!row.bookingId) continue;
      if (!sentByBooking.has(row.bookingId)) sentByBooking.set(row.bookingId, new Set());
      sentByBooking.get(row.bookingId)!.add(row.messageId);
    }

    const outcomeByBooking = new Map<string, string>();
    for (const row of outcomeRows) {
      if (!row.bookingId || outcomeByBooking.has(row.bookingId)) continue;
      outcomeByBooking.set(row.bookingId, row.outcome);
    }

    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const items: PileOnPipelineItem[] = [];
    const seenBookingIds = new Set<string>();

    // 1. Process ground-truth roster bookings with time & outcome consciousness
    for (const r of rosterRows) {
      const bookingId = r.externalCallId;
      seenBookingIds.add(bookingId);

      const sendLog = sendLogByBooking.get(bookingId);
      const touchesSent = (sentByBooking.get(bookingId) ?? new Set()).size;
      const callTime = r.callTime ?? null;
      const callTimeMs = callTime ? callTime.getTime() : null;

      const isCallToday = callTime ? callTime.toISOString().slice(0, 10) === todayKey : false;
      const isCallPast = callTimeMs ? callTimeMs < now.getTime() : false;
      const loggedOutcome = outcomeByBooking.get(bookingId);

      let stage: PileOnStage;

      if (r.status === "cancelled") {
        stage = "cancelled";
      } else if (loggedOutcome === "showed") {
        stage = "showed";
      } else if (loggedOutcome === "no_show") {
        stage = "no_show";
      } else if (isCallPast) {
        stage = "call_passed";
      } else if (isCallToday) {
        stage = "call_today";
      } else {
        if (touchesTotal > 0 && touchesSent >= touchesTotal) stage = "sequence_complete";
        else if (touchesSent > 0) stage = "active_sequence";
        else stage = "newly_booked";
      }

      items.push({
        id: sendLog?.id ?? r.id,
        bookingId,
        prospectEmail: r.prospectEmail ?? sendLog?.prospectEmail ?? "Unknown",
        sentVia: sendLog?.sentVia ?? "standard",
        runId: sendLog?.runId ?? null,
        createdAt: (sendLog?.createdAt ?? r.createdAt).toISOString(),
        touchesSent,
        touchesTotal,
        callTime: callTime ? callTime.toISOString() : null,
        prospectName: r.prospectName ?? null,
        stage,
        personalizedIntro: sendLog?.personalizedIntro ?? null,
        sendError: sendLog?.error ?? null,
      });
    }

    // 2. Include standalone send logs not present in bookingRoster
    for (const s of sends) {
      if (seenBookingIds.has(s.bookingId)) continue;
      seenBookingIds.add(s.bookingId);

      const touchesSent = (sentByBooking.get(s.bookingId) ?? new Set()).size;
      const loggedOutcome = outcomeByBooking.get(s.bookingId);

      let stage: PileOnStage;
      if (loggedOutcome === "showed") {
        stage = "showed";
      } else if (loggedOutcome === "no_show") {
        stage = "no_show";
      } else if (touchesSent === 0) {
        stage = "newly_booked";
      } else if (touchesTotal > 0 && touchesSent >= touchesTotal) {
        stage = "sequence_complete";
      } else {
        stage = "active_sequence";
      }

      items.push({
        id: s.id,
        bookingId: s.bookingId,
        prospectEmail: s.prospectEmail,
        sentVia: s.sentVia,
        runId: s.runId,
        createdAt: s.createdAt.toISOString(),
        touchesSent,
        touchesTotal,
        callTime: null,
        prospectName: null,
        stage,
        personalizedIntro: s.personalizedIntro,
        sendError: s.error,
      });
    }

    // Order items newest created first
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const allCreationDates = items.map((i) => new Date(i.createdAt));

    return NextResponse.json({ items, weeklyTrend: computeWeeklyTrend(allCreationDates) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function computeWeeklyTrend(timestamps: Date[]): PileOnWeeklyTrend {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const weekAgo = now - weekMs;
  const twoWeeksAgo = now - 2 * weekMs;
  let thisWeek = 0;
  let priorWeek = 0;
  for (const tDate of timestamps) {
    const t = tDate.getTime();
    if (t >= weekAgo) thisWeek++;
    else if (t >= twoWeeksAgo) priorWeek++;
  }
  return { thisWeek, priorWeek };
}