import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { isAdminEmail, isAuthorizedForEngagement } from "@/lib/whop-access";
import { db } from "@/lib/db";
import { pendingActions, engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { decidePendingAction } from "@/lib/approval-gate";

/**
 * Cross-cutting recovery gap 22 — explicit human-approval gates.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.whopUserId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await params;

  const [action] = await db.select().from(pendingActions).where(eq(pendingActions.id, id)).limit(1);
  if (!action || action.status !== "pending") {
    return NextResponse.json({ error: "Pending action not found or already decided." }, { status: 404 });
  }

  if (!(await isAuthorizedForEngagement(session, action.engagementId))) {
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
          eq(engagements.engagementId, action.engagementId),
          eq(engagements.workspaceId, activeWorkspace.workspaceId)
        )
      )
      .limit(1);

    if (!inWorkspace) {
      return NextResponse.json({ error: "Engagement not found in active workspace." }, { status: 404 });
    }
  }

  let body: { decision?: "approved" | "rejected" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.decision !== "approved" && body.decision !== "rejected") {
    return NextResponse.json({ error: "decision must be 'approved' or 'rejected'." }, { status: 400 });
  }

  const result = await decidePendingAction(id, body.decision, session.email);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  if (result.status === "approved" && !result.executed) {
    return NextResponse.json({ error: `Approved but execution failed: ${result.error}` }, { status: 500 });
  }
  return NextResponse.json({ success: true, status: result.status, ...(result.status === "approved" ? { executed: true } : {}) });
}