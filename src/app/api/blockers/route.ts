import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { humanBlockers, engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";

/**
 * Open blockers across every engagement owned by the calling tenant —
 * powers a "needs your attention" dashboard widget. Tenant-scoped via an
 * inner join on engagements.whopUserId, same pattern
 * dashboard/page.tsx's criticalAlerts query uses (see the cross-tenant
 * leak fix noted in the transfer analysis's Tier 1 #1) — deliberately not
 * repeating the unscoped-query mistake that fix exists to prevent.
 */
export async function GET() {
  const session = await getSession();
  if (!session.whopUserId) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

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
    .where(and(eq(engagements.whopUserId, session.whopUserId), eq(humanBlockers.status, "open")));

  return NextResponse.json({ blockers: rows });
}
