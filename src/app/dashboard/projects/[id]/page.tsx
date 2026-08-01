import { db } from "@/lib/db";
import { projects, projectEngagements, engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { and, eq, isNull, notInArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { SKILL_INFO } from "@/lib/copy";
import type { SkillId } from "@/lib/skill-manifest";
import { AddClientToProject } from "./add-client-to-project";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const whopUserId = session.whopUserId!;

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.whopUserId, whopUserId), isNull(projects.deletedAt)))
    .limit(1);

  if (!project) notFound();

  const members = await db
    .select({ engagementId: engagements.engagementId, buyer: engagements.buyer })
    .from(projectEngagements)
    .innerJoin(engagements, eq(engagements.engagementId, projectEngagements.engagementId))
    .where(and(eq(projectEngagements.projectId, id), isNull(engagements.deletedAt)));

  const memberIds = members.map((m) => m.engagementId);

  const availableClients = await db
    .select({ engagementId: engagements.engagementId, buyer: engagements.buyer })
    .from(engagements)
    .where(
      and(
        eq(engagements.whopUserId, whopUserId),
        isNull(engagements.deletedAt),
        memberIds.length > 0 ? notInArray(engagements.engagementId, memberIds) : undefined
      )
    );

  const enabledSkills = (project.enabledSkills ?? []) as SkillId[];

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-5 h-5 shrink-0 rounded-[6px] bg-teal-500/90 flex items-center justify-center">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
            <path d="M2 9L6 13L14 3" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{project.name}</h1>
      </div>
      {project.description && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6 pl-7">{project.description}</p>
      )}

      <div className="mb-8">
        <h2 className="text-xs font-semibold text-zinc-500 font-mono tracking-wider uppercase mb-2">
          Default skills
        </h2>
        {enabledSkills.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-600">No default skills set for this project.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {enabledSkills.map((skillId) => (
              <span
                key={skillId}
                className="text-xs font-medium px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
              >
                {SKILL_INFO[skillId]?.name ?? skillId}
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold text-zinc-500 font-mono tracking-wider uppercase">
            Clients ({members.length})
          </h2>
          <AddClientToProject projectId={project.id} availableClients={availableClients} />
        </div>

        {members.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-600">No clients in this project yet.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {members.map((member) => (
              <Link
                key={member.engagementId}
                href={`/dashboard/engagements/${member.engagementId}`}
                className="flex items-center gap-2.5 rounded-lg border border-zinc-200 dark:border-zinc-900 px-3 py-2.5 hover:border-zinc-300 dark:hover:border-zinc-800 transition-colors"
              >
                <span className="w-4 h-4 shrink-0 rounded-[5px] bg-teal-500/90 flex items-center justify-center text-[8px] font-bold text-white">
                  {member.buyer.slice(0, 1).toUpperCase()}
                </span>
                <span className="text-sm text-zinc-700 dark:text-zinc-300">{member.buyer}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
