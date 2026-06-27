import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, skillRuns } from "@/models/schema";
import { getSession } from "@/lib/session";
import { eq, desc } from "drizzle-orm";

/**
 * GET /api/skill-runs/recent
 * Returns the 8 most recent skill runs for the authenticated user.
 * Called every 5s by LiveExecutionFeed for polling.
 */
export async function GET() {
  const session = await getSession();
  if (!session.whopUserId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const runs = await db
    .select({
      id: skillRuns.id,
      skillName: skillRuns.skillName,
      status: skillRuns.status,
      phase: skillRuns.phase,
      costInCents: skillRuns.costInCents,
      startedAt: skillRuns.startedAt,
    })
    .from(skillRuns)
    .innerJoin(
      engagements,
      eq(skillRuns.engagementId, engagements.engagementId)
    )
    .where(eq(engagements.whopUserId, session.whopUserId))
    .orderBy(desc(skillRuns.startedAt))
    .limit(8);

  return NextResponse.json({ runs });
}
