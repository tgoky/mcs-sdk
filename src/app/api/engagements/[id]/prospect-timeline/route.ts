import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { loadProspectTimeline } from "@/lib/prospect-timeline";

export const revalidate = 0;

/**
 * One person's journey with this client across the products it has on
 * (lib/prospect-timeline.ts), by booking (?bookingId=) or by email/phone.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: engagementId } = await params;
  const session = await getSession();
  if (!session?.whopUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workspace = await getActiveWorkspace(session.whopUserId);
  const [owned] = await db
    .select({ id: engagements.id })
    .from(engagements)
    .where(and(eq(engagements.engagementId, engagementId), eq(engagements.whopUserId, session.whopUserId), eq(engagements.workspaceId, workspace.workspaceId)))
    .limit(1);
  if (!owned) return NextResponse.json({ error: "Engagement not found" }, { status: 404 });

  const q = new URL(req.url).searchParams;
  const key = { bookingId: q.get("bookingId") ?? undefined, email: q.get("email") ?? undefined, phone: q.get("phone") ?? undefined };
  if (!key.bookingId && !key.email && !key.phone) return NextResponse.json({ error: "Give a bookingId, email or phone." }, { status: 400 });

  const timeline = await loadProspectTimeline(engagementId, key);
  if (!timeline) return NextResponse.json({ error: "No one found for that." }, { status: 404 });
  return NextResponse.json(timeline);
}
