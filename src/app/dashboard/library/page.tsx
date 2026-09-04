import { getSession } from "@/lib/session";
import { getPackageOverview } from "@/lib/package-overview";
import { LibraryMarketplaceClient } from "@/components/library/library-marketplace-client";
import { getActiveWorkspace, getInstalledPackagesByWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LibraryPage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const [overview, workspace] = await Promise.all([getPackageOverview(whopUserId), getActiveWorkspace(whopUserId)]);
  const installedPackageIds = (await getInstalledPackagesByWorkspace([workspace.workspaceId])).get(workspace.workspaceId) ?? [];

  return <LibraryMarketplaceClient overview={overview} installedPackageIds={installedPackageIds} />;
}
