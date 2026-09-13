import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAuthorizedForEngagement } from "@/lib/whop-access";
import { auditWebhookFleet, queueWebhookPin, queueWebhookDedupe } from "@/features/whop-agent/server/webhook-audit-service";

export const runtime = "nodejs";
export const revalidate = 0;

/** Re-runs the Section 2.5 audit and returns the current report — the
 * webhook fleet console's own refresh action. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.whopUserId || !(await isAuthorizedForEngagement(session, id))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const report = await auditWebhookFleet(id);
    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to audit the webhook fleet.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

/** Queues a pin or dedupe action — both always-gated (Section 8.3), so this
 * never executes the write itself; it hands back a pendingActionId for the
 * Queue's normal Approve/Reject flow to pick up. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.whopUserId || !(await isAuthorizedForEngagement(session, id))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));

  try {
    if (body.action === "pin" && typeof body.whopWebhookId === "string") {
      const pendingActionId = await queueWebhookPin(id, body.whopWebhookId);
      return NextResponse.json({ pendingActionId });
    }
    if (body.action === "dedupe" && typeof body.groupKey === "string") {
      const pendingActionId = await queueWebhookDedupe(id, body.groupKey);
      return NextResponse.json({ pendingActionId });
    }
    return NextResponse.json({ error: "action must be 'pin' (with whopWebhookId) or 'dedupe' (with groupKey)." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to queue this action.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
