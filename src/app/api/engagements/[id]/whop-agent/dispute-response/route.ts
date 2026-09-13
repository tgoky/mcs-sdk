import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAuthorizedForEngagement } from "@/lib/whop-access";
import { assembleDisputeResponse, queueDisputeEvidenceSubmit } from "@/features/whop-agent/server/dispute-response-service";

export const runtime = "nodejs";
export const maxDuration = 60;
export const revalidate = 0;

/** Manual assembly trigger — the webhook path (dispute_alert.created /
 * dispute.created) fires this automatically; this covers on-demand review. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.whopUserId || !(await isAuthorizedForEngagement(session, id))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  if (typeof body?.disputeId !== "string") {
    return NextResponse.json({ error: "disputeId is required." }, { status: 400 });
  }
  try {
    const result = await assembleDisputeResponse(id, body.disputeId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to assemble the dispute response.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

/** Queues the elevated-scope submit — always gated (Section 8.3). The
 * operator's (possibly edited) draft is what gets submitted, so this takes
 * the reviewed draft as input rather than re-reading whatever POST above
 * originally produced. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.whopUserId || !(await isAuthorizedForEngagement(session, id))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  if (typeof body?.disputeId !== "string" || typeof body?.draft !== "object") {
    return NextResponse.json({ error: "disputeId and draft are required." }, { status: 400 });
  }
  try {
    const pendingActionId = await queueDisputeEvidenceSubmit(id, body.disputeId, body.draft);
    return NextResponse.json({ pendingActionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to queue the dispute evidence submission.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
