// src/app/api/engagements/[id]/activity/route.ts
//
// The gap this closes: booking_roster (read by roster/route.ts) is a
// genuinely accurate ground-truth for calls, but calls are Pre-Call Read's
// event type alone. Pile-On, Win-Back, and Leak-Map are recurring/
// cron-driven skills whose real activity — a touch actually sent, an
// enrollment starting or exiting, an audit completing — has never had a
// dated event exposed anywhere. The master roster calendar previously
// tried to fake this by joining Pile-On/Win-Back aggregates onto whichever
// roster row happened to share a bookingId/email, which only works for
// Pile-On (genuinely 1:1 with a booking) and silently drops Win-Back
// entirely on every day it doesn't coincide with a fresh booking on the
// same prospect — i.e. almost always, since Win-Back exists precisely
// because the prospect hasn't rebooked yet.
//
// This route returns one flat, chronologically-sortable event per actual
// occurrence — not a rollup — for the three skills that have no other
// dated representation: a sequence_message_log row IS a touch, a
// win_back_enrollments row's enrolledAt/exitedAt IS a lifecycle event, an
// audit_runs_log row IS a completed audit. Calls stay on roster/route.ts;
// this is everything roster can't show.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  engagements,
  sequenceMessageLog,
  winBackEnrollments,
  auditRunsLog,
  bookingRoster,
} from "@/models/schema";
import type { PgColumn } from "drizzle-orm/pg-core";
import { getSession } from "@/lib/session";
import { and, eq, gte, lt, inArray, isNotNull } from "drizzle-orm";

export const runtime = "nodejs";
export const revalidate = 0;

export type ActivitySkill = "pile-on" | "win-back" | "leak-map";

export type ActivityEventType =
  | "pile_on_touch_sent"
  | "win_back_enrolled"
  | "win_back_touch_sent"
  | "win_back_rebooked"
  | "win_back_lost"
  | "win_back_reply_exited"
  | "win_back_corrected"
  | "leak_map_audit";

export type ActivityTone = "success" | "warning" | "danger" | "info" | "neutral";

export interface ActivityEvent {
  id: string;
  skill: ActivitySkill;
  type: ActivityEventType;
  occurredAt: string;
  title: string;
  detail: string | null;
  tone: ActivityTone;
  runId: string | null;
  prospectName: string | null;
  prospectEmail: string | null;
}

function severityTone(severity: string): ActivityTone {
  switch (severity) {
    case "high":
      return "danger";
    case "medium":
      return "warning";
    case "low":
      return "info";
    default:
      return "neutral";
  }
}

function exitEvent(status: string): { type: ActivityEventType; title: string; tone: ActivityTone } {
  switch (status) {
    case "rebooked":
      return { type: "win_back_rebooked", title: "Rebooked — recovered", tone: "success" };
    case "reply_exited":
      return { type: "win_back_reply_exited", title: "Prospect replied — exited sequence", tone: "info" };
    case "corrected":
      return { type: "win_back_corrected", title: "Corrected — call actually showed", tone: "info" };
    case "lost":
    default:
      return { type: "win_back_lost", title: "Recovery window elapsed — lost", tone: "neutral" };
  }
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

    // Same month-window + grid-padding logic as roster/route.ts, so a
    // month-view badge and the events behind it are always looking at the
    // same date range. ?all=1 bypasses this for callers that want full
    // engagement history (the Board view's Leak-Map lens, which — like
    // the Pile-On/Win-Back pipeline lenses next to it — shows the whole
    // pipeline, not one month).
    const { searchParams } = new URL(req.url);
    const wantsAll = searchParams.get("all") === "1";
    const monthParam = searchParams.get("month");
    const now = new Date();
    const [year, month] = monthParam?.match(/^\d{4}-\d{2}$/)
      ? monthParam.split("-").map(Number)
      : [now.getFullYear(), now.getMonth() + 1];

    const rangeStart = new Date(Date.UTC(year, month - 1, 1));
    rangeStart.setUTCDate(rangeStart.getUTCDate() - 7);
    const rangeEnd = new Date(Date.UTC(year, month, 1));
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 7);
    const inRange = (col: PgColumn) =>
      wantsAll ? undefined : and(gte(col, rangeStart), lt(col, rangeEnd));

    const [pileOnTouches, winBackEnrolled, winBackTouches, winBackExited, audits] = await Promise.all([
      // Pile-On: every SMS touch actually sent, not the rollup count.
      db
        .select({
          id: sequenceMessageLog.id,
          bookingId: sequenceMessageLog.bookingId,
          messageId: sequenceMessageLog.messageId,
          runId: sequenceMessageLog.runId,
          prospectEmail: sequenceMessageLog.prospectEmail,
          sentAt: sequenceMessageLog.sentAt,
        })
        .from(sequenceMessageLog)
        .where(
          and(
            eq(sequenceMessageLog.engagementId, engagementId),
            eq(sequenceMessageLog.sequenceType, "pile_on_sms"),
            eq(sequenceMessageLog.status, "sent"),
            inRange(sequenceMessageLog.sentAt)
          )
        ),
      // Win-Back: enrollment started (the no-show/cancellation moment).
      db
        .select({
          id: winBackEnrollments.id,
          runId: winBackEnrollments.runId,
          prospectName: winBackEnrollments.prospectName,
          prospectEmail: winBackEnrollments.prospectEmail,
          enrolledAt: winBackEnrollments.enrolledAt,
        })
        .from(winBackEnrollments)
        .where(and(eq(winBackEnrollments.engagementId, engagementId), inRange(winBackEnrollments.enrolledAt))),
      // Win-Back: every recovery SMS/email touch actually sent.
      db
        .select({
          id: sequenceMessageLog.id,
          channel: sequenceMessageLog.channel,
          runId: sequenceMessageLog.runId,
          prospectEmail: sequenceMessageLog.prospectEmail,
          sentAt: sequenceMessageLog.sentAt,
        })
        .from(sequenceMessageLog)
        .where(
          and(
            eq(sequenceMessageLog.engagementId, engagementId),
            inArray(sequenceMessageLog.sequenceType, ["win_back_sms", "win_back_email_smtp"]),
            eq(sequenceMessageLog.status, "sent"),
            inRange(sequenceMessageLog.sentAt)
          )
        ),
      // Win-Back: enrollment ended — rebooked, lost, reply-exited, or corrected.
      db
        .select({
          id: winBackEnrollments.id,
          runId: winBackEnrollments.runId,
          prospectName: winBackEnrollments.prospectName,
          prospectEmail: winBackEnrollments.prospectEmail,
          status: winBackEnrollments.status,
          exitReason: winBackEnrollments.exitReason,
          exitedAt: winBackEnrollments.exitedAt,
        })
        .from(winBackEnrollments)
        .where(
          and(
            eq(winBackEnrollments.engagementId, engagementId),
            isNotNull(winBackEnrollments.exitedAt),
            inRange(winBackEnrollments.exitedAt!)
          )
        ),
      // Leak-Map: every completed audit — cron-driven, never booking-driven.
      db
        .select({
          id: auditRunsLog.id,
          runId: auditRunsLog.runId,
          runType: auditRunsLog.runType,
          topIssues: auditRunsLog.topIssues,
          alertsFired: auditRunsLog.alertsFired,
          createdAt: auditRunsLog.createdAt,
        })
        .from(auditRunsLog)
        .where(and(eq(auditRunsLog.engagementId, engagementId), inRange(auditRunsLog.createdAt))),
    ]);

    // Pile-On touches only carry prospectEmail on sequence_message_log —
    // pull names from booking_roster in one shot rather than N+1ing.
    const pileOnBookingIds = pileOnTouches.map((t) => t.bookingId).filter((v): v is string => !!v);
    const pileOnNames = pileOnBookingIds.length
      ? await db
          .select({ externalCallId: bookingRoster.externalCallId, prospectName: bookingRoster.prospectName })
          .from(bookingRoster)
          .where(and(eq(bookingRoster.engagementId, engagementId), inArray(bookingRoster.externalCallId, pileOnBookingIds)))
      : [];
    const nameByBookingId = new Map(pileOnNames.map((r) => [r.externalCallId, r.prospectName]));

    const events: ActivityEvent[] = [];

    for (const t of pileOnTouches) {
      events.push({
        id: `pile-on:touch:${t.id}`,
        skill: "pile-on",
        type: "pile_on_touch_sent",
        occurredAt: t.sentAt.toISOString(),
        title: "SMS touch sent",
        detail: t.messageId,
        tone: "info",
        runId: t.runId,
        prospectName: t.bookingId ? nameByBookingId.get(t.bookingId) ?? null : null,
        prospectEmail: t.prospectEmail,
      });
    }

    for (const e of winBackEnrolled) {
      events.push({
        id: `win-back:enrolled:${e.id}`,
        skill: "win-back",
        type: "win_back_enrolled",
        occurredAt: e.enrolledAt.toISOString(),
        title: "Enrolled in Win-Back recovery",
        detail: null,
        tone: "warning",
        runId: e.runId,
        prospectName: e.prospectName,
        prospectEmail: e.prospectEmail,
      });
    }

    for (const t of winBackTouches) {
      events.push({
        id: `win-back:touch:${t.id}`,
        skill: "win-back",
        type: "win_back_touch_sent",
        occurredAt: t.sentAt.toISOString(),
        title: t.channel === "sms" ? "Recovery SMS sent" : "Recovery email sent",
        detail: null,
        tone: "warning",
        runId: t.runId,
        prospectName: null,
        prospectEmail: t.prospectEmail,
      });
    }

    for (const e of winBackExited) {
      if (!e.exitedAt) continue;
      const { type, title, tone } = exitEvent(e.status);
      events.push({
        id: `win-back:exit:${e.id}`,
        skill: "win-back",
        type,
        occurredAt: e.exitedAt.toISOString(),
        title,
        detail: e.exitReason,
        tone,
        runId: e.runId,
        prospectName: e.prospectName,
        prospectEmail: e.prospectEmail,
      });
    }

    for (const a of audits) {
      const issues = (a.topIssues as { severity: string }[] | null) ?? [];
      const ranked = ["high", "medium", "low"].find((s) => issues.some((i) => i.severity === s)) ?? "none";
      const alertsCount = ((a.alertsFired as string[] | null) ?? []).length;
      events.push({
        id: `leak-map:audit:${a.id}`,
        skill: "leak-map",
        type: "leak_map_audit",
        occurredAt: a.createdAt.toISOString(),
        title: `${a.runType} audit completed`,
        detail: `${issues.length} issue${issues.length === 1 ? "" : "s"} · ${alertsCount} alert${alertsCount === 1 ? "" : "s"}`,
        tone: severityTone(ranked),
        runId: a.runId,
        prospectName: null,
        prospectEmail: null,
      });
    }

    events.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());

    return NextResponse.json({ events });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
