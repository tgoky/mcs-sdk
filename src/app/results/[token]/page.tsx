// A client's results, opened from a no-login share link
// (features/reports/server/share-links.ts). Read-only: what the products
// did in the last 30 days, and what they did together. Every dollar says
// where it comes from: paid (Whop's own payment records) or an estimate.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { eq } from "drizzle-orm";
import { openShareLink } from "@/features/reports/server/share-links";
import { getClientResults } from "@/features/reports/server/client-results";
import { getConnectedResults } from "@/features/reports/server/connected-results";
import { getEnabledWorkerIdsForEngagement } from "@/lib/engagement-skills";
import { WORKER_REGISTRY } from "@/lib/worker-registry";
import { HoldoutCard, ProductResultsGrid, ShowRateThenNowCard } from "@/components/analytics/client-results-section";
import { ConnectedResultsCard } from "@/components/analytics/connected-results-card";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Results", robots: { index: false, follow: false } };

export default async function SharedResultsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const engagementId = await openShareLink(token);
  if (!engagementId) notFound();

  const [engagement] = await db
    .select({ buyer: engagements.buyer, offerDetails: engagements.offerDetails, deletedAt: engagements.deletedAt })
    .from(engagements)
    .where(eq(engagements.engagementId, engagementId))
    .limit(1);
  if (!engagement || engagement.deletedAt) notFound();

  const offer = engagement.offerDetails as Record<string, unknown> | null;
  const now = new Date();
  const workerIds = await getEnabledWorkerIdsForEngagement(engagementId);
  const productsOn = new Set(workerIds.map((w) => WORKER_REGISTRY[w].productId));
  const [[results], connected] = await Promise.all([
    getClientResults([{ engagementId, buyer: engagement.buyer, offerPrice: typeof offer?.price === "string" ? offer.price : null }], now),
    getConnectedResults(engagementId, productsOn, now).catch(() => null),
  ]);

  const updated = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const nothingYet = !connected && results.products.length === 0 && !results.showRate;

  return (
    <main className="min-h-screen bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <header className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">Results</p>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{engagement.buyer}</h1>
          <p className="text-sm text-zinc-500">Last 30 days, compared with the 30 before. Updated {updated}.</p>
        </header>

        {nothingYet && <p className="text-sm text-zinc-600 dark:text-zinc-400">Nothing to show yet. Results appear here as calls, emails, reviews and payments come in.</p>}

        {connected && <ConnectedResultsCard connected={connected} />}
        {results.showRate && <ShowRateThenNowCard showRate={results.showRate} />}
        {results.holdout && <HoldoutCard holdout={results.holdout} />}
        {results.products.length > 0 && <ProductResultsGrid products={results.products} />}

        <footer className="space-y-1 border-t border-zinc-200 pt-4 text-xs text-zinc-500 dark:border-zinc-800">
          <p>
            <b>Paid</b> amounts are the payment processor&apos;s own records. <b>Estimated</b> value is extra shows times the offer price on file, not closed revenue. People are matched across tools by email.
          </p>
          <p>This page is shared by link. Anyone with the link can see it until it&apos;s turned off.</p>
        </footer>
      </div>
    </main>
  );
}
