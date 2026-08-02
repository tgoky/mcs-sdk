import { db } from "@/lib/db";
import { skillRuns, engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getModuleClientSummaries } from "@/lib/module-overview";
import { and, eq, desc, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { SKILLS, SKILL_INFO, type SkillName } from "@/lib/copy";
import { LiveExecutionFeed } from "../../live-execution-feed";
import { ModuleCommandCenter } from "./module-command-center";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ModulePage({
  params,
}: {
  params: Promise<{ skill: string }>;
}) {
  // Await params to fix Next.js 15 404 error
  const { skill: rawSkill } = await params;

  if (!rawSkill || !SKILLS.includes(rawSkill as SkillName)) {
    notFound();
  }

  const skill = rawSkill as SkillName;
  const info = SKILL_INFO[skill];

  const session = await getSession();
  const whopUserId = session.whopUserId!;

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

  return (
    <div className="space-y-6 w-full text-zinc-600 dark:text-zinc-400 font-sans tracking-tight antialiased select-none px-1 transition-colors duration-200">
      {/* Asana Agency Command Center */}
      <ModuleCommandCenter
        skill={skill}
        info={info}
        summaries={clientSummaries}
      />

      {/* Live Activity Feed with Clickable Run IDs */}
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