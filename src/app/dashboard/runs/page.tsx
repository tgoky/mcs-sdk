import { db } from "@/lib/db";
import { skillRuns, engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getQueueItems } from "@/lib/queue";
import { eq, desc, sql } from "drizzle-orm";
import { LiveExecutionFeed } from "../live-execution-feed";
import { latestStepLabel } from "@/lib/run-display";
import { EXECUTIONS_TOOLBAR_COPY as copy } from "@/lib/copy";
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

  const rows = await db
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
    })
    .from(skillRuns)
    .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
    .where(eq(engagements.whopUserId, whopUserId))
    .orderBy(desc(skillRuns.startedAt))
    .limit(150);

  const runs = rows.map(({ steps, startedAt, completedAt, ...rest }) => ({
    ...rest,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt ? completedAt.toISOString() : null,
    engagementPausedAt: rest.engagementPausedAt ? rest.engagementPausedAt.toISOString() : null,
    subjectLabel: latestStepLabel(steps),
  }));

  const queueItems = await getQueueItems(whopUserId);

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