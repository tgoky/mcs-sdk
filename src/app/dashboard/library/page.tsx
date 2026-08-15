import { getSession } from "@/lib/session";
import { getPackageOverview } from "@/lib/package-overview";
import { PackageHeroCard } from "@/components/library/package-hero-card";
import { PackageTeaserCard } from "@/components/library/package-teaser-card";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LibraryPage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const overview = await getPackageOverview(whopUserId);

  return (
    <div className="w-full max-w-5xl space-y-8 px-6 py-6 font-sans">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">Library</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Everything available in this workspace.</p>
      </div>

      {/* App Store Product Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
        <PackageHeroCard overview={overview} />
        <PackageTeaserCard />
      </div>
    </div>
  );
}