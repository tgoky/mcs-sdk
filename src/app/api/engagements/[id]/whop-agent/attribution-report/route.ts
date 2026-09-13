import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAuthorizedForEngagement } from "@/lib/whop-access";
import { dispatchAttributionReportRun } from "@/features/whop-agent/server/attribution-report-service";

export const runtime = "nodejs";
export const maxDuration = 60;
export const revalidate = 0;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.whopUserId || !(await isAuthorizedForEngagement(session, id))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await dispatchAttributionReportRun(id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run the Attribution & Affiliate Report.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
