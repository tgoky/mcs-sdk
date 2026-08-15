import { getSession } from "@/lib/session";
import { getPackageOverview } from "@/lib/package-overview";
import { PackageHeroCard } from "@/components/library/package-hero-card";
import { PackageTeaserCard } from "@/components/library/package-teaser-card";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * The workspace's app store: browse what's available, see what it
 * actually does for you and how it's performing, open it. Structured
 * around packages (Showtime, Counter Claim) rather than a flat grid of
 * all 5 skills — the flat-grid version this replaced didn't distinguish
 * "a skill" from "a product," and had nowhere for a second product to
 * live once one exists.
 *
 * Showtime gets the full rich treatment because it's the one real,
 * active package in this workspace; Counter Claim gets an honest, quiet
 * teaser — no fabricated stats, no dead-end buttons, just what's true
 * today (see package-teaser-card.tsx).
 */
export default async function LibraryPage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const overview = await getPackageOverview(whopUserId);

  return (
    <div className="w-full max-w-3xl space-y-8 px-6 py-6 font-sans">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">Library</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Everything available in this workspace.</p>
      </div>

      <div className="space-y-3">
        <PackageHeroCard overview={overview} />
        <PackageTeaserCard />
      </div>
    </div>
  );
}
