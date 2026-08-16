import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { skillRuns, engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { and, eq, sql } from "drizzle-orm";
import { getUnseenCompletedExecutionCount } from "@/lib/run-log";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const [runningRow, unseenCompleted] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(skillRuns)
        .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
        .where(
          and(
            eq(engagements.whopUserId, session.whopUserId),
            eq(engagements.workspaceId, activeWorkspace.workspaceId),
            eq(skillRuns.status, "running")
          )
        ),
      getUnseenCompletedExecutionCount(session.whopUserId),
    ]);

    return NextResponse.json({ count: Number(runningRow[0]?.count ?? 0), unseenCompleted });
  } catch (err) {
    console.error("[skill-runs/running-count]", err);
    return NextResponse.json({ error: "Failed to fetch running count." }, { status: 500 });
  }
}