import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { skillRuns, engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Join through engagements so a user can only read their own runs.
    const [row] = await db
      .select({
        id: skillRuns.id,
        skillName: skillRuns.skillName,
        status: skillRuns.status,
        phase: skillRuns.phase,
        steps: skillRuns.steps,
        summary: skillRuns.summary,
        errorMessage: skillRuns.errorMessage,
        tokenUsage: skillRuns.tokenUsage,
        costInCents: skillRuns.costInCents,
        startedAt: skillRuns.startedAt,
        completedAt: skillRuns.completedAt,
        engagementId: skillRuns.engagementId,
        buyerName: engagements.buyer,
      })
      .from(skillRuns)
      .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
      .where(
        and(
          eq(skillRuns.id, id),
          eq(engagements.whopUserId, session.whopUserId)
        )
      )
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    // Compute wall-clock duration if both timestamps present
    const durationMs =
      row.completedAt && row.startedAt
        ? new Date(row.completedAt).getTime() - new Date(row.startedAt).getTime()
        : null;

    return NextResponse.json({ run: { ...row, durationMs } });
  } catch (err) {
    console.error("[skill-runs/[id]]", err);
    return NextResponse.json({ error: "Failed to fetch run." }, { status: 500 });
  }
}