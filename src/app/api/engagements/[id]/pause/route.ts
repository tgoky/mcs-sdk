import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Pauses an engagement: every recurring cron (nightly-briefs, leak-map
 * schedule, dynamic-brief, booking-poll, lost-deal sweep, weekly-metrics,
 * credential-health) checks pausedAt and skips this engagement until it's
 * resumed. Does NOT cancel a run already in flight — use
 * POST /api/skill-runs/[id]/cancel for that — and does not touch stored
 * credentials or delete anything, so resuming picks up exactly where it
 * left off.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const reason = typeof body?.reason === "string" ? body.reason.slice(0, 500) : null;

    const [row] = await db
      .select({ engagementId: engagements.engagementId, pausedAt: engagements.pausedAt })
      .from(engagements)
      .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session.whopUserId)))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
    }
    if (row.pausedAt) {
      return NextResponse.json({ error: "Already paused." }, { status: 409 });
    }

    await db
      .update(engagements)
      .set({ pausedAt: new Date(), pausedReason: reason, updatedAt: new Date() })
      .where(eq(engagements.engagementId, id));

    return NextResponse.json({ ok: true, pausedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[engagements/[id]/pause POST]", err);
    return NextResponse.json({ error: "Failed to pause engagement." }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [row] = await db
      .select({ engagementId: engagements.engagementId, pausedAt: engagements.pausedAt })
      .from(engagements)
      .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session.whopUserId)))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
    }
    if (!row.pausedAt) {
      return NextResponse.json({ error: "Not paused." }, { status: 409 });
    }

    await db
      .update(engagements)
      .set({ pausedAt: null, pausedReason: null, updatedAt: new Date() })
      .where(eq(engagements.engagementId, id));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[engagements/[id]/pause DELETE]", err);
    return NextResponse.json({ error: "Failed to resume engagement." }, { status: 500 });
  }
}
