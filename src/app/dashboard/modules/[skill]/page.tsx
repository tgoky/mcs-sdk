// src/app/dashboard/modules/[skill]/page.tsx

import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { getModuleClientSummaries } from "@/lib/module-overview";
import { isSkillId, SKILL_MANIFEST } from "@/lib/skill-manifest";
import { db } from "@/lib/db";
import { skillRuns, engagements } from "@/models/schema";
import { and, eq, desc, sql } from "drizzle-orm";
import { SKILL_INFO, type SkillName } from "@/lib/copy";
import { LiveExecutionFeed } from "../../live-execution-feed";

// Import Specialized Portfolio Views
import { PinDownModuleView } from "@/components/pin-down-module-view";
import { PileOnModuleView } from "@/components/pile-on-module-view";
import { PreCallReadModuleView } from "@/components/pre-call-reads-module-view";
import { WinBackModuleView } from "@/components/win-back-module-view";
import { LeakMapModuleView } from "@/components/leak-map-module-views";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ModulePage({
  params,
}: {
  params: Promise<{ skill: string }>;
}) {
  // 1. Next.js 15: Await async params
  const { skill: rawSkill } = await params;

  if (!rawSkill || !isSkillId(rawSkill)) {
    notFound();
  }

  const skill = rawSkill as SkillName;
  const info = SKILL_INFO[skill];

  const session = await getSession();
  const whopUserId = session.whopUserId!;

  // 2. Fetch both client summaries AND recent executions for this specific skill
  const [clientSummaries, recentRunsRaw] = await Promise.all([
    getModuleClientSummaries(whopUserId, skill),
    db
      .select({
        id: skillRuns.id,
        skillName: skillRuns.skillName,
        status: skillRuns.status,
        phase: skillRuns.phase,
        startedAt: skillRuns.startedAt,
        completedAt: skillRuns.completedAt,
        engagementId: skillRuns.engagementId,
        buyerName: engagements.buyer,
        errorMessage: skillRuns.errorMessage,
        stepCount: sql<number>`coalesce(jsonb_array_length(${skillRuns.steps}), 0)`,
      })
      .from(skillRuns)
      .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
      .where(and(eq(engagements.whopUserId, whopUserId), eq(skillRuns.skillName, skill)))
      .orderBy(desc(skillRuns.startedAt))
      .limit(50),
  ]);

  const recentRuns = recentRunsRaw.map((r) => ({
    ...r,
    startedAt: r.startedAt.toISOString(),
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  }));

  const manifest = SKILL_MANIFEST[skill];

  return (
    <div className="p-6 space-y-8 max-w-[1600px] mx-auto font-sans antialiased text-zinc-100">
      {/* Tier 1: Specialized Module Portfolio View */}
      {skill === "pin-down" && (
        <PinDownModuleView summaries={clientSummaries} manifest={manifest} />
      )}
      {skill === "pile-on" && (
        <PileOnModuleView summaries={clientSummaries} manifest={manifest} />
      )}
      {skill === "pre-call-read" && (
        <PreCallReadModuleView summaries={clientSummaries} manifest={manifest} />
      )}
      {skill === "win-back" && (
        <WinBackModuleView summaries={clientSummaries} manifest={manifest} />
      )}
      {skill === "leak-map" && (
        <LeakMapModuleView summaries={clientSummaries} manifest={manifest} />
      )}

      {/* Tier 2: Filtered Live Execution Feed (1-Click Access to runId Receipts) */}
      <LiveExecutionFeed
        initialRuns={recentRuns}
        apiUrl={`/api/skill-runs/recent?skill=${skill}`}
        title={`${info.name} history`}
        lockedSkill={skill}
        storageKey={skill}
      />
    </div>
  );
}