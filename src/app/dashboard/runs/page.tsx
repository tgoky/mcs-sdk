import { db } from "@/lib/db";
import { skillRuns, engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getQueueItems } from "@/lib/queue";
import { getActiveWorkspace } from "@/lib/workspace";
import { eq, and, desc, sql } from "drizzle-orm";
import { LiveExecutionFeed } from "../live-execution-feed";
import { latestStepLabel } from "@/lib/run-display";
import { markExecutionsSeen } from "@/lib/run-log";
import { EXECUTIONS_TOOLBAR_COPY as copy, skillName as skillDisplayName } from "@/lib/copy";
import { SquishySkillBadge, SKILL_SQUISHY_CONFIG } from "@/components/squishy-skill-badge";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Full-page version of the Live Executions feed. Same component (and the
 * same 150-run "live window", not a full historical archive — see
 * FETCH_WINDOW in live-execution-feed.tsx) as the compact widget on the
 * dashboard overview and the per-module history on /dashboard/modules/[skill];
 * this page exists so the sidebar's "Executions" nav item has a focused
 * destination of its own, the same way /dashboard/queue exists for Queue.
 */
export default async function RunsPage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const activeWorkspace = await getActiveWorkspace(whopUserId);
  const workspaceId = activeWorkspace.workspaceId;

  const [rows, , queueItems] = await Promise.all([
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
        engagementPausedAt: engagements.pausedAt,
        errorMessage: skillRuns.errorMessage,
        steps: skillRuns.steps,
        stepCount: sql<number>`coalesce(jsonb_array_length(${skillRuns.steps}), 0)`,
        // 5-field "what happened" record — lets the Action cell show the
        // run's real outcome instead of one static sentence per skill.
        summary: skillRuns.summary,
      })
      .from(skillRuns)
      .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
      .where(and(eq(engagements.whopUserId, whopUserId), eq(engagements.workspaceId, workspaceId)))
      .orderBy(desc(skillRuns.startedAt))
      .limit(150),
    // Clears the Executions nav badge's unseen-completed count — see
    // getUnseenCompletedExecutionCount's doc (run-log.ts). Run alongside
    // the row fetch rather than after it so visiting this page doesn't
    // pick up any extra latency for it.
    markExecutionsSeen(whopUserId),
    getQueueItems(whopUserId, workspaceId),
  ]);

  const runs = rows.map(({ steps, startedAt, completedAt, ...rest }) => ({
    ...rest,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt ? completedAt.toISOString() : null,
    engagementPausedAt: rest.engagementPausedAt ? rest.engagementPausedAt.toISOString() : null,
    subjectLabel: latestStepLabel(steps),
  }));

  // At-a-glance per-skill breakdown for the strip below — counts within
  // this page's existing 150-run live window (see the file comment
  // above), not a lifetime total. Only counts skills SquishySkillBadge
  // actually has art for; an unrecognized skillName is silently dropped
  // here rather than showing a blank/broken badge.
  const skillCounts = new Map<string, number>();
  for (const run of runs) {
    if (!SKILL_SQUISHY_CONFIG[run.skillName]) continue;
    skillCounts.set(run.skillName, (skillCounts.get(run.skillName) ?? 0) + 1);
  }

  return (
    <div className="relative min-h-screen w-full text-zinc-600 dark:text-zinc-400 font-sans tracking-tight antialiased select-none px-1 transition-colors duration-200 overflow-hidden pb-10">
      
      {/* --- HYPER-MICRO TIGHT DOT GRID (0.5px / 6px grid) --- */}
      <div 
        className="pointer-events-none absolute inset-0 z-0 bg-dot-grid" 
        aria-hidden="true"
      />

      {/* --- PAGE CONTENT --- */}
      <div className="relative z-10 space-y-5">
        <div className="border-b border-zinc-200 dark:border-zinc-900 pb-3">
          <h1 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 tracking-tight">
            {copy.allExecutionsTitle}
          </h1>
          <p className="text-sm font-normal text-zinc-400 dark:text-zinc-500">
            Every skill run across your engagements — filter by module, status, or client below.
          </p>

          {skillCounts.size > 0 && (
            <div className="flex items-center gap-3 pt-3" role="list" aria-label="Runs by skill">
              {Array.from(skillCounts.entries()).map(([skill, n]) => (
                <div key={skill} role="listitem" title={`${n} ${skillDisplayName(skill)} run${n === 1 ? "" : "s"}`}>
                  <SquishySkillBadge skill={skill} size={30} count={n} />
                </div>
              ))}
            </div>
          )}
        </div>

        <LiveExecutionFeed initialRuns={runs} title={copy.allExecutionsTitle} storageKey="all" />

        {queueItems.length > 0 && (
          <p className="text-xs font-mono text-zinc-400 dark:text-zinc-600 pt-1">
            {queueItems.length} item{queueItems.length === 1 ? "" : "s"} waiting in the{" "}
            <Link href="/dashboard/queue" className="underline hover:text-zinc-600 dark:hover:text-zinc-400">
              Queue
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}