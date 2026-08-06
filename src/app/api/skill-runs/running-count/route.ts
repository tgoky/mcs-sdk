import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { skillRuns, engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { and, eq, sql } from "drizzle-orm";

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
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(skillRuns)
      .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
      .where(and(eq(engagements.whopUserId, session.whopUserId), eq(skillRuns.status, "running")));

    return NextResponse.json({ count: Number(row?.count ?? 0) });
  } catch (err) {
    console.error("[skill-runs/running-count]", err);
    return NextResponse.json({ error: "Failed to fetch running count." }, { status: 500 });
  }
}
