import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import { pendingActions, engagements } from "@/models/schema";
import { and, eq, isNull } from "drizzle-orm";

/** Pending actions awaiting review, scoped to the tenant's active workspace. */
export async function GET() {
  const session = await getSession();
  if (!session.whopUserId) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const activeWorkspace = await getActiveWorkspace(session.whopUserId);

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
    .where(
      and(
        eq(engagements.whopUserId, session.whopUserId),
        eq(engagements.workspaceId, activeWorkspace.workspaceId),
        eq(pendingActions.status, "pending"),
        // A soft-deleted/offboarded client's leftover pending actions
        // shouldn't keep showing up here.
        isNull(engagements.deletedAt)
      )
    );

  return NextResponse.json({ pendingActions: rows });
}