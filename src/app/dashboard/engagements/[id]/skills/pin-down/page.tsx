// src/app/dashboard/engagements/[id]/skills/pin-down/page.tsx

import { db } from "@/lib/db";
import { engagements, conversationIntelligenceSessions, type EngagementStack } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { and, eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { SetBreadcrumbLabel } from "@/components/breadcrumbs/breadcrumb-context";
import { DeliverablesPanel, type BrandVoiceProfile } from "../../deliverables-panel";

export const revalidate = 0;

export default async function PinDownSkillPage({
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
    .select()
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

  const conversationIntelligenceSessionRows = await db
    .select()
    .from(conversationIntelligenceSessions)
    .where(eq(conversationIntelligenceSessions.engagementId, id))
    .orderBy(desc(conversationIntelligenceSessions.createdAt))
    .limit(20);

  const conversationIntelligenceState = {
    enabled: (engagement.stack as EngagementStack | null)?.conversation_intelligence_provider === "recall_ai",
    lastProcessedAt: conversationIntelligenceSessionRows.find((s) => s.completedAt)?.completedAt?.toISOString(),
  };

  const isFromModule = from && from.startsWith("/dashboard/modules");
  const backHref = isFromModule ? from : `/dashboard/engagements/${id}`;
  const backLabel = isFromModule ? "Back to Module" : "Back to engagement";

  return (
    <div className="space-y-6 font-sans antialiased">
      <SetBreadcrumbLabel label={`${engagement.buyer} · Show Rate Setup`} />

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
            Show Rate Setup — {engagement.buyer}
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 font-sans mt-0.5">
            Brand voice, ad creative briefs, video scripts, and confirmation page — the one-time onboarding output, not an ongoing run.
          </p>
        </div>
      </div>

      <DeliverablesPanel
        engagementId={id}
        discoveryPrefill={engagement.discoveryPrefill}
        voiceScrapeArtifacts={engagement.voiceScrapeArtifacts}
        brandVoiceProfile={engagement.brandVoiceProfile as BrandVoiceProfile}
        adCreativeBriefs={engagement.adCreativeBriefs}
        pinDownScriptPack={engagement.pinDownScriptPack}
        pinDownPageAudit={engagement.pinDownPageAudit}
        conversationIntelligence={conversationIntelligenceState}
      />
    </div>
  );
}
