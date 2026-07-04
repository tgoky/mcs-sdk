import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifications } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // "all" marks every unread notification for this user as read in one
  // shot — the bell's "mark all as read" action.
  if (id === "all") {
    await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.whopUserId, session.whopUserId));
    return NextResponse.json({ ok: true });
  }

  await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.id, id), eq(notifications.whopUserId, session.whopUserId)));

  return NextResponse.json({ ok: true });
}
