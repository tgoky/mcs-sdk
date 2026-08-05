import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { winBackEnrollments, engagements, type EngagementStack } from "@/models/schema";
import { getSession } from "@/lib/session";
import { and, eq } from "drizzle-orm";
import { resolveCredential } from "@/lib/credentials";
import { exitWinBackSequence } from "@/lib/platforms/email";

export const runtime = "nodejs";

/**
 * Backs the run-detail page's "Stop Cadence" control
 * (src/app/dashboard/runs/[id]/views/win-back-view.tsx). Previously that
 * button only set local component state after a confirm() dialog —
 * nothing was ever written to winBackEnrollments, so the enrollment's
 * status stayed "active" and this app's own crons kept sending: both
 * win-back-email-smtp.ts and win-back-sms.ts re-check
 * `winBackEnrollments.status === "active"` before every single send.
 *
 * FIX: this route previously lived at src/app/api/win-back/[id]/stop —
 * a sibling of src/app/api/win-back/[engagementId]/export at the same
 * directory level. Next.js's App Router hard-rejects two different
 * dynamic segment names ("id" vs "engagementId") under the same parent
 * path ("You cannot use different slug names for the same dynamic
 * path"), which broke route-tree construction for this entire route
 * group — not just this endpoint. Moving this route under the static
 * `enrollments` segment resolves the conflict and also matches what the
 * frontend was already calling (/api/win-back/enrollments/{id}/stop)
 * and what the log messages below already called it.
 *
 * Two things have to happen for this to actually be trustworthy:
 *
 *  1. Flip the status row (load-bearing, transactional). This alone fully
 *     stops every send this app's own scheduler drives — the SMTP email
 *     sequence and the direct-send SMS sequence (Twilio/GHL SMS).
 *
 *  2. Best-effort unenroll from the ESP's own automation. For the five
 *     ESP-driven email platforms (Klaviyo, HubSpot, ActiveCampaign,
 *     Mailchimp, ConvertKit), enrollInWinBackSequence() (see
 *     enrollment-service.ts) enrolls the prospect into that platform's
 *     own workflow/list *once*, at cancellation time — the ESP, not this
 *     app, owns the send schedule from there on. Flipping our own status
 *     column doesn't reach that. Isolated in its own try/catch, same
 *     "best-effort, non-blocking" shape as notify.ts — a stale ESP
 *     credential shouldn't roll back the (already-committed) core stop,
 *     but we do report it back so the UI can be honest if it happens
 *     rather than implying a guarantee this app can't back up.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
      .where(and(eq(winBackEnrollments.id, id), eq(engagements.whopUserId, session.whopUserId)))
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
