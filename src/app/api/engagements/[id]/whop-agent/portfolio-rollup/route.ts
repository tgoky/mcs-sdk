import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAuthorizedForEngagement } from "@/lib/whop-access";
import { dispatchPortfolioRollupRun } from "@/features/whop-agent/server/portfolio-rollup-service";

export const runtime = "nodejs";
export const revalidate = 0;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.whopUserId || !(await isAuthorizedForEngagement(session, id))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const runId = await dispatchPortfolioRollupRun(id);
    return NextResponse.json({ runId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start the Portfolio Rollup.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
