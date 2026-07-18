import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdminEmail } from "@/lib/whop-access";
import { db } from "@/lib/db";
import { pendingActions } from "@/models/schema";
import { eq } from "drizzle-orm";
import { ACTION_EXECUTORS, type PendingActionType } from "@/lib/approval-gate";

/**
 * Cross-cutting recovery gap 22 — explicit human-approval gates. This is
 * the "human decides" side of gateOrExecute: an admin approves (runs the
 * deferred action now, via ACTION_EXECUTORS) or rejects (marks it decided,
 * no-op) a queued pending_actions row. See src/lib/approval-gate.ts.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.whopUserId || !isAdminEmail(session.email)) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { id } = await params;

  let body: { decision?: "approved" | "rejected" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.decision !== "approved" && body.decision !== "rejected") {
    return NextResponse.json({ error: "decision must be 'approved' or 'rejected'." }, { status: 400 });
  }

  const [action] = await db.select().from(pendingActions).where(eq(pendingActions.id, id)).limit(1);
  if (!action || action.status !== "pending") {
    return NextResponse.json({ error: "Pending action not found or already decided." }, { status: 404 });
  }

  if (body.decision === "rejected") {
    await db
      .update(pendingActions)
      .set({ status: "rejected", decidedAt: new Date(), decidedBy: session.email })
      .where(eq(pendingActions.id, id));
    return NextResponse.json({ success: true, status: "rejected" });
  }

  // Approved — mark decided first (so a slow/failing executor can't leave
  // the row looking un-decided and retryable-by-accident), then attempt
  // execution, recording failure on the row rather than throwing it away.
  await db
    .update(pendingActions)
    .set({ status: "approved", decidedAt: new Date(), decidedBy: session.email })
    .where(eq(pendingActions.id, id));

  try {
    const executor = ACTION_EXECUTORS[action.actionType as PendingActionType];
    if (!executor) {
      throw new Error(`No executor registered for action type "${action.actionType}"`);
    }
    await executor(action.engagementId, action.payload);
    return NextResponse.json({ success: true, status: "approved", executed: true });
  } catch (error: any) {
    await db
      .update(pendingActions)
      .set({ status: "execution_failed", executionError: error.message })
      .where(eq(pendingActions.id, id));
    return NextResponse.json({ error: `Approved but execution failed: ${error.message}` }, { status: 500 });
  }
}
