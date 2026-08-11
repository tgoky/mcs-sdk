// src/app/dashboard/engagements/[id]/skills/win-back/page.tsx
//
// Same pattern as the Pile-On skill page, but Win-Back had two orphaned
// pieces to reconnect instead of one: WinBackPipeline (full pipeline,
// never mounted) and WinBackRevenueSection (never mounted, and its data
// dependency — computeWinBackRevenueAttribution — was already being
// called on the main engagement page but its result was discarded
// in-place: `await computeWinBackRevenueAttribution(id);` with no
// assignment. This page is what that call was actually for.
//
// WinBackRevenueSection filters its `initialEnrollments` prop client-side
// across four hardcoded 2026 quarters (see win-back-revenue-section.tsx),
// so the initial fetch needs to cover the full year rather than
// computeWinBackRevenueAttribution's own default of "current quarter."
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { SetBreadcrumbLabel } from "@/components/breadcrumbs/breadcrumb-context";
import { computeWinBackRevenueAttribution } from "@/features/win-back/server/revenue-attribution";
import { WinBackPipeline } from "../../win-back-pipeline";
import { WinBackRevenueSection } from "../../win-back-revenue-section";

export const revalidate = 0;

export default async function WinBackSkillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();

  const [engagement] = await db
    .select({ engagementId: engagements.engagementId, buyer: engagements.buyer })
    .from(engagements)
    .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session?.whopUserId ?? "")))
    .limit(1);

  if (!engagement) notFound();

  const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
  const revenue = await computeWinBackRevenueAttribution(id, yearStart);

  return (
    <div className="space-y-6 font-sans antialiased">
      <SetBreadcrumbLabel label={`${engagement.buyer} · Win-Back`} />
      <BackLink href={`/dashboard/engagements/${id}`} label="Back to engagement" />

      <div>
        <h1 className="text-lg font-bold text-white">Win-Back — {engagement.buyer}</h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          Every recovery enrollment this engagement has ever run, not just today&apos;s calendar.
        </p>
      </div>

      <WinBackRevenueSection
        engagementId={id}
        offerPrice={revenue.offerPrice}
        initialEnrollments={revenue.recoveredEnrollments}
        initialPeriodLabel={revenue.periodLabel}
      />

      <WinBackPipeline engagementId={id} />
    </div>
  );
}
