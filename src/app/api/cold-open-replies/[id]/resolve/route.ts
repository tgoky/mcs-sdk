import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { isAdminEmail, isAuthorizedForEngagement } from "@/lib/whop-access";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getColdOpenReplyEngagementId, resolveColdOpenReplyQueueItem } from "@/features/cold-open/server/reply-sort";

/**
 * Queue panel's "mark handled" action for a Cold Open reply routed to the
 * Queue — same shape as POST /api/blockers/[id]/resolve, just a single
 * terminal transition (queued -> handled) instead of a resolved/abandoned
 * choice, since there's no equivalent "abandon" concept for a reply.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.whopUserId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await params;

  const engagementId = await getColdOpenReplyEngagementId(id);
  if (!engagementId) {
    return NextResponse.json({ error: "Reply not found." }, { status: 404 });
  }

  if (!(await isAuthorizedForEngagement(session, engagementId))) {
    return NextResponse.json({ error: "You don't have access to this engagement." }, { status: 403 });
  }

  if (!isAdminEmail(session.email)) {
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);
    const [inWorkspace] = await db
      .select({ id: engagements.id })
      .from(engagements)
      .where(and(eq(engagements.engagementId, engagementId), eq(engagements.workspaceId, activeWorkspace.workspaceId)))
      .limit(1);

    if (!inWorkspace) {
      return NextResponse.json({ error: "Engagement not found in active workspace." }, { status: 404 });
    }
  }

  const ok = await resolveColdOpenReplyQueueItem(id);
  if (!ok) {
    return NextResponse.json({ error: "Reply not found or already handled." }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
