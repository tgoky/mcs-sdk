import { getSession } from "@/lib/session";
import { getModuleClientSummaries } from "@/lib/module-overview";
import { SKILLS, SKILL_INFO } from "@/lib/copy";
import Link from "next/link";
import { AlertCircle, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SkillsPage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;

  const summaries = await Promise.all(SKILLS.map((skill) => getModuleClientSummaries(whopUserId, skill)));

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Skills</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
        The five things Showtime runs for your clients. Open one to see every client's status for it.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SKILLS.map((skill, i) => {
          const rows = summaries[i];
          const active = rows.filter((r) => r.skillEnabled).length;
          const withFailures = rows.filter((r) => r.consecutiveFailures > 0).length;

          return (
            <Link
              key={skill}
              href={`/dashboard/modules/${skill}`}
              className="group flex flex-col rounded-xl border border-zinc-200 dark:border-zinc-900 bg-white dark:bg-zinc-900/30 p-4 hover:border-zinc-300 dark:hover:border-zinc-800 transition-colors"
            >
              <div className="flex items-start justify-between">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{SKILL_INFO[skill].name}</h2>
                <ArrowRight className="w-4 h-4 text-zinc-300 dark:text-zinc-700 group-hover:text-zinc-500 dark:group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all" />
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1 mb-4">{SKILL_INFO[skill].description}</p>
              <div className="flex items-center gap-3 mt-auto text-xs">
                <span className="text-zinc-500 dark:text-zinc-400">
                  {active} of {rows.length} client{rows.length === 1 ? "" : "s"} active
                </span>
                {withFailures > 0 && (
                  <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400 font-medium">
                    <AlertCircle className="w-3 h-3" />
                    {withFailures} failing
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
