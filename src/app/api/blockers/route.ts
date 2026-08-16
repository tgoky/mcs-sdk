import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import { humanBlockers, engagements } from "@/models/schema";
import { and, eq, isNull } from "drizzle-orm";

/**
 * Open blockers across every engagement owned by the calling tenant in the active workspace —
 * powers a "needs your attention" dashboard widget.
 */
export async function GET() {
  const session = await getSession();
  if (!session.whopUserId) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const activeWorkspace = await getActiveWorkspace(session.whopUserId);

  const rows = await db
    .select({
      id: humanBlockers.id,
      engagementId: humanBlockers.engagementId,
      skillName: humanBlockers.skillName,
      blockerType: humanBlockers.blockerType,
      description: humanBlockers.description,
      createdAt: humanBlockers.createdAt,
    })
    .from(humanBlockers)
    .innerJoin(engagements, eq(humanBlockers.engagementId, engagements.engagementId))
    .where(
      and(
        eq(engagements.whopUserId, session.whopUserId),
        eq(engagements.workspaceId, activeWorkspace.workspaceId),
        eq(humanBlockers.status, "open"),
        // A soft-deleted/offboarded client's leftover blockers shouldn't
        // keep showing up here.
        isNull(engagements.deletedAt)
      )
    );

  return NextResponse.json({ blockers: rows });
}