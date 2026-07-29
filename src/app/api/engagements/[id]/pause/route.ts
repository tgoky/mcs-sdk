import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * POST: Pauses an engagement (with optional reason).
 * DELETE: Resumes an engagement.
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

    const now = new Date();
    
    // 🌟 THIS IS THE LINE THAT WAS MISSING FROM YOUR FILE:
    await db
      .update(engagements)
      .set({ 
        pausedAt: now, 
        pausedReason: reason, 
        updatedAt: now 
      })
      .where(eq(engagements.engagementId, id));

    return NextResponse.json({ ok: true, pausedAt: now.toISOString() });
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

    // 🌟 CLEAR THE PAUSE STATE:
    await db
      .update(engagements)
      .set({ 
        pausedAt: null, 
        pausedReason: null, 
        updatedAt: new Date() 
      })
      .where(eq(engagements.engagementId, id));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[engagements/[id]/pause DELETE]", err);
    return NextResponse.json({ error: "Failed to resume engagement." }, { status: 500 });
  }
}