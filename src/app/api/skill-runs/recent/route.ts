import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { skillRuns, engagements, type RunStep } from "@/models/schema";
import { getSession } from "@/lib/session";
import { eq, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Pulls the most specific human-readable detail out of a run's step log —
 * e.g. "Sarah Jenkins <sarah@acme.com>", which src/features/pile-on/server/
 * enrollment-service.ts already writes via logStep() for every booking, but
 * which nothing has surfaced in the UI until now. Scans from the most
 * recent step backward so an in-progress run shows its latest known detail,
 * not whatever the very first step happened to say.
 */
function latestStepLabel(steps: RunStep[] | null | undefined): string | null {
  if (!steps || steps.length === 0) return null;
  for (let i = steps.length - 1; i >= 0; i--) {
    const label = steps[i]?.label?.trim();
    if (label) return label;
  }
  return null;
}

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
        steps: skillRuns.steps,
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