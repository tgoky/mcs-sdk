import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { skillRuns, engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { and, eq, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { SKILL_IDS } from "@/lib/skill-manifest";
import { latestStepLabel } from "@/lib/run-display";

export const runtime = "nodejs";
export const revalidate = 0;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    const skillParam = searchParams.get("skill");
    const skill = skillParam && (SKILL_IDS as readonly string[]).includes(skillParam) ? skillParam : null;

    const limitParam = Number(searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(Math.trunc(limitParam), MAX_LIMIT)
      : DEFAULT_LIMIT;

    const offsetParam = Number(searchParams.get("offset"));
    const offset = Number.isFinite(offsetParam) && offsetParam > 0 ? Math.trunc(offsetParam) : 0;

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
        engagementPausedAt: engagements.pausedAt,
        errorMessage: skillRuns.errorMessage,
        steps: skillRuns.steps,
        // jsonb_array_length returns NULL when the column is NULL, so coalesce to 0
        stepCount: sql<number>`coalesce(jsonb_array_length(${skillRuns.steps}), 0)`,
      })
      .from(skillRuns)
      .innerJoin(
        engagements,
        eq(skillRuns.engagementId, engagements.engagementId)
      )
      .where(
        skill
          ? and(eq(engagements.whopUserId, session.whopUserId), eq(skillRuns.skillName, skill))
          : eq(engagements.whopUserId, session.whopUserId)
      )
      .orderBy(desc(skillRuns.startedAt))
      .limit(limit)
      .offset(offset);

    const runs = rows.map(({ steps, ...rest }) => ({
      ...rest,
      subjectLabel: latestStepLabel(steps),
    }));

    return NextResponse.json({ runs });
  } catch (err) {
    console.error("[skill-runs/recent]", err);
    return NextResponse.json(
      { error: "Failed to fetch recent runs." },
      { status: 500 }
    );
  }
}