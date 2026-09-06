import { getSession } from "@/lib/session";
import { LibraryMarketplaceClient } from "@/components/library/library-marketplace-client";
import { getActiveWorkspace, getPrimaryEngagementIdForWorkspace } from "@/lib/workspace";
import { getEnabledWorkerIdsForEngagement } from "@/lib/engagement-skills";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LibraryPage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const workspace = await getActiveWorkspace(whopUserId);
  const engagementId = await getPrimaryEngagementIdForWorkspace(workspace.workspaceId);
  const enabledWorkerIds = engagementId ? await getEnabledWorkerIdsForEngagement(engagementId) : [];

  return <LibraryMarketplaceClient engagementId={engagementId} enabledWorkerIds={enabledWorkerIds} />;
}
