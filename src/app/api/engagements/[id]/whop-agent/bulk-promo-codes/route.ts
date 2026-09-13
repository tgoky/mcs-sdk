import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAuthorizedForEngagement } from "@/lib/whop-access";
import { runBulkPromoCodes, type PromoCodeSpec } from "@/features/whop-agent/server/bulk-promo-codes-service";

export const runtime = "nodejs";
export const maxDuration = 60;
export const revalidate = 0;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.whopUserId || !(await isAuthorizedForEngagement(session, id))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const specs: PromoCodeSpec[] = Array.isArray(body?.codes) ? body.codes : [];
  if (specs.length === 0 || !specs.every((s) => typeof s?.code === "string" && Array.isArray(s?.planIds))) {
    return NextResponse.json({ error: "codes[] is required, each with code and planIds[]." }, { status: 400 });
  }
  try {
    const result = await runBulkPromoCodes(id, specs, { dryRun: body.dryRun });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run Bulk Promo Code Generation.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
