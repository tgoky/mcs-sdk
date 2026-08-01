import { db } from "@/lib/db";
import { projects, projectEngagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { and, eq, isNull, desc, sql } from "drizzle-orm";
import Link from "next/link";
import { Plus, FolderKanban } from "lucide-react";
import { SKILL_INFO } from "@/lib/copy";
import type { SkillId } from "@/lib/skill-manifest";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProjectsPage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      enabledSkills: projects.enabledSkills,
      createdAt: projects.createdAt,
      memberCount: sql<number>`count(${projectEngagements.id})`,
    })
    .from(projects)
    .leftJoin(projectEngagements, eq(projectEngagements.projectId, projects.id))
    .where(and(eq(projects.whopUserId, whopUserId), isNull(projects.deletedAt)))
    .groupBy(projects.id)
    .orderBy(desc(projects.createdAt));

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Projects</h1>
        <Link
          href="/dashboard/projects/new"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gold text-gold-foreground rounded-md hover:opacity-90 transition-opacity"
        >
          <Plus className="w-3.5 h-3.5" />
          New project
        </Link>
      </div>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
        Group clients together and pick which skills run for them by default — e.g. Leak Map + Win-Back only, no
        Pre-Call Read.
      </p>

      {rows.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
          <FolderKanban className="w-8 h-8 mx-auto text-zinc-300 dark:text-zinc-700 mb-3" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">No projects yet.</p>
          <Link
            href="/dashboard/projects/new"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gold text-gold-foreground rounded-md hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" />
            Create your first project
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((project) => {
            const skills = (project.enabledSkills ?? []) as SkillId[];
            return (
              <Link
                key={project.id}
                href={`/dashboard/projects/${project.id}`}
                className="flex items-center justify-between rounded-xl border border-zinc-200 dark:border-zinc-900 bg-white dark:bg-zinc-900/30 px-4 py-3.5 hover:border-zinc-300 dark:hover:border-zinc-800 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 shrink-0 rounded-[6px] bg-teal-500/90 flex items-center justify-center">
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                        <path d="M2 9L6 13L14 3" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{project.name}</p>
                  </div>
                  {project.description && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1 truncate pl-7">{project.description}</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-2 pl-7">
                    {skills.length === 0 ? (
                      <span className="text-[11px] text-zinc-400 dark:text-zinc-600">No default skills set</span>
                    ) : (
                      skills.map((skillId) => (
                        <span
                          key={skillId}
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                        >
                          {SKILL_INFO[skillId]?.name ?? skillId}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <span className="text-xs text-zinc-400 dark:text-zinc-600 shrink-0 pl-3">
                  {Number(project.memberCount)} client{Number(project.memberCount) === 1 ? "" : "s"}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
