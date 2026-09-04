import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { setSubredditMap, type RedditRampSubreddit } from "@/features/reputation-manager/server/offensive/reddit-ramp";

export const runtime = "nodejs";
export const revalidate = 0;

function isValidSubreddits(value: unknown): value is RedditRampSubreddit[] {
  return (
    Array.isArray(value) &&
    value.every(
      (s) => s && typeof s === "object" && typeof s.subreddit === "string" && s.subreddit.trim().length > 0 && [1, 2, 3].includes(s.tier)
    )
  );
}

/** Replaces the full 3-tier subreddit map for this engagement's ramp. */
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
    if (!isValidSubreddits(body?.subreddits)) {
      return NextResponse.json({ error: "subreddits must be a list of { subreddit: string, tier: 1 | 2 | 3 }." }, { status: 400 });
    }

    const ramp = await setSubredditMap(id, body.subreddits);
    return NextResponse.json({ ramp });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
