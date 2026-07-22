import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getQueueItems } from "@/lib/queue";

export const revalidate = 0;

/**
 * Unified "needs a human" queue — merges pending_actions, human_blockers,
 * and unread notifications (see src/lib/queue.ts for the merge logic and
 * priority ranking). Backs the dashboard queue panel
 * (src/app/dashboard/queue-panel.tsx), which polls this the same way
 * live-execution-feed.tsx polls /api/runs. The actual approve/reject/
 * resolve/dismiss mutations are NOT handled here — they go straight to
 * the existing /api/actions/[id]/review, /api/blockers/[id]/resolve, and
 * /api/notifications/[id]/read endpoints, which already enforce admin
 * access and the correct state-machine transitions. This route only ever
 * reads.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = await getQueueItems(session.whopUserId);

  return NextResponse.json({ items });
}
