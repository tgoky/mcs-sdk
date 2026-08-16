import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { isAdminEmail, isAuthorizedForEngagement } from "@/lib/whop-access";
import { resolveBlocker, abandonBlocker, getBlockerEngagementId } from "@/lib/human-blockers";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";

/**
 * Cross-cutting recovery gap 17 — human-only-blocker resume.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.whopUserId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await params;

  const engagementId = await getBlockerEngagementId(id);
  if (!engagementId) {
    return NextResponse.json({ error: "Blocker not found or already decided." }, { status: 404 });
  }

  if (!(await isAuthorizedForEngagement(session, engagementId))) {
    return NextResponse.json({ error: "You don't have access to this engagement." }, { status: 403 });
  }

  // Ensure engagement belongs to the active workspace for non-admin users
  if (!isAdminEmail(session.email)) {
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);
    const [inWorkspace] = await db
      .select({ id: engagements.id })
      .from(engagements)
      .where(
        and(
          eq(engagements.engagementId, engagementId),
          eq(engagements.workspaceId, activeWorkspace.workspaceId)
        )
      )
      .limit(1);

    if (!inWorkspace) {
      return NextResponse.json({ error: "Engagement not found in active workspace." }, { status: 404 });
    }
  }

  let body: { decision?: "resolved" | "abandoned"; resumePayload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.decision !== "resolved" && body.decision !== "abandoned") {
    return NextResponse.json({ error: "decision must be 'resolved' or 'abandoned'." }, { status: 400 });
  }

  const ok =
    body.decision === "resolved"
      ? await resolveBlocker(id, session.email, body.resumePayload)
      : await abandonBlocker(id, session.email);

  if (!ok) {
    return NextResponse.json({ error: "Blocker not found or already decided." }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}