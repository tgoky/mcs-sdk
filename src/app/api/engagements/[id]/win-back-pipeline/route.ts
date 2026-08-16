// src/app/api/engagements/[id]/win-back-pipeline/route.ts
//
// The Win-Back equivalent of the roster fix — but a different gap. Every
// Win-Back run already corresponds to exactly one prospect
// (WinBackDetail.enrollment is singular, see runs/[id]/_shared/types.ts),
// so a single run page isn't frozen/stale the way Pre-Call Read's was.
// What's missing is an aggregate: seeing the whole active pipeline means
// clicking into one run page per prospect today. This route reads every
// winBackEnrollments row for the engagement in one shot, and computes real
// touch progress (X of Y sent) from sequenceMessageLog rather than
// inferring it from whether a scheduled offset has merely passed.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, winBackEnrollments, sequenceMessageLog } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { and, eq, inArray } from "drizzle-orm";

export const runtime = "nodejs";
export const revalidate = 0;

export type WinBackEnrollmentStatus = "active" | "rebooked" | "lost" | "reply_exited" | "manual_override" | "corrected";

export interface WinBackPipelineItem {
  id: string;
  prospectName: string | null;
  prospectEmail: string;
  status: WinBackEnrollmentStatus;
  enrolledAt: string;
  recoveryWindowDays: number;
  exitedAt: string | null;
  exitReason: string | null;
  runId: string | null;
  touchesSent: number;
  touchesTotal: number;
  // Earliest not-yet-sent touchpoint's scheduled date — null once every
  // touch in the asset map has a matching "sent" row, or once the
  // enrollment has exited (no more sends will go out).
  nextTouchAt: string | null;
  freshRescheduleLink: string | null;
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
      .select({ engagementId: engagements.engagementId, winBackSequenceAssetMap: engagements.winBackSequenceAssetMap })
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

    const assetMap = tenant.winBackSequenceAssetMap;
    // Merge emails+sms into one offset-sorted touch schedule keyed by the
    // same messageId sequenceMessageLog rows use, so "sent" lookups below
    // are a straight id match rather than a fragile position/index guess.
    const touchSchedule: { id: string; offsetDays: number }[] = assetMap
      ? [
          ...assetMap.emails.map((e) => ({ id: e.id, offsetDays: e.offsetDays })),
          ...assetMap.sms.map((s) => ({ id: s.id, offsetDays: s.offsetDays })),
        ].sort((a, b) => a.offsetDays - b.offsetDays)
      : [];
    const touchesTotal = touchSchedule.length;

    const enrollments = await db
      .select()
      .from(winBackEnrollments)
      .where(eq(winBackEnrollments.engagementId, engagementId))
      .orderBy(winBackEnrollments.enrolledAt);

    const enrollmentIds = enrollments.map((e) => e.id);
    const sentRows =
      enrollmentIds.length > 0
        ? await db
            .select({ enrollmentId: sequenceMessageLog.enrollmentId, messageId: sequenceMessageLog.messageId })
            .from(sequenceMessageLog)
            .where(
              and(
                eq(sequenceMessageLog.engagementId, engagementId),
                inArray(sequenceMessageLog.sequenceType, ["win_back_sms", "win_back_email_smtp"]),
                eq(sequenceMessageLog.status, "sent"),
                inArray(sequenceMessageLog.enrollmentId, enrollmentIds)
              )
            )
        : [];

    const sentByEnrollment = new Map<string, Set<string>>();
    for (const row of sentRows) {
      if (!row.enrollmentId) continue;
      if (!sentByEnrollment.has(row.enrollmentId)) sentByEnrollment.set(row.enrollmentId, new Set());
      sentByEnrollment.get(row.enrollmentId)!.add(row.messageId);
    }

    const items: WinBackPipelineItem[] = enrollments.map((e) => {
      const sentIds = sentByEnrollment.get(e.id) ?? new Set<string>();
      let nextTouchAt: string | null = null;
      if (e.status === "active") {
        const next = touchSchedule.find((t) => !sentIds.has(t.id));
        if (next) {
          const d = new Date(e.enrolledAt);
          d.setDate(d.getDate() + next.offsetDays);
          nextTouchAt = d.toISOString();
        }
      }
      return {
        id: e.id,
        prospectName: e.prospectName,
        prospectEmail: e.prospectEmail,
        status: e.status as WinBackEnrollmentStatus,
        enrolledAt: e.enrolledAt.toISOString(),
        recoveryWindowDays: e.recoveryWindowDays,
        exitedAt: e.exitedAt ? e.exitedAt.toISOString() : null,
        exitReason: e.exitReason,
        runId: e.runId,
        touchesSent: sentIds.size,
        touchesTotal,
        nextTouchAt,
        freshRescheduleLink: e.freshRescheduleLink,
      };
    });

    return NextResponse.json({ items });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}