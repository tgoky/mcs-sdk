import { getSession } from "@/lib/session";
import { getPackageOverview } from "@/lib/package-overview";
import { LibraryMarketplaceClient } from "@/components/library/library-marketplace-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LibraryPage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const overview = await getPackageOverview(whopUserId);

  return <LibraryMarketplaceClient overview={overview} />;
}