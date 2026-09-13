import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAuthorizedForEngagement } from "@/lib/whop-access";
import { assemblePurchaseCapPacket } from "@/features/whop-agent/server/purchase-cap-copilot-service";

export const runtime = "nodejs";
export const revalidate = 0;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.whopUserId || !(await isAuthorizedForEngagement(session, id))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  if (typeof body?.highestPricedOfferCents !== "number" || typeof body?.targetApprovalAmountCents !== "number" || typeof body?.contactEmail !== "string") {
    return NextResponse.json({ error: "highestPricedOfferCents, targetApprovalAmountCents, and contactEmail are required." }, { status: 400 });
  }

  try {
    const packet = await assemblePurchaseCapPacket(id, body);
    return NextResponse.json(packet);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to assemble the purchase cap packet.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
