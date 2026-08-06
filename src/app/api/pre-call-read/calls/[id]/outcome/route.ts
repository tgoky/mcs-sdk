import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { briefedCallsLog, engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { and, eq } from "drizzle-orm";
import { resolveCallOutcome } from "@/features/pre-call-read/server/outcome-resolution";

export const runtime = "nodejs";

const VALID_OUTCOMES = new Set(["showed", "no_show", "rescheduled"]);

/**
 * Backs the run-detail page's "Log Sales Call Outcome" control
 * (src/app/dashboard/runs/[id]/views/pre-call-read-view.tsx). Previously
 * that button only set local component state — nothing was ever
 * persisted, even though a real outcome-logging system already existed
 * via the Slack interactive buttons (src/app/api/slack/interactions/route.ts),
 * which write to this exact same brief_outcome_log table. This route just
 * gives the dashboard the same write path, keyed the same way
 * (bookingId === briefedCallsLog.callId, not briefedCallsLog.id — see the
 * module comment on brief_outcome_log in schema.ts), so an outcome logged
 * from Slack and one logged from the dashboard converge on one source of
 * truth instead of two disconnected copies.
 *
 * Win-Back no-show gap fix — this now goes through
 * resolveCallOutcome (outcome-resolution.ts) instead of a bare insert.
 * Previously a "no_show" logged here (or from Slack) only ever wrote this
 * log row; nothing enrolled the prospect in Win-Back and nothing removed
 * them from the ad-data cohort. See that module for the full picture —
 * this route no longer needs to know the prospect's email itself,
 * resolveCallOutcome looks it up from briefedCallsLog.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
      .select({
        engagementId: briefedCallsLog.engagementId,
        callId: briefedCallsLog.callId,
      })
      .from(briefedCallsLog)
      .innerJoin(engagements, eq(briefedCallsLog.engagementId, engagements.engagementId))
      .where(and(eq(briefedCallsLog.id, id), eq(engagements.whopUserId, session.whopUserId)))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Briefed call not found." }, { status: 404 });
    }

    const result = await resolveCallOutcome({
      engagementId: row.engagementId,
      bookingId: row.callId,
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
    console.error("[pre-call-read/calls/[id]/outcome]", err);
    return NextResponse.json({ error: "Failed to log call outcome." }, { status: 500 });
  }
}

