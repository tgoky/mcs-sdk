import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { isSkillId, SKILL_MANIFEST } from "@/lib/skill-manifest";
import { db } from "@/lib/db";
import { skillRuns, engagements } from "@/models/schema";
import { and, eq, desc, sql } from "drizzle-orm";
import { type SkillName } from "@/lib/copy";
import { getModuleClientSummaries } from "@/lib/module-overview";

// Import Portfolio Views
import { PinDownModuleView } from "@/components/pin-down-module-view";
import { PileOnModuleView } from "@/components/pile-on-module-view";
import { PreCallReadModuleView } from "@/components/pre-call-read-module-view";
import { WinBackModuleView } from "@/components/win-back-module-view";
import { LeakMapModuleView } from "@/components/leak-map-module-views";
import { ModuleClientRoster } from "@/components/module-client-roster";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ModulePage({
  params,
}: {
  params: Promise<{ skill: string }>;
}) {
  const { skill: rawSkill } = await params;

  if (!rawSkill || !isSkillId(rawSkill)) {
    notFound();
  }

  const skill = rawSkill as SkillName;

  const session = await getSession();
  const whopUserId = session.whopUserId!;

  // Fetch recent executions directly for the requested skill
  const recentRunsRaw = await db
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
    .limit(50);

  const recentRuns = recentRunsRaw.map((r) => ({
    ...r,
    startedAt: r.startedAt.toISOString(),
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  }));

  const clientSummaries = await getModuleClientSummaries(whopUserId, skill);
  const manifest = SKILL_MANIFEST[skill];

  const activityView = (
    <>
      {skill === "pin-down" && <PinDownModuleView runs={recentRuns} manifest={manifest} />}
      {skill === "pile-on" && <PileOnModuleView runs={recentRuns} manifest={manifest} />}
      {skill === "pre-call-read" && <PreCallReadModuleView runs={recentRuns} manifest={manifest} />}
      {skill === "win-back" && <WinBackModuleView runs={recentRuns} manifest={manifest} />}
      {skill === "leak-map" && <LeakMapModuleView runs={recentRuns} manifest={manifest} />}
    </>
  );

  return (
    <div className="w-full max-w-none -mt-6 -mx-2 sm:-mx-6 pt-0 px-2 sm:px-6 pb-6 font-sans antialiased text-zinc-100">
      <ModuleClientRoster
        summaries={clientSummaries}
        manifest={manifest}
        skill={skill}
        activity={activityView}
      />
    </div>
  );
}