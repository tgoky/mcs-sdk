import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { skillRuns, engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { eq, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rows = await db
      .select({
        id: skillRuns.id,
        skillName: skillRuns.skillName,
        status: skillRuns.status,
        phase: skillRuns.phase,
        startedAt: skillRuns.startedAt,
        completedAt: skillRuns.completedAt,
        engagementId: skillRuns.engagementId,
        buyerName: engagements.buyer,
        errorMessage: skillRuns.errorMessage,
        // jsonb_array_length returns NULL when the column is NULL, so coalesce to 0
        stepCount: sql<number>`coalesce(jsonb_array_length(${skillRuns.steps}), 0)`,
      })
      .from(skillRuns)
      .innerJoin(
        engagements,
        eq(skillRuns.engagementId, engagements.engagementId)
      )
      .where(eq(engagements.whopUserId, session.whopUserId))
      .orderBy(desc(skillRuns.startedAt))
      .limit(20);

    return NextResponse.json({ runs: rows });
  } catch (err) {
    console.error("[skill-runs/recent]", err);
    return NextResponse.json(
      { error: "Failed to fetch recent runs." },
      { status: 500 }
    );
  }
}