import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bookingRoster, engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { and, eq } from "drizzle-orm";
import { resolveCallOutcome } from "@/features/pre-call-read/server/outcome-resolution";

export const runtime = "nodejs";

const VALID_OUTCOMES = new Set(["showed", "no_show", "rescheduled"]);

/**
 * General-purpose "log what actually happened on this call" endpoint,
 * keyed directly by engagementId + bookingId (bookingRoster's ground
 * truth, same id every skill's tables key their own rows on) instead of
 * a specific skill's internal row id.
 *
 * Fix: the only outcome-logging endpoint before this one
 * (pre-call-read/calls/[id]/outcome) required a briefedCallsLog row to
 * already exist for the call — meaning outcome logging was unavailable
 * anywhere a booking hadn't already been processed by Pre-Call-Read
 * specifically (the master roster, the Pile-On pipeline, any booking on
 * an engagement where Pre-Call-Read isn't even enabled). Logging what
 * happened on a call shouldn't depend on an unrelated skill having run
 * first — this route authorizes against bookingRoster + engagements
 * directly and calls the same resolveCallOutcome every other resolution
 * path (dashboard, Slack, Recall bot, auto-sweep) already funnels
 * through, so there's exactly one place outcomes get written regardless
 * of which page a rep clicked "Showed" from.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; bookingId: string }> }) {
  try {
    const { id: engagementId, bookingId } = await params;

    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    let body: { outcome?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    if (!body.outcome || !VALID_OUTCOMES.has(body.outcome)) {
      return NextResponse.json(
        { error: "outcome must be one of: showed, no_show, rescheduled." },
        { status: 400 }
      );
    }

    const [row] = await db
      .select({ bookingId: bookingRoster.externalCallId })
      .from(bookingRoster)
      .innerJoin(engagements, eq(bookingRoster.engagementId, engagements.engagementId))
      .where(
        and(
          eq(bookingRoster.engagementId, engagementId),
          eq(bookingRoster.externalCallId, bookingId),
          eq(engagements.whopUserId, session.whopUserId),
          eq(engagements.workspaceId, activeWorkspace.workspaceId)
        )
      )
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    const result = await resolveCallOutcome({
      engagementId,
      bookingId,
      outcome: body.outcome as "showed" | "no_show" | "rescheduled",
      source: "dashboard",
    });

    return NextResponse.json({
      success: result.recorded,
      outcome: body.outcome,
      winBack: result.winBack,
      cohort: result.cohort,
      ...(result.reason ? { note: result.reason } : {}),
    });
  } catch (err) {
    console.error("[engagements/[id]/bookings/[bookingId]/outcome]", err);
    return NextResponse.json({ error: "Failed to log call outcome." }, { status: 500 });
  }
}
