import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { logRedditActivity } from "@/features/reputation-manager/server/offensive/reddit-ramp";

export const runtime = "nodejs";
export const revalidate = 0;

/** Logs one comment or post the operator made themselves, for the activity trail. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.whopUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const activeWorkspace = await getActiveWorkspace(session.whopUserId);
    const [row] = await db
      .select({ engagementId: engagements.engagementId })
      .from(engagements)
      .where(
        and(
          eq(engagements.engagementId, id),
          eq(engagements.whopUserId, session.whopUserId),
          eq(engagements.workspaceId, activeWorkspace.workspaceId)
        )
      )
      .limit(1);
    if (!row) return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    if ((body?.type !== "comment" && body?.type !== "post") || typeof body?.subreddit !== "string" || !body.subreddit.trim()) {
      return NextResponse.json({ error: "type ('comment' | 'post') and subreddit (string) are required." }, { status: 400 });
    }

    const ramp = await logRedditActivity(id, {
      type: body.type,
      subreddit: body.subreddit,
      note: typeof body.note === "string" ? body.note : null,
    });
    return NextResponse.json({ ramp });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
