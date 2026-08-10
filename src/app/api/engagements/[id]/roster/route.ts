// src/app/api/engagements/[id]/roster/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  engagements,
  bookingRoster,
  briefedCallsLog,
  pileOnSendLog,
  winBackEnrollments,
} from "@/models/schema";
import { getSession } from "@/lib/session";
import { and, eq, gte, inArray, lt } from "drizzle-orm";

export const runtime = "nodejs";
export const revalidate = 0;

export type PreCallStatus = "scheduled" | "brief_delivered" | "brief_failed" | "cancelled";
export type PileOnStatus = "hybrid_sent" | "fallback_sent" | "pending" | "none";
export type WinBackStatus = "active" | "rebooked" | "lost" | "reply_exited" | "none";

export interface MasterRosterEntry {
  id: string;
  externalCallId: string;
  prospectName: string | null;
  prospectEmail: string | null;
  prospectPhone: string | null;
  callTime: string;
  callEndTime: string | null;
  bookingPlatform: string | null;
  bookingStatus: "scheduled" | "cancelled";
  preCallRead: {
    status: PreCallStatus;
    briefDeliveredAt: string | null;
    destinationDelivered: string | null;
    briefText: string | null;
    runId: string | null;
  };
  pileOn: {
    status: PileOnStatus;
    personalizedIntro: string | null;
    sentAt: string | null;
  };
  winBack: {
    status: WinBackStatus;
    freshRescheduleLink: string | null;
    exitReason: string | null;
    enrolledAt: string | null;
  };
}

function derivePreCallStatus(row: {
  bookingStatus: string;
  researchStatus: string | null;
  aiSynthesisStatus: string | null;
  briefDeliveredAt: Date | null;
}): PreCallStatus {
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
    const monthParam = searchParams.get("month");
    const now = new Date();
    const [year, month] = monthParam?.match(/^\d{4}-\d{2}$/)
      ? monthParam.split("-").map(Number)
      : [now.getFullYear(), now.getMonth() + 1];

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
        and(
          eq(bookingRoster.engagementId, engagementId),
          gte(bookingRoster.callTime, rangeStart),
          lt(bookingRoster.callTime, rangeEnd)
        )
      );

    if (rows.length === 0) {
      return NextResponse.json({ entries: [] });
    }

    const bookingIds = rows.map((r) => r.externalCallId);
    const prospectEmails = rows.map((r) => r.prospectEmail).filter((e): e is string => Boolean(e));

    const [pileOnLogs, winBackRows] = await Promise.all([
      bookingIds.length > 0
        ? db
            .select({
              bookingId: pileOnSendLog.bookingId,
              sentVia: pileOnSendLog.sentVia,
              personalizedIntro: pileOnSendLog.personalizedIntro,
              createdAt: pileOnSendLog.createdAt,
            })
            .from(pileOnSendLog)
            .where(and(eq(pileOnSendLog.engagementId, engagementId), inArray(pileOnSendLog.bookingId, bookingIds)))
        : [],
      prospectEmails.length > 0
        ? db
            .select({
              prospectEmail: winBackEnrollments.prospectEmail,
              status: winBackEnrollments.status,
              freshRescheduleLink: winBackEnrollments.freshRescheduleLink,
              exitReason: winBackEnrollments.exitReason,
              enrolledAt: winBackEnrollments.enrolledAt,
            })
            .from(winBackEnrollments)
            .where(and(eq(winBackEnrollments.engagementId, engagementId), inArray(winBackEnrollments.prospectEmail, prospectEmails)))
        : [],
    ]);

    const pileOnMap = new Map(pileOnLogs.map((p) => [p.bookingId, p]));
    const winBackMap = new Map(winBackRows.map((w) => [w.prospectEmail.toLowerCase(), w]));

    const entries: MasterRosterEntry[] = rows.map((r) => {
      const pileOn = pileOnMap.get(r.externalCallId);
      const winBack = r.prospectEmail ? winBackMap.get(r.prospectEmail.toLowerCase()) : undefined;

      let pileOnStatus: PileOnStatus = "none";
      if (pileOn) {
        pileOnStatus = pileOn.sentVia === "hybrid" ? "hybrid_sent" : "fallback_sent";
      }

      let wbStatus: WinBackStatus = "none";
      if (winBack) {
        wbStatus = (winBack.status as WinBackStatus) ?? "none";
      }

      return {
        id: r.id,
        externalCallId: r.externalCallId,
        prospectName: r.prospectName,
        prospectEmail: r.prospectEmail,
        prospectPhone: r.prospectPhone,
        callTime: r.callTime.toISOString(),
        callEndTime: r.callEndTime ? r.callEndTime.toISOString() : null,
        bookingPlatform: r.bookingPlatform,
        bookingStatus: (r.bookingStatus as "scheduled" | "cancelled") ?? "scheduled",
        preCallRead: {
          status: derivePreCallStatus(r),
          briefDeliveredAt: r.briefDeliveredAt ? r.briefDeliveredAt.toISOString() : null,
          destinationDelivered: r.destinationDelivered,
          briefText: r.briefText,
          runId: r.runId,
        },
        pileOn: {
          status: pileOnStatus,
          personalizedIntro: pileOn?.personalizedIntro ?? null,
          sentAt: pileOn?.createdAt ? pileOn.createdAt.toISOString() : null,
        },
        winBack: {
          status: wbStatus,
          freshRescheduleLink: winBack?.freshRescheduleLink ?? null,
          exitReason: winBack?.exitReason ?? null,
          enrolledAt: winBack?.enrolledAt ? winBack.enrolledAt.toISOString() : null,
        },
      };
    });

    return NextResponse.json({ entries });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}