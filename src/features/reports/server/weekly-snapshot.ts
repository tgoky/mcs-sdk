// src/features/reports/server/weekly-snapshot.ts
//
// Weekly Monday snapshot — the trend layer Reports/Analytics never had.
// Every prior render recomputed totals for whatever period tab was open
// straight from raw event tables, with nothing persisted past "right
// now" — so switching tabs showed three disconnected snapshots, never a
// real trajectory. This writes one row per engagement per week (see
// clientMetricSnapshots in schema.ts) so a report can say "up 6 points
// from last week" and mean it.
//
// Unlike nightlyBriefsCron/weeklyMetricsCron, this writes data for
// internal comparison, not something delivered to a human at a specific
// local time — so a single global Monday run (no per-engagement
// timezone gate) is enough; the exact UTC minute it lands doesn't change
// what a client eventually sees in their report.

import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { isNull } from "drizzle-orm";
import { startOfWeek } from "@/lib/dashboard-stats";
import { getEnabledWorkerIdsForEngagement } from "@/lib/engagement-skills";
import { getReportBlocksForEngagement } from "@/lib/worker-report-blocks";
import { recordWeeklySnapshot } from "@/lib/client-metric-snapshots";

/** Every non-deleted engagement — a paused one still gets a (likely
 * all-zero) snapshot; "this account went quiet this week" is itself real
 * information for the trend line, not noise to filter out. */
export async function findEngagementsForWeeklySnapshot(): Promise<string[]> {
  const rows = await db
    .select({ engagementId: engagements.engagementId })
    .from(engagements)
    .where(isNull(engagements.deletedAt));
  return rows.map((r) => r.engagementId);
}

export async function processWeeklySnapshotForEngagement(engagementId: string): Promise<{ blocksRecorded: number }> {
  const weekStart = startOfWeek(new Date());
  const enabledWorkerIds = await getEnabledWorkerIdsForEngagement(engagementId);
  const blocks = await getReportBlocksForEngagement(engagementId, enabledWorkerIds, { start: weekStart });
  await recordWeeklySnapshot(engagementId, weekStart, blocks);
  return { blocksRecorded: blocks.length };
}
