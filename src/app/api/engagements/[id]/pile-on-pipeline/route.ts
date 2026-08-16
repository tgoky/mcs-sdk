import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, pileOnSendLog, sequenceMessageLog, bookingRoster } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { and, eq, inArray } from "drizzle-orm";

export const runtime = "nodejs";
export const revalidate = 0;

export type PileOnStage = "newly_booked" | "active_sequence" | "sequence_complete" | "call_today";

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

    const sends = await db
      .select()
      .from(pileOnSendLog)
      .where(eq(pileOnSendLog.engagementId, engagementId))
      .orderBy(pileOnSendLog.createdAt);

    const bookingIds = sends.map((s) => s.bookingId);

    const [sentRows, rosterRows] = await Promise.all([
      bookingIds.length > 0
        ? db
            .select({ bookingId: sequenceMessageLog.bookingId, messageId: sequenceMessageLog.messageId })
            .from(sequenceMessageLog)
            .where(
              and(
                eq(sequenceMessageLog.engagementId, engagementId),
                eq(sequenceMessageLog.sequenceType, "pile_on_sms"),
                eq(sequenceMessageLog.status, "sent"),
                inArray(sequenceMessageLog.bookingId, bookingIds)
              )
            )
        : Promise.resolve([]),
      bookingIds.length > 0
        ? db
            .select({ externalCallId: bookingRoster.externalCallId, callTime: bookingRoster.callTime, prospectName: bookingRoster.prospectName })
            .from(bookingRoster)
            .where(and(eq(bookingRoster.engagementId, engagementId), inArray(bookingRoster.externalCallId, bookingIds)))
        : Promise.resolve([]),
    ]);

    const sentByBooking = new Map<string, Set<string>>();
    for (const row of sentRows) {
      if (!row.bookingId) continue;
      if (!sentByBooking.has(row.bookingId)) sentByBooking.set(row.bookingId, new Set());
      sentByBooking.get(row.bookingId)!.add(row.messageId);
    }
    const rosterByBooking = new Map(rosterRows.map((r) => [r.externalCallId, r]));

    const todayKey = new Date().toISOString().slice(0, 10);

    const items: PileOnPipelineItem[] = sends.map((s) => {
      const touchesSent = (sentByBooking.get(s.bookingId) ?? new Set()).size;
      const roster = rosterByBooking.get(s.bookingId) ?? null;
      const callTime = roster?.callTime ?? null;
      const isCallToday = callTime ? callTime.toISOString().slice(0, 10) === todayKey : false;

      let stage: PileOnStage;
      if (isCallToday) stage = "call_today";
      else if (touchesSent === 0) stage = "newly_booked";
      else if (touchesTotal > 0 && touchesSent >= touchesTotal) stage = "sequence_complete";
      else stage = "active_sequence";

      return {
        id: s.id,
        bookingId: s.bookingId,
        prospectEmail: s.prospectEmail,
        sentVia: s.sentVia,
        runId: s.runId,
        createdAt: s.createdAt.toISOString(),
        touchesSent,
        touchesTotal,
        callTime: callTime ? callTime.toISOString() : null,
        prospectName: roster?.prospectName ?? null,
        stage,
        personalizedIntro: s.personalizedIntro,
        sendError: s.error,
      };
    });

    return NextResponse.json({ items, weeklyTrend: computeWeeklyTrend(sends) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function computeWeeklyTrend(sends: { createdAt: Date }[]): PileOnWeeklyTrend {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const weekAgo = now - weekMs;
  const twoWeeksAgo = now - 2 * weekMs;
  let thisWeek = 0;
  let priorWeek = 0;
  for (const s of sends) {
    const t = s.createdAt.getTime();
    if (t >= weekAgo) thisWeek++;
    else if (t >= twoWeeksAgo) priorWeek++;
  }
  return { thisWeek, priorWeek };
}