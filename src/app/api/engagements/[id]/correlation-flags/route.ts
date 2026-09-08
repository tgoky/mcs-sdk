import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAuthorizedForEngagement } from "@/lib/whop-access";
import { getEnabledWorkerIdsForEngagement } from "@/lib/engagement-skills";
import { getReportBlocksForEngagement } from "@/lib/worker-report-blocks";
import { computeCorrelationFlags } from "@/lib/report-correlation";
import { startOfWeek } from "@/lib/dashboard-stats";

/**
 * This week's cross-product correlation flags for one engagement — the
 * same computation Reports/Analytics already do, exposed as a read here
 * for surfaces that aren't themselves a server component fetching
 * report blocks, e.g. Leak Map's client-side run-detail view (Phase D of
 * the worker-blending pass).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.whopUserId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id: engagementId } = await params;

  if (!(await isAuthorizedForEngagement(session, engagementId))) {
    return NextResponse.json({ error: "You don't have access to this engagement." }, { status: 403 });
  }

  const enabledWorkerIds = await getEnabledWorkerIdsForEngagement(engagementId);
  const weekBlocks = await getReportBlocksForEngagement(engagementId, enabledWorkerIds, { start: startOfWeek(new Date()) });
  const flags = computeCorrelationFlags(weekBlocks);

  return NextResponse.json({ flags });
}
