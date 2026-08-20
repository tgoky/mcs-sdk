// src/app/dashboard/engagements/[id]/skills/win-back/page.tsx

import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { SetBreadcrumbLabel } from "@/components/breadcrumbs/breadcrumb-context";
import { computeWinBackRevenueAttribution } from "@/features/win-back/server/revenue-attribution";
import { WinBackPipeline } from "../../win-back-pipeline";
import { WinBackRevenueSection } from "../../win-back-revenue-section";
import { WinBackCadencePreview } from "../../win-back-cadence-preview";

export const revalidate = 0;

export default async function WinBackSkillPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
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

  const isFromModule = from && from.startsWith("/dashboard/modules");
  const backHref = isFromModule ? from : `/dashboard/engagements/${id}`;
  const backLabel = isFromModule ? "Back to Module" : "Back to engagement";

  return (
    <div className="space-y-6 font-sans antialiased">
      <SetBreadcrumbLabel label={`${engagement.buyer} · Booking Recovery`} />

      {/* Clean Single Header Section */}
      <div className="flex items-center gap-3">
        <Link
          href={backHref}
          className="flex items-center justify-center w-8 h-8 rounded-full border border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/80 dark:bg-zinc-900/80 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 transition-colors shrink-0"
          aria-label={backLabel}
          title={backLabel}
        >
          <ChevronLeft className="w-4 h-4" />
        </Link>

        <div>
          <h1 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight font-sans">
            Booking Recovery — {engagement.buyer}
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 font-sans mt-0.5">
            Every enrolled prospect across the whole recovery cadence — not one run page at a time.
          </p>
        </div>
      </div>

      <WinBackPipeline engagementId={id} />

      <WinBackCadencePreview assetMap={engagement.winBackSequenceAssetMap} engagementId={id} />

      <WinBackRevenueSection
        engagementId={id}
        offerPrice={revenue.offerPrice}
        initialEnrollments={revenue.recoveredEnrollments}
        initialPeriodLabel={revenue.periodLabel}
      />
    </div>
  );
}