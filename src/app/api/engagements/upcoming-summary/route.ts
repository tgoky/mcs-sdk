import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { getUpcomingWinBackTouches } from "@/lib/upcoming-touches";
import { getCallsAcrossEngagements } from "@/lib/calendar-roster";
import { getUpcomingLeakMapAudits } from "@/lib/upcoming-leak-map";

export const runtime = "nodejs";
export const revalidate = 0;

/** Backs the right-utility-panel's compact Upcoming tab — same 3 queries
 * the full /dashboard/upcoming page uses (appointments, Win-Back touches,
 * Leak Map audits), run together. */
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);
    const rangeStart = new Date();
    const rangeEnd = new Date(rangeStart.getTime() + 14 * 24 * 60 * 60 * 1000);

    const [touches, appointments, leakMapAudits] = await Promise.all([
      getUpcomingWinBackTouches(session.whopUserId, activeWorkspace.workspaceId),
      getCallsAcrossEngagements(session.whopUserId, activeWorkspace.workspaceId, rangeStart, rangeEnd),
      getUpcomingLeakMapAudits(session.whopUserId, activeWorkspace.workspaceId),
    ]);

    return NextResponse.json({ touches, appointments, leakMapAudits });
  } catch (err) {
    console.error("[engagements/upcoming-summary GET]", err);
    return NextResponse.json({ error: "Failed to load Upcoming summary." }, { status: 500 });
  }
}
