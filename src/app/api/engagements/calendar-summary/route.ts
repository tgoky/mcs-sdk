import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { getCalendarEventsInRange } from "@/lib/calendar-events";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Backs the right-utility-panel's compact Calendar tab — the next 14 days
 * across every client and every skill (no month navigation in the compact
 * view; that's what Expand → /dashboard/calendar is for), same merged
 * event query as the full page.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);
    const rangeStart = new Date();
    const rangeEnd = new Date(rangeStart.getTime() + 14 * 24 * 60 * 60 * 1000);
    const events = await getCalendarEventsInRange(session.whopUserId, activeWorkspace.workspaceId, rangeStart, rangeEnd);
    return NextResponse.json({ events });
  } catch (err) {
    console.error("[engagements/calendar-summary GET]", err);
    return NextResponse.json({ error: "Failed to load calendar summary." }, { status: 500 });
  }
}
