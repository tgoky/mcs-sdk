\// src/app/dashboard/engagements/[id]/skills/win-back/page.tsx
//
// The per-client, whole-history view for one skill — distinct from
// runs/[id] (one run) and the master roster calendar (all skills, one
// day).
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { SetBreadcrumbLabel } from "@/components/breadcrumbs/breadcrumb-context";
import { computeWinBackRevenueAttribution } from "@/features/win-back/server/revenue-attribution";
import { WinBackPipeline } from "../../win-back-pipeline";
import { WinBackRevenueSection } from "../../win-back-revenue-section";
import { WinBackCadencePreview } from "../../win-back-cadence-preview";

export const revalidate = 0;

export default async function WinBackSkillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const activeWorkspace = await getActiveWorkspace(session?.whopUserId ?? "");

  const [engagement] = await db
    .select({
      engagementId: engagements.engagementId,
      buyer: engagements.buyer,
      winBackSequenceAssetMap: engagements.winBackSequenceAssetMap,
    })
    .from(engagements)
    .where(
      and(
        eq(engagements.engagementId, id),
        eq(engagements.whopUserId, session?.whopUserId ?? ""),
        eq(engagements.workspaceId, activeWorkspace.workspaceId)
      )
    )
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

      <WinBackPipeline engagementId={id} />

      <WinBackCadencePreview assetMap={engagement.winBackSequenceAssetMap} />

      <WinBackRevenueSection
        engagementId={id}
        offerPrice={revenue.offerPrice}
        initialEnrollments={revenue.recoveredEnrollments}
        initialPeriodLabel={revenue.periodLabel}
      />
    </div>
  );
}