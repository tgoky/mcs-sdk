import { db } from "@/lib/db";
import { projects, projectEngagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { and, eq, isNull, desc, sql } from "drizzle-orm";
import Link from "next/link";
import { Plus, FolderKanban, ArrowRight } from "lucide-react";
import { SKILLS, SKILL_INFO, type SkillName } from "@/lib/copy";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import { SkillOrbitalRing } from "./skill-orbital-ring";

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
    <div className="relative min-h-screen w-full text-zinc-600 dark:text-zinc-400 font-sans tracking-tight antialiased select-none px-1 transition-colors duration-200 overflow-hidden pb-10">
      
      {/* --- HYPER-MICRO TIGHT DOT GRID OVERLAY --- */}
      <div 
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(#cbd5e1_0.5px,transparent_0.5px)] dark:bg-[radial-gradient(#3f3f46_0.5px,transparent_0.5px)] [background-size:6px_6px] [mask-image:radial-gradient(ellipse_75%_75%_at_50%_30%,#000_50%,transparent_100%)] opacity-70" 
        aria-hidden="true"
      />

      {/* --- PAGE CONTENT --- */}
      <div className="relative z-10 space-y-6 max-w-4xl mx-auto">
        
        {/* Header Hero Banner with Transparent Background */}
        <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 bg-transparent p-6 flex flex-col sm:flex-row items-center justify-between gap-6 overflow-hidden">
          <div className="space-y-2 max-w-md">
            <div className="flex items-center gap-2">
            
            </div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Project Archetypes
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed font-sans">
              Group clients into shared automation templates. Define which skills run by default across your portfolio engagements.
            </p>
            <div className="pt-2">
              {/* <Link
                href="/dashboard/projects/new"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 rounded-lg shadow-xs hover:bg-zinc-800 dark:hover:bg-zinc-200 active:scale-[0.98] transition-all"
              >
                <Plus size={14} strokeWidth={2.5} />
                <span>Create New Project</span>
              </Link> */}
            </div>
          </div>

          {/* Interactive Orbital Skill Ring Showcase */}
          <div className="shrink-0 py-2">
            <SkillOrbitalRing size={200} />
          </div>
        </div>

        {/* Projects Roster */}
        {rows.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-zinc-200 dark:border-zinc-800/80 rounded-2xl bg-white/40 dark:bg-zinc-900/20">
            <FolderKanban className="w-8 h-8 mx-auto text-zinc-400 dark:text-zinc-600 mb-3" />
            <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200 mb-1">No projects created yet</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4 max-w-sm mx-auto font-sans">
              Set up your first project archetype to standardize skill configurations across clients.
            </p>
            <Link
              href="/dashboard/projects/new"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-teal-600 text-white dark:bg-teal-500 rounded-lg shadow-xs hover:bg-teal-700 transition-all"
            >
              <Plus size={14} strokeWidth={2.5} />
              Create your first project
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-zinc-400 dark:text-zinc-500">
              Active Projects ({rows.length})
            </h2>

            <div className="grid grid-cols-1 gap-3">
              {rows.map((project) => {
                const enabledSkillList = (project.enabledSkills ?? []) as SkillName[];

                return (
                  <Link
                    key={project.id}
                    href={`/dashboard/projects/${project.id}`}
                    className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-900/50 p-4 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-all shadow-2xs"
                  >
                    <div className="space-y-2 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors truncate">
                          {project.name}
                        </span>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 shrink-0">
                          {Number(project.memberCount)} client{Number(project.memberCount) === 1 ? "" : "s"}
                        </span>
                      </div>

                      {project.description && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1 font-sans">
                          {project.description}
                        </p>
                      )}

                      {/* Enabled Skills Badges Strip */}
                      <div className="flex items-center gap-1.5 pt-1">
                        {SKILLS.map((skill) => {
                          const isEnabled = enabledSkillList.includes(skill);
                          return (
                            <div
                              key={skill}
                              title={`${SKILL_INFO[skill].name}: ${isEnabled ? "Active" : "Disabled"}`}
                            >
                              <SquishySkillBadge
                                skill={skill}
                                size={22}
                                enabled={isEnabled}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center font-mono text-xs text-zinc-400">
                      <span>Manage Archetype</span>
                      <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}