// src/features/reports/server/compare-service.ts
//
// The Compare feature's one data source — and it needed zero new schema
// or per-worker code, because the raw material was already generic:
// every worker's report output is the same shape (WorkerReportBlock:
// workerId, label, value, tone — worker-report-blocks.ts) and
// client_metric_snapshots already persists one row of that shape per
// engagement per week. "Compare across skills," "across workers," and
// "across time" all reduce to the same query: group stored block values
// by (workerId, label) across weeks. A worker added later starts showing
// up here the moment its own resolver contributes a snapshot value — no
// change to this file, ever, same reasoning as worker-report-blocks.ts
// and category-signals.ts.

import { getEnabledWorkerIdsForEngagement } from "@/lib/engagement-skills";
import { getReportBlocksForEngagement } from "@/lib/worker-report-blocks";
import { getSnapshotHistory } from "@/lib/client-metric-snapshots";
import { startOfWeek } from "@/lib/dashboard-stats";
import { WORKER_REGISTRY, type WorkerId } from "@/lib/worker-registry";

export interface ComparisonPoint {
  weekStart: string; // ISO date, ascending
  value: number | null;
  displayValue: string;
  /** True for the current week, which comes from a live read rather than
   * a persisted snapshot (this week's Monday snapshot hasn't run yet) —
   * the UI labels it differently from confirmed historical weeks. */
  isCurrentWeek: boolean;
}

export interface ComparisonSeries {
  workerId: WorkerId;
  workerName: string;
  label: string;
  points: ComparisonPoint[];
}

/** Every worker's value across up to `weeksBack` weeks of real history
 * plus the current (unsnapshotted) week — the operator picks which
 * series to look at client-side, so this returns everything rather than
 * taking a worker filter, avoiding a re-fetch per selection change. */
export async function getComparisonSeries(engagementId: string, weeksBack = 8): Promise<ComparisonSeries[]> {
  const enabledWorkerIds = await getEnabledWorkerIdsForEngagement(engagementId);
  const weekStart = startOfWeek(new Date());

  const [history, currentBlocks] = await Promise.all([
    getSnapshotHistory(engagementId, weeksBack),
    getReportBlocksForEngagement(engagementId, enabledWorkerIds, { start: weekStart }),
  ]);

  const seriesByKey = new Map<string, ComparisonSeries>();

  // The weekly snapshot cron (crons.ts) runs Monday 00:05 UTC and records
  // a row keyed by startOfWeek(now) at that moment — the SAME Monday
  // startOfWeek(new Date()) produces any time later this same week. Left
  // unfiltered, a client viewed any day after that cron has already run
  // this week would get two points for one real week: Monday's snapshot
  // (stale the moment it's recorded) and the live fetch below (current).
  // "This week" is always the live fetch, exactly once — history only
  // ever covers weeks strictly before it.
  const historicalOnly = history.filter((snapshot) => snapshot.weekStart.getTime() < weekStart.getTime());

  for (const snapshot of historicalOnly) {
    for (const block of snapshot.blocks) {
      const key = `${block.workerId}:${block.label}`;
      const series = seriesByKey.get(key) ?? {
        workerId: block.workerId,
        workerName: WORKER_REGISTRY[block.workerId]?.name ?? block.workerId,
        label: block.label,
        points: [],
      };
      series.points.push({
        weekStart: snapshot.weekStart.toISOString(),
        value: block.value,
        displayValue: block.displayValue,
        isCurrentWeek: false,
      });
      seriesByKey.set(key, series);
    }
  }

  for (const block of currentBlocks) {
    const key = `${block.workerId}:${block.label}`;
    const series = seriesByKey.get(key) ?? {
      workerId: block.workerId,
      workerName: WORKER_REGISTRY[block.workerId]?.name ?? block.workerId,
      label: block.label,
      points: [],
    };
    series.points.push({
      weekStart: weekStart.toISOString(),
      value: block.value,
      displayValue: block.displayValue,
      isCurrentWeek: true,
    });
    seriesByKey.set(key, series);
  }

  return [...seriesByKey.values()].filter((s) => s.points.length > 0);
}
