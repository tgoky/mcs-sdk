import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAuthorizedForEngagement } from "@/lib/whop-access";
import { runProductLaunchBatch, type ProductLaunchInput } from "@/features/whop-agent/server/product-launch-preflight-service";

export const runtime = "nodejs";
export const revalidate = 0;
export const maxDuration = 60;

/** Playbook 5.1 — accepts one or more product launch inputs. More than 3
 * in one request is always queued for confirmation (Section 5.1's own
 * guardrail), never executed inline regardless of caller intent. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.whopUserId || !(await isAuthorizedForEngagement(session, id))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const inputs: ProductLaunchInput[] = Array.isArray(body?.products) ? body.products : [body];

  if (!inputs.every((i) => typeof i?.title === "string" && typeof i?.headline === "string" && Array.isArray(i?.plans))) {
    return NextResponse.json({ error: "Each product needs title, headline, and plans[]." }, { status: 400 });
  }

  try {
    const result = await runProductLaunchBatch(id, inputs);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run Product Launch Pre-Flight.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
