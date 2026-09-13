import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAuthorizedForEngagement } from "@/lib/whop-access";
import { assemblePayoutHoldPacket } from "@/features/whop-agent/server/payout-hold-kit-service";

export const runtime = "nodejs";
export const revalidate = 0;

/** Section 5.9: "packet-on-demand mode so the operator has it ready before a hold happens." */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.whopUserId || !(await isAuthorizedForEngagement(session, id))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await assemblePayoutHoldPacket(id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to assemble the payout hold packet.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
