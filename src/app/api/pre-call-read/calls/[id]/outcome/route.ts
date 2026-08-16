import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { briefedCallsLog, engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { and, eq } from "drizzle-orm";
import { resolveCallOutcome } from "@/features/pre-call-read/server/outcome-resolution";

export const runtime = "nodejs";

const VALID_OUTCOMES = new Set(["showed", "no_show", "rescheduled"]);

/**
 * Backs the run-detail page's "Log Sales Call Outcome" control
 * (src/app/dashboard/runs/[id]/views/pre-call-read-view.tsx).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

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
      .select({
        engagementId: briefedCallsLog.engagementId,
        callId: briefedCallsLog.callId,
      })
      .from(briefedCallsLog)
      .innerJoin(engagements, eq(briefedCallsLog.engagementId, engagements.engagementId))
      .where(
        and(
          eq(briefedCallsLog.id, id),
          eq(engagements.whopUserId, session.whopUserId),
          eq(engagements.workspaceId, activeWorkspace.workspaceId)
        )
      )
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