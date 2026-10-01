// src/lib/client-metric-snapshots.ts
//
// Persistence for clientMetricSnapshots (see schema.ts for why this table
// exists) — the one thing Reports never had before: a real number from a
// real prior week to compare against, instead of three independently-
// recomputed "This week / This month / All time" tabs with no memory of
// each other.

import { db } from "@/lib/db";
import { clientMetricSnapshots } from "@/models/schema";
import { and, eq, gte, lt, desc, sql } from "drizzle-orm";
import type { WorkerReportBlock } from "@/lib/worker-report-blocks";

/**
 * Saves this week's blocks for the workers the caller reports on. Several
 * writers share one row per client per week (the Monday snapshot for every
 * enabled worker, then Whop Agent's own reports later in the week), so a
 * writer replaces only blocks belonging to `ownedWorkerIds` (by default,
 * the workers its own blocks are for) and keeps everyone else's. This used
 * to replace the whole row, so the Whop reports wiped the Monday snapshot.
 * The merge happens inside the upsert, so two writers can't lose each
 * other's blocks either.
 */
export async function recordWeeklySnapshot(
  engagementId: string,
  weekStart: Date,
  blocks: WorkerReportBlock[],
  ownedWorkerIds: string[] = Array.from(new Set(blocks.map((b) => b.workerId)))
): Promise<void> {
  const owned = JSON.stringify(ownedWorkerIds);
  await db
    .insert(clientMetricSnapshots)
    .values({ engagementId, weekStart, blocks })
    .onConflictDoUpdate({
      target: [clientMetricSnapshots.engagementId, clientMetricSnapshots.weekStart],
      set: {
        blocks: sql`(
          select coalesce(jsonb_agg(kept.block), '[]'::jsonb)
          from jsonb_array_elements(coalesce(${clientMetricSnapshots.blocks}, '[]'::jsonb)) as kept(block)
          where not (${owned}::jsonb ? (kept.block ->> 'workerId'))
        ) || excluded.blocks`,
      },
    });
}

/** The most recent snapshot strictly before `beforeWeekStart` — what a
 * block's trend arrow compares against. Null when this is the client's
 * first tracked week (a brand-new engagement, or one enabled after this
 * table started existing) — the UI shows no trend rather than a
 * misleading one computed against nothing. */
export async function getPriorSnapshot(
  engagementId: string,
  beforeWeekStart: Date
): Promise<{ weekStart: Date; blocks: WorkerReportBlock[] } | null> {
  const [row] = await db
    .select({ weekStart: clientMetricSnapshots.weekStart, blocks: clientMetricSnapshots.blocks })
    .from(clientMetricSnapshots)
    .where(and(eq(clientMetricSnapshots.engagementId, engagementId), lt(clientMetricSnapshots.weekStart, beforeWeekStart)))
    .orderBy(desc(clientMetricSnapshots.weekStart))
    .limit(1);
  if (!row) return null;
  return { weekStart: row.weekStart, blocks: row.blocks as WorkerReportBlock[] };
}

/** Every stored snapshot for this engagement in the last `weeksBack`
 * weeks, oldest first — the raw material for the Compare view
 * (compare-service.ts). Naturally short or empty for a client that
 * predates this table, or one whose first Monday snapshot hasn't run
 * yet; the UI reads that as "not enough history yet," not an error. */
export async function getSnapshotHistory(
  engagementId: string,
  weeksBack: number
): Promise<{ weekStart: Date; blocks: WorkerReportBlock[] }[]> {
  const since = new Date(Date.now() - weeksBack * 7 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ weekStart: clientMetricSnapshots.weekStart, blocks: clientMetricSnapshots.blocks })
    .from(clientMetricSnapshots)
    .where(and(eq(clientMetricSnapshots.engagementId, engagementId), gte(clientMetricSnapshots.weekStart, since)))
    .orderBy(clientMetricSnapshots.weekStart);
  return rows.map((r) => ({ weekStart: r.weekStart, blocks: r.blocks as WorkerReportBlock[] }));
}
