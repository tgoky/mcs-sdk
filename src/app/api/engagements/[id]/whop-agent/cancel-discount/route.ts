import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAuthorizedForEngagement } from "@/lib/whop-access";
import { queueNativeCancelDiscountConfig } from "@/features/whop-agent/server/cancellation-save-offer-service";

export const runtime = "nodejs";
export const revalidate = 0;

/** Playbook 5.6 step 1 — always gated (Section 8.3), never applied inline. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.whopUserId || !(await isAuthorizedForEngagement(session, id))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  if (typeof body?.planId !== "string" || typeof body?.percentage !== "number" || typeof body?.intervals !== "number") {
    return NextResponse.json({ error: "planId, percentage, and intervals are required." }, { status: 400 });
  }
  try {
    const pendingActionId = await queueNativeCancelDiscountConfig(id, body.planId, { percentage: body.percentage, intervals: body.intervals });
    return NextResponse.json({ pendingActionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to queue the cancel-discount configuration.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
