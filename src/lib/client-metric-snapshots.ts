// src/lib/client-metric-snapshots.ts
//
// Persistence for clientMetricSnapshots (see schema.ts for why this table
// exists) — the one thing Reports never had before: a real number from a
// real prior week to compare against, instead of three independently-
// recomputed "This week / This month / All time" tabs with no memory of
// each other.

import { db } from "@/lib/db";
import { clientMetricSnapshots } from "@/models/schema";
import { and, eq, lt, desc } from "drizzle-orm";
import type { WorkerReportBlock } from "@/lib/worker-report-blocks";

export async function recordWeeklySnapshot(engagementId: string, weekStart: Date, blocks: WorkerReportBlock[]): Promise<void> {
  await db
    .insert(clientMetricSnapshots)
    .values({ engagementId, weekStart, blocks })
    .onConflictDoUpdate({
      target: [clientMetricSnapshots.engagementId, clientMetricSnapshots.weekStart],
      set: { blocks },
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
