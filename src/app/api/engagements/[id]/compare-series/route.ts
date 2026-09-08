import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAuthorizedForEngagement } from "@/lib/whop-access";
import { getComparisonSeries } from "@/features/reports/server/compare-service";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.whopUserId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id: engagementId } = await params;

  if (!(await isAuthorizedForEngagement(session, engagementId))) {
    return NextResponse.json({ error: "You don't have access to this engagement." }, { status: 403 });
  }

  const weeksParam = new URL(req.url).searchParams.get("weeks");
  const weeksBack = weeksParam ? Math.min(26, Math.max(1, parseInt(weeksParam, 10) || 8)) : 8;

  const series = await getComparisonSeries(engagementId, weeksBack);
  return NextResponse.json({ series });
}
