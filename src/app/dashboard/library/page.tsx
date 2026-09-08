import { getSession } from "@/lib/session";
import { LibraryMarketplaceClient } from "@/components/library/library-marketplace-client";
import { getActiveWorkspace, getPrimaryEngagementIdForWorkspace, getInstalledPackagesByWorkspace } from "@/lib/workspace";
import { getEnabledWorkerIdsForEngagement } from "@/lib/engagement-skills";
import { getWorkspaceWorkerOverview } from "@/lib/worker-analytics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LibraryPage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const workspace = await getActiveWorkspace(whopUserId);
  const engagementId = await getPrimaryEngagementIdForWorkspace(workspace.workspaceId);
  const [enabledWorkerIds, overview, installedPackageMap] = await Promise.all([
    engagementId ? getEnabledWorkerIdsForEngagement(engagementId) : Promise.resolve([]),
    // Real workload per skill (runs/7d, success rate, needs-attention) —
    // the same rollup /dashboard/analytics/[workerId] already uses, so a
    // card's numbers can never disagree with that page's. This is the
    // "workload, what runs the most" a plain Install/Configure grid had no
    // way to show.
    getWorkspaceWorkerOverview(whopUserId, workspace.workspaceId),
    // Which Workers (Showtime, Reputation Manager) are actually installed
    // for this workspace — the real top-level unit. A Skill (Show Rate
    // Setup, Pre-Call Sequence, ...) can only be enabled/configured once
    // its Worker is installed; it was never itself an installable thing.
    getInstalledPackagesByWorkspace([workspace.workspaceId]),
  ]);

  return (
    <LibraryMarketplaceClient
      engagementId={engagementId}
      enabledWorkerIds={enabledWorkerIds}
      workerStats={overview.workers}
      installedProductIds={installedPackageMap.get(workspace.workspaceId) ?? []}
    />
  );
}
