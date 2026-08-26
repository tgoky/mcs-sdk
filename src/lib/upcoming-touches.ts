// src/lib/upcoming-touches.ts
//
// Backs /dashboard/upcoming — "next booking recovery, what's in the
// cadence" from the original spec. Scope of this first pass, stated
// plainly: the Win-Back recovery-cadence layer only (the next scheduled
// touch — email or SMS — for every active enrollment across every
// client). "Next brief" and "next Leak Map" are real next additions to
// this same page, not attempted here — same reasoning as Calendar's
// booking-roster-only first pass.
import { db } from "@/lib/db";
import { engagements, winBackEnrollments, sequenceMessageLog } from "@/models/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { buildTouchSchedule, computeNextTouchAt, type WinBackAssetMap } from "@/lib/win-back-touch-schedule";

export interface UpcomingTouch {
  enrollmentId: string;
  engagementId: string;
  buyer: string;
  prospectName: string | null;
  prospectEmail: string;
  nextTouchAt: string;
  touchesSent: number;
  touchesTotal: number;
  runId: string | null;
}

/**
 * Every client's next active Win-Back touch, soonest first — the same
 * per-enrollment math src/app/api/engagements/[id]/win-back-pipeline/
 * route.ts uses, just fed from every engagement's own asset map instead
 * of one, since the touch schedule (and its offsets) is engagement-level,
 * not shared account-wide.
 */
export async function getUpcomingWinBackTouches(whopUserId: string, workspaceId: string): Promise<UpcomingTouch[]> {
  const clientEngagements = await db
    .select({ engagementId: engagements.engagementId, buyer: engagements.buyer, assetMap: engagements.winBackSequenceAssetMap })
    .from(engagements)
    .where(and(eq(engagements.whopUserId, whopUserId), eq(engagements.workspaceId, workspaceId), isNull(engagements.deletedAt)));

  if (clientEngagements.length === 0) return [];

  const scheduleByEngagement = new Map(
    clientEngagements.map((e) => [e.engagementId, buildTouchSchedule(e.assetMap as WinBackAssetMap | null)])
  );
  const buyerByEngagementId = new Map(clientEngagements.map((e) => [e.engagementId, e.buyer]));
  const engagementIds = clientEngagements.map((e) => e.engagementId);

  const activeEnrollments = await db
    .select()
    .from(winBackEnrollments)
    .where(and(inArray(winBackEnrollments.engagementId, engagementIds), eq(winBackEnrollments.status, "active")));

  if (activeEnrollments.length === 0) return [];
  const enrollmentIds = activeEnrollments.map((e) => e.id);

  const sentRows = await db
    .select({ enrollmentId: sequenceMessageLog.enrollmentId, messageId: sequenceMessageLog.messageId })
    .from(sequenceMessageLog)
    .where(
      and(
        // Belt-and-suspenders, same as the per-engagement route: scope by
        // engagementId in addition to enrollmentId, not just the latter.
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

  const touches: UpcomingTouch[] = [];
  for (const e of activeEnrollments) {
    const touchSchedule = scheduleByEngagement.get(e.engagementId) ?? [];
    const sentIds = sentByEnrollment.get(e.id) ?? new Set<string>();
    const nextTouchAt = computeNextTouchAt(e.status, e.enrolledAt, touchSchedule, sentIds);
    if (!nextTouchAt) continue; // exhausted schedule or no schedule configured
    touches.push({
      enrollmentId: e.id,
      engagementId: e.engagementId,
      buyer: buyerByEngagementId.get(e.engagementId) ?? "Unknown client",
      prospectName: e.prospectName,
      prospectEmail: e.prospectEmail,
      nextTouchAt,
      touchesSent: sentIds.size,
      touchesTotal: touchSchedule.length,
      runId: e.runId,
    });
  }

  return touches.sort((a, b) => a.nextTouchAt.localeCompare(b.nextTouchAt));
}
