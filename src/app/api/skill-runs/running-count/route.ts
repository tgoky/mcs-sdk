import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { skillRuns, engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { and, eq, sql } from "drizzle-orm";
import { getUnseenCompletedExecutionCount } from "@/lib/run-log";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Same "running" count WorkSidebar computes for the Executions nav item
 * (src/app/dashboard/work-sidebar.tsx) — pulled out into its own endpoint
 * so live-count-badge.tsx can poll just this number instead of waiting on
 * a full server-component re-render. WorkSidebar is only re-evaluated on a
 * full navigation into /dashboard (it's a Suspense-wrapped RSC inside a
 * layout that persists across client-side route changes), so without this
 * a run that starts while the buyer is already sitting on a page would
 * never bump the Executions badge until they reloaded — see the file
 * comment on live-count-badge.tsx for the full story.
 *
 * unseenCompleted is the other half of that same fix: how many runs
 * finished since the user last visited /dashboard/runs, independent of
 * whether anything's running right now — see getUnseenCompletedExecutionCount
 * (run-log.ts). One endpoint, one poll, so the two numbers the badge
 * needs never arrive out of step with each other.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [runningRow, unseenCompleted] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(skillRuns)
        .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
        .where(and(eq(engagements.whopUserId, session.whopUserId), eq(skillRuns.status, "running"))),
      getUnseenCompletedExecutionCount(session.whopUserId),
    ]);

    return NextResponse.json({ count: Number(runningRow[0]?.count ?? 0), unseenCompleted });
  } catch (err) {
    console.error("[skill-runs/running-count]", err);
    return NextResponse.json({ error: "Failed to fetch running count." }, { status: 500 });
  }
}
