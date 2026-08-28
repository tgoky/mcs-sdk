import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { getCalendarEventsInRange } from "@/lib/calendar-events";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Backs the right-utility-panel's compact Calendar tab — everything across
 * every client and every skill for the current calendar month (no month
 * navigation in the compact view; that's what Expand → /dashboard/calendar
 * is for), same merged event query and same current-month range the full
 * page uses for "now". This is deliberately NOT a forward-looking window —
 * that's what the Upcoming panel is for; Calendar always plots the month
 * you're currently in, past days included, same as the full page.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);
    const now = new Date();
    const rangeStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const rangeEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const events = await getCalendarEventsInRange(session.whopUserId, activeWorkspace.workspaceId, rangeStart, rangeEnd);
    return NextResponse.json({ events });
  } catch (err) {
    console.error("[engagements/calendar-summary GET]", err);
    return NextResponse.json({ error: "Failed to load calendar summary." }, { status: 500 });
  }
}
