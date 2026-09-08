import { getSession } from "@/lib/session";
import { LibraryMarketplaceClient } from "@/components/library/library-marketplace-client";
import { getActiveWorkspace, getPrimaryEngagementIdForWorkspace } from "@/lib/workspace";
import { getEnabledWorkerIdsForEngagement } from "@/lib/engagement-skills";
import { getWorkspaceWorkerOverview } from "@/lib/worker-analytics";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LibraryPage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const workspace = await getActiveWorkspace(whopUserId);
  const engagementId = await getPrimaryEngagementIdForWorkspace(workspace.workspaceId);
  const [enabledWorkerIds, buyerName, overview] = await Promise.all([
    engagementId ? getEnabledWorkerIdsForEngagement(engagementId) : Promise.resolve([]),
    engagementId
      ? db
          .select({ buyer: engagements.buyer })
          .from(engagements)
          .where(eq(engagements.engagementId, engagementId))
          .limit(1)
          .then((r) => r[0]?.buyer ?? null)
      : Promise.resolve(null),
    // Real workload per skill (runs/7d, success rate, needs-attention) —
    // the same rollup /dashboard/analytics/[workerId] already uses, so a
    // card's numbers can never disagree with that page's. This is the
    // "workload, what runs the most" a plain Install/Configure grid had no
    // way to show.
    getWorkspaceWorkerOverview(whopUserId, workspace.workspaceId),
  ]);

  return (
    <LibraryMarketplaceClient
      engagementId={engagementId}
      enabledWorkerIds={enabledWorkerIds}
      buyerName={buyerName}
      workerStats={overview.workers}
    />
  );
}
