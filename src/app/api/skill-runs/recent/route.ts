import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { skillRuns, engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { eq, desc } from "drizzle-orm";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Join skill_runs -> engagements so the feed knows which client each run belongs to.
    // We filter by whopUserId via the engagements join so users only see their own runs.
    const rows = await db
      .select({
        id: skillRuns.id,
        skillName: skillRuns.skillName,
        status: skillRuns.status,
        phase: skillRuns.phase,
        startedAt: skillRuns.startedAt,
        engagementId: skillRuns.engagementId,
        buyerName: engagements.buyer,
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