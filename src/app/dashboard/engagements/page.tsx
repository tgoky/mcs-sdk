import { db } from "@/lib/db";
import { engagements, skillRuns } from "@/models/schema";
import { getSession } from "@/lib/session";
import { eq, desc, inArray, isNull, and } from "drizzle-orm";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getActiveWorkspace } from "@/lib/workspace";
import { ClientRosterTable } from "./client-roster-table";

export const revalidate = 0;

export default async function EngagementsPage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const activeWorkspace = await getActiveWorkspace(whopUserId);

  const userEngagements = await db
    .select()
    .from(engagements)
    .where(
      and(
        eq(engagements.whopUserId, whopUserId),
        eq(engagements.workspaceId, activeWorkspace.workspaceId),
        isNull(engagements.deletedAt)
      )
    );

  const targetEngagementIds = userEngagements.map((e) => e.engagementId);

  const allRuns =
    targetEngagementIds.length > 0
      ? await db
          .select({
            engagementId: skillRuns.engagementId,
            skillName: skillRuns.skillName,
            status: skillRuns.status,
            completedAt: skillRuns.completedAt,
          })
          .from(skillRuns)
          .where(inArray(skillRuns.engagementId, targetEngagementIds))
          .orderBy(desc(skillRuns.startedAt))
      : [];

  return (
    <div className="space-y-4 w-full mx-auto tracking-tight antialiased font-sans px-1 text-zinc-600 dark:text-zinc-400 transition-colors duration-200">
      {/* Asana Header Bar */}
      <div className="flex flex-col space-y-3 sm:flex-row sm:justify-between sm:items-center sm:space-y-0 border-b border-zinc-200 dark:border-zinc-800/80 pb-3">
        <div className="space-y-0.5">
          <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Client Portfolio
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Real-time module telemetry across all active client automations in {activeWorkspace.name}.
          </p>
        </div>

        {/* <Link
          href="/dashboard/engagements/new"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 rounded-lg shadow-xs hover:bg-zinc-800 dark:hover:bg-zinc-200 active:scale-[0.98] transition-all"
        >
          <Plus size={14} strokeWidth={2.5} />
          <span>Add Client</span>
        </Link> */}
      </div>

      {/* Empty State */}
      {userEngagements.length === 0 ? (
        <div className="h-40 border border-dashed border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-transparent rounded-xl flex flex-col items-center justify-center space-y-2 transition-colors">
          <p className="text-xs font-normal text-zinc-400 dark:text-zinc-500 font-mono">
            No active client engagements found in this workspace.
          </p>
          <Link
            href="/dashboard/engagements/new"
            className="text-xs font-semibold text-amber-500 hover:underline transition-colors"
          >
            Add your first client →
          </Link>
        </div>
      ) : (
        /* Asana Dense Table View Wrapper */
        <div className="w-full space-y-1.5">
          {/* Table Header Labels */}
          <div className="hidden md:flex items-center justify-between px-3 text-[10px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500 pb-1">
            <span className="w-52">Client Name</span>
            <span className="flex-1 px-4">Connected Stack</span>
            <span className="w-44 text-center">Module Telemetry</span>
            <span className="w-24 text-right">Created</span>
          </div>

          <ClientRosterTable engagements={userEngagements} runs={allRuns} />
        </div>
      )}
    </div>
  );
}
