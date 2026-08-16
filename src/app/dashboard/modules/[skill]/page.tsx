import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { isSkillId, SKILL_MANIFEST } from "@/lib/skill-manifest";
import { db } from "@/lib/db";
import { skillRuns, engagements } from "@/models/schema";
import { and, eq, desc, sql } from "drizzle-orm";
import { type SkillName } from "@/lib/copy";
import { getModuleClientSummaries } from "@/lib/module-overview";
import { getActiveWorkspace } from "@/lib/workspace";

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
  const activeWorkspace = await getActiveWorkspace(whopUserId);
  const workspaceId = activeWorkspace.workspaceId;

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
    .where(
      and(
        eq(engagements.whopUserId, whopUserId),
        eq(engagements.workspaceId, workspaceId),
        eq(skillRuns.skillName, skill)
      )
    )
    .orderBy(desc(skillRuns.startedAt))
    .limit(50);

  const recentRuns = recentRunsRaw.map((r) => ({
    ...r,
    startedAt: r.startedAt.toISOString(),
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  }));

  // One row per CLIENT for this skill — every client that has this skill
  // available, not just whoever happened to land in the 50 most recent
  // runs above.
  const clientSummaries = await getModuleClientSummaries(whopUserId, workspaceId, skill);

  const manifest = SKILL_MANIFEST[skill];

  return (
    <div className="w-full max-w-none -mt-6 -mx-2 sm:-mx-6 pt-0 px-2 sm:px-6 pb-6 font-sans antialiased text-zinc-100">
      <ModuleClientRoster
        summaries={clientSummaries}
        manifest={manifest}
        skill={skill}
        runs={recentRuns}
      />
    </div>
  );
}