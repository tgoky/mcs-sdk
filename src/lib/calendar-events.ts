// src/lib/calendar-events.ts
//
// Backs /dashboard/calendar's "all clients, all skills" view — the
// browsable-by-month counterpart to /dashboard/upcoming's urgency-sorted
// digest. These two pages deliberately use overlapping data through
// different lenses rather than being the same feature twice (per explicit
// direction 2026-08-25): Calendar plots everything on the specific day it
// falls, for whichever month you're looking at, forward or backward.
// Upcoming only looks forward from right now, sorted by urgency, grouped
// by skill instead of by day. Merges 3 event types into one timeline:
// booked calls (reuses calendar-roster.ts as-is), remaining Win-Back
// touches (every one still due, not just the immediate next), and Leak
// Map audit occurrences (every weekly/monthly hit in the browsed range,
// not just the soonest).
import { db } from "@/lib/db";
import { engagements, winBackEnrollments, sequenceMessageLog, type EngagementStack } from "@/models/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getCallsAcrossEngagements, type CalendarCallEntry } from "@/lib/calendar-roster";
import { buildTouchSchedule, computeRemainingTouches, type WinBackAssetMap } from "@/lib/win-back-touch-schedule";
import { weeklyOccurrencesInRange, monthlyOccurrencesInRange } from "@/features/leak-map/server/schedule-matcher";

export type CalendarEvent =
  | ({ id: string; kind: "call" } & Omit<CalendarCallEntry, "id">)
  | {
      id: string;
      kind: "win_back_touch";
      engagementId: string;
      buyer: string;
      prospectName: string | null;
      scheduledAt: string;
      runId: string | null;
    }
  | {
      id: string;
      kind: "leak_map_audit";
      engagementId: string;
      buyer: string;
      auditType: "weekly" | "monthly";
      scheduledAt: string;
    };

export async function getCalendarEventsInRange(
  whopUserId: string,
  workspaceId: string,
  rangeStart: Date,
  rangeEnd: Date
): Promise<CalendarEvent[]> {
  const clientEngagements = await db
    .select({
      engagementId: engagements.engagementId,
      buyer: engagements.buyer,
      stack: engagements.stack,
      winBackSequenceAssetMap: engagements.winBackSequenceAssetMap,
    })
    .from(engagements)
    .where(and(eq(engagements.whopUserId, whopUserId), eq(engagements.workspaceId, workspaceId), isNull(engagements.deletedAt)));

  if (clientEngagements.length === 0) return [];
  const buyerByEngagementId = new Map(clientEngagements.map((e) => [e.engagementId, e.buyer]));
  const engagementIds = clientEngagements.map((e) => e.engagementId);

  // 1. Calls — reuse the existing Calendar query unchanged.
  const calls = await getCallsAcrossEngagements(whopUserId, workspaceId, rangeStart, rangeEnd);
  const callEvents: CalendarEvent[] = calls.map((c) => ({ ...c, kind: "call" }));

  // 2. Win-Back touches — every remaining touch (not just "next") whose
  // deterministic date falls within this range.
  const scheduleByEngagement = new Map(
    clientEngagements.map((e) => [e.engagementId, buildTouchSchedule(e.winBackSequenceAssetMap as WinBackAssetMap | null)])
  );

  const activeEnrollments = await db
    .select()
    .from(winBackEnrollments)
    .where(and(inArray(winBackEnrollments.engagementId, engagementIds), eq(winBackEnrollments.status, "active")));

  const touchEvents: CalendarEvent[] = [];
  if (activeEnrollments.length > 0) {
    const enrollmentIds = activeEnrollments.map((e) => e.id);
    const sentRows = await db
      .select({ enrollmentId: sequenceMessageLog.enrollmentId, messageId: sequenceMessageLog.messageId })
      .from(sequenceMessageLog)
      .where(
        and(
          inArray(sequenceMessageLog.engagementId, engagementIds),
          inArray(sequenceMessageLog.sequenceType, ["win_back_sms", "win_back_email_smtp"]),
          eq(sequenceMessageLog.status, "sent"),
          inArray(sequenceMessageLog.enrollmentId, enrollmentIds)
        )
      );
    const sentByEnrollment = new Map<string, Set<string>>();
    for (const row of sentRows) {
      if (!row.enrollmentId) continue;
      const set = sentByEnrollment.get(row.enrollmentId) ?? new Set<string>();
      set.add(row.messageId);
      sentByEnrollment.set(row.enrollmentId, set);
    }

    for (const e of activeEnrollments) {
      const touchSchedule = scheduleByEngagement.get(e.engagementId) ?? [];
      const sentIds = sentByEnrollment.get(e.id) ?? new Set<string>();
      const remaining = computeRemainingTouches(e.status, e.enrolledAt, touchSchedule, sentIds);
      for (const touch of remaining) {
        if (touch.scheduledAt < rangeStart.toISOString() || touch.scheduledAt >= rangeEnd.toISOString()) continue;
        touchEvents.push({
          id: `${e.id}:${touch.messageId}`,
          kind: "win_back_touch",
          engagementId: e.engagementId,
          buyer: buyerByEngagementId.get(e.engagementId) ?? "Unknown client",
          prospectName: e.prospectName,
          scheduledAt: touch.scheduledAt,
          runId: e.runId,
        });
      }
    }
  }

  // 3. Leak Map audits — every weekly/monthly occurrence in range, per
  // client (both can land in the same month; unlike the Upcoming digest
  // this isn't just "whichever is sooner").
  const leakMapEvents: CalendarEvent[] = clientEngagements.flatMap((e) => {
    const stack = e.stack as EngagementStack | null;
    const weekly = weeklyOccurrencesInRange(stack?.weekly_summary_schedule, rangeStart, rangeEnd).map(
      (d): CalendarEvent => ({
        id: `${e.engagementId}:weekly:${d.toISOString()}`,
        kind: "leak_map_audit",
        engagementId: e.engagementId,
        buyer: e.buyer,
        auditType: "weekly",
        scheduledAt: d.toISOString(),
      })
    );
    const monthly = monthlyOccurrencesInRange(stack?.monthly_deep_dive_schedule, rangeStart, rangeEnd).map(
      (d): CalendarEvent => ({
        id: `${e.engagementId}:monthly:${d.toISOString()}`,
        kind: "leak_map_audit",
        engagementId: e.engagementId,
        buyer: e.buyer,
        auditType: "monthly",
        scheduledAt: d.toISOString(),
      })
    );
    return [...weekly, ...monthly];
  });

  return [...callEvents, ...touchEvents, ...leakMapEvents].sort((a, b) => {
    const aTime = a.kind === "call" ? a.callTime : a.scheduledAt;
    const bTime = b.kind === "call" ? b.callTime : b.scheduledAt;
    return aTime.localeCompare(bTime);
  });
}
