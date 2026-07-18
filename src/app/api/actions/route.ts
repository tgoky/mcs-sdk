import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { pendingActions, engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";

/** Pending actions awaiting review, tenant-scoped the same way GET /api/blockers is. */
export async function GET() {
  const session = await getSession();
  if (!session.whopUserId) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const rows = await db
    .select({
      id: pendingActions.id,
      engagementId: pendingActions.engagementId,
      actionType: pendingActions.actionType,
      payload: pendingActions.payload,
      createdAt: pendingActions.createdAt,
    })
    .from(pendingActions)
    .innerJoin(engagements, eq(pendingActions.engagementId, engagements.engagementId))
    .where(and(eq(engagements.whopUserId, session.whopUserId), eq(pendingActions.status, "pending")));

  return NextResponse.json({ pendingActions: rows });
}
