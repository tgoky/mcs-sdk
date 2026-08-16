import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { winBackEnrollments, engagements, type EngagementStack } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { and, eq } from "drizzle-orm";
import { resolveCredential } from "@/lib/credentials";
import { exitWinBackSequence } from "@/lib/platforms/email";

export const runtime = "nodejs";

/**
 * Backs the run-detail page's "Stop Cadence" control
 * (src/app/dashboard/runs/[id]/views/win-back-view.tsx).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const [row] = await db
      .select({
        id: winBackEnrollments.id,
        status: winBackEnrollments.status,
        prospectEmail: winBackEnrollments.prospectEmail,
        engagementId: winBackEnrollments.engagementId,
        stack: engagements.stack,
      })
      .from(winBackEnrollments)
      .innerJoin(engagements, eq(winBackEnrollments.engagementId, engagements.engagementId))
      .where(
        and(
          eq(winBackEnrollments.id, id),
          eq(engagements.whopUserId, session.whopUserId),
          eq(engagements.workspaceId, activeWorkspace.workspaceId)
        )
      )
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Enrollment not found." }, { status: 404 });
    }

    if (row.status !== "active") {
      return NextResponse.json(
        { error: `Enrollment is already "${row.status}" — nothing to stop.` },
        { status: 409 }
      );
    }

    await db
      .update(winBackEnrollments)
      .set({ status: "manual_override", exitReason: "manual_override", exitedAt: new Date() })
      .where(eq(winBackEnrollments.id, id));

    let espUnenrolled = true;
    const stack = row.stack as EngagementStack | null;
    if (stack?.email_platform && stack.email_platform !== "smtp") {
      try {
        const apiKey = await resolveCredential(row.engagementId, stack.email_platform);
        await exitWinBackSequence(
          stack.email_platform,
          apiKey,
          row.prospectEmail,
          {
            location_id: stack.booking_platform_meta?.location_id,
            recovery_workflow_id: stack.recovery_workflow_id,
            recovery_list_id: stack.recovery_list_id,
            activecampaign_base_url: stack.activecampaign_base_url,
          },
          "manual_override"
        );
      } catch (espErr) {
        espUnenrolled = false;
        console.error("[win-back/enrollments/[id]/stop] ESP unenroll failed:", espErr);
      }
    }

    return NextResponse.json({ success: true, status: "manual_override", espUnenrolled });
  } catch (err) {
    console.error("[win-back/enrollments/[id]/stop]", err);
    return NextResponse.json({ error: "Failed to stop win-back cadence." }, { status: 500 });
  }
}