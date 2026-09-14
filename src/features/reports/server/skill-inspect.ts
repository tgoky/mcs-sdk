// src/features/reports/server/skill-inspect.ts
//
// The "Inspect performance" menu item's data side — deliberately NOT an
// LLM feature. It's the honest, real business-outcome view: the current
// week's block with a real trend (attachTrends against getPriorSnapshot,
// same as account-advisor.ts), the current month's block as a second
// real number (no trend — there's no month-over-month snapshot history
// to compare against, same restraint account-advisor.ts applies to its
// own month figure), and a real operational fallback (runs/success rate
// for this one engagement+skill) for a worker with no outcome resolver
// at all (Cold Open/Whop Agent workers today) so the panel never shows
// nothing.
//
// Shared by the inspect API route (scoped to whichever engagement the
// Library card is on) and the rebuilt /dashboard/analytics/[workerId]
// page (scoped to the workspace's primary engagement) so neither
// recomputes this by hand.

import { db } from "@/lib/db";
import { skillRuns } from "@/models/schema";
import { and, eq, gte } from "drizzle-orm";
import type { WorkerId } from "@/lib/worker-registry";
import { getReportBlocksForEngagement, attachTrends, type ReportBlockWithTrend } from "@/lib/worker-report-blocks";
import { getPriorSnapshot } from "@/lib/client-metric-snapshots";
import { startOfWeek } from "@/lib/dashboard-stats";

const OPERATIONAL_WINDOW_DAYS = 30;
const FAILURE_STATUSES = new Set(["failed", "timed_out"]);

export interface SkillInspectOperational {
  runsInWindow: number;
  successRate: number | null;
  needsAttention: boolean;
}

export interface SkillInspectData {
  outcome: {
    week: ReportBlockWithTrend | null;
    month: ReportBlockWithTrend | null;
  };
  operational: SkillInspectOperational;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function getSkillInspectData(engagementId: string, workerId: WorkerId): Promise<SkillInspectData> {
  const now = new Date();
  const weekStart = startOfWeek(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const since = daysAgo(OPERATIONAL_WINDOW_DAYS);

  const [weekBlocksRaw, monthBlocksRaw, priorWeekSnapshot, runs] = await Promise.all([
    getReportBlocksForEngagement(engagementId, [workerId], { start: weekStart }),
    getReportBlocksForEngagement(engagementId, [workerId], { start: monthStart }),
    getPriorSnapshot(engagementId, weekStart),
    db
      .select({ status: skillRuns.status, startedAt: skillRuns.startedAt })
      .from(skillRuns)
      .where(and(eq(skillRuns.engagementId, engagementId), eq(skillRuns.skillName, workerId), gte(skillRuns.startedAt, since))),
  ]);

  const weekBlocks = attachTrends(weekBlocksRaw, priorWeekSnapshot?.blocks ?? null);
  // Month figure gets no trend — there's no month-over-month snapshot
  // history to compare it against, so it's shown as a real second
  // number, not a fabricated delta.
  const monthBlocks = attachTrends(monthBlocksRaw, null);

  const success = runs.filter((r) => r.status === "success").length;
  const sorted = [...runs].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

  return {
    outcome: {
      week: weekBlocks[0] ?? null,
      month: monthBlocks[0] ?? null,
    },
    operational: {
      runsInWindow: runs.length,
      successRate: runs.length > 0 ? Math.round((success / runs.length) * 100) : null,
      needsAttention: sorted.length > 0 && FAILURE_STATUSES.has(sorted[0].status),
    },
  };
}
