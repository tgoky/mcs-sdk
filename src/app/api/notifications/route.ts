import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifications } from "@/models/schema";
import { and, desc, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";

export const revalidate = 0;

/**
 * Returns the current user's most recent notifications, newest first.
 * Backs the dashboard notification bell (src/app/dashboard/notification-bell.tsx),
 * which polls this on an interval. Scoped strictly to session.whopUserId —
 * notifications carry no engagement-membership check of their own, so this
 * route is the only thing standing between one tenant's alerts and
 * another's.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.whopUserId, session.whopUserId))
    .orderBy(desc(notifications.createdAt))
    .limit(30);

  const unreadCount = rows.filter((r) => !r.read).length;

  return NextResponse.json({ notifications: rows, unreadCount });
}
