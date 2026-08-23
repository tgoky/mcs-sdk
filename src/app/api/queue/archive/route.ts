import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getQueueArchiveItems } from "@/lib/queue";
import { getActiveWorkspace } from "@/lib/workspace";

export const revalidate = 0;

/**
 * "Closed" tab of the Queue panel — everything a human already decided
 * or resolved, read straight back from pending_actions / human_blockers
 * (see getQueueArchiveItems' doc for why no new table was needed). Reads
 * only, same contract as /api/queue.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const activeWorkspace = await getActiveWorkspace(session.whopUserId);
  const items = await getQueueArchiveItems(session.whopUserId, activeWorkspace.workspaceId);

  return NextResponse.json({ items });
}
