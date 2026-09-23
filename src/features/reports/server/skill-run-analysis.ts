// src/features/reports/server/skill-run-analysis.ts
//
// The "Run analysis" menu action's server side — a real, synthesized
// read on ONE skill's actual performance for one client, not the
// multi-skill Compare narrowed to a list of one. Same on-demand LLM
// synthesis discipline as skill-compare.ts (grounded only in real
// numbers, one model call, kept as history), just scoped differently:
//
//   - operational stats (runs/success-rate/needsAttention) over a 30-day
//     window, same skillRuns query shape as skill-compare.ts's statsFor,
//     narrowed to this one workerId.
//   - the real business-outcome block (worker-report-blocks.ts) for the
//     CURRENT week, with a real week-over-week trend attached via
//     getPriorSnapshot — the same "never fabricate a trend against a
//     missing baseline" pattern account-advisor.ts uses. A worker with no
//     resolver (leak-map, Cold Open/Whop Agent skills today) simply has
//     no outcome block; the model is told explicitly, so it never invents
//     one or a trend for it.

import crypto from "crypto";
import { db } from "@/lib/db";
import { skillRunAnalyses, engagements, skillRuns } from "@/models/schema";
import { eq, and, gte } from "drizzle-orm";
import { callClaudeWithRetry, MODEL } from "@/lib/llm";
import { WORKER_REGISTRY, type WorkerId } from "@/lib/worker-registry";
import { getReportBlocksForEngagement, attachTrends, type ReportBlockWithTrend } from "@/lib/worker-report-blocks";
import { getPriorSnapshot } from "@/lib/client-metric-snapshots";
import { startOfWeek } from "@/lib/dashboard-stats";

const WINDOW_DAYS = 30;
const FAILURE_STATUSES = new Set(["failed", "timed_out"]);

export interface SkillRunAnalysisStats {
  workerId: WorkerId;
  name: string;
  runsInWindow: number;
  successRate: number | null;
  needsAttention: boolean;
  /** Current week's real business-outcome block for this skill, with a
   * real trend attached — null when this worker has no resolver, or its
   * resolver has nothing to report yet. */
  outcome: ReportBlockWithTrend | null;
}

export interface SkillRunAnalysis {
  id: string;
  stats: SkillRunAnalysisStats;
  narrative: string;
  generatedAt: Date;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function statsFor(engagementId: string, workerId: WorkerId): Promise<SkillRunAnalysisStats> {
  const since = daysAgo(WINDOW_DAYS);
  const weekStart = startOfWeek(new Date());

  const [runs, weekBlocksRaw, priorWeekSnapshot] = await Promise.all([
    db
      .select({ status: skillRuns.status, startedAt: skillRuns.startedAt })
      .from(skillRuns)
      .where(and(eq(skillRuns.engagementId, engagementId), eq(skillRuns.skillName, workerId), gte(skillRuns.startedAt, since))),
    getReportBlocksForEngagement(engagementId, [workerId], { start: weekStart }),
    getPriorSnapshot(engagementId, weekStart),
  ]);

  const success = runs.filter((r) => r.status === "success").length;
  const sorted = [...runs].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  const weekBlocks = attachTrends(weekBlocksRaw, priorWeekSnapshot?.blocks ?? null);

  return {
    workerId,
    name: WORKER_REGISTRY[workerId].name,
    runsInWindow: runs.length,
    successRate: runs.length > 0 ? Math.round((success / runs.length) * 100) : null,
    needsAttention: sorted.length > 0 && FAILURE_STATUSES.has(sorted[0].status),
    outcome: weekBlocks[0] ?? null,
  };
}

function statsLine(s: SkillRunAnalysisStats): string {
  const parts = [
    `${s.runsInWindow} runs in the last ${WINDOW_DAYS} days`,
    s.successRate !== null ? `${s.successRate}% success rate` : "no runs yet",
    s.needsAttention ? "failing on its most recent run" : null,
    s.outcome
      ? `business outcome: ${s.outcome.label}: ${s.outcome.displayValue}${s.outcome.trendLabel ? ` (${s.outcome.trendLabel})` : " (no baseline yet to compare against)"}`
      : "no tracked business outcome yet for this skill",
  ].filter(Boolean);
  return parts.join(", ");
}

const SYSTEM_PROMPT = `You are analyzing ONE automation skill's actual performance for one client, for someone who just asked to look closely at this specific skill. Write a real analysis, not a restated list of the numbers given.

Rules:
- Reference only the specific numbers given below. Never invent a cause, a trend, or an explanation the data doesn't support.
- Say plainly what's actually happening with this skill right now, and whether it's declining, improving, or steady, grounded only in the real trend given (or its absence). If there's no trend baseline yet, say that instead of guessing a direction.
- If there's no tracked business outcome for this skill, say so plainly rather than treating run/success numbers as if they were one.
- Close with one concrete next action specific to this skill's actual numbers, not generic advice.
- No boilerplate openers, no filler adjectives, no hedging language, no markdown headers.
- 4-6 sentences total. Output only the analysis text, no preamble.`;

/**
 * Generates one on-demand single-skill analysis, grounded in real
 * operational numbers + the real current-week outcome block + its real
 * trend. Returns null (not thrown) when there's genuinely nothing to
 * analyze yet — no runs at all and no outcome block — or when the model
 * call fails, same discipline as skill-compare.ts / account-advisor.ts.
 */
export async function generateSkillRunAnalysis(engagementId: string, workerId: WorkerId): Promise<SkillRunAnalysis | null> {
  const [tenant] = await db.select({ buyer: engagements.buyer }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  if (!tenant) return null;

  const stats = await statsFor(engagementId, workerId);
  if (stats.runsInWindow === 0 && !stats.outcome) return null;

  const userMessage = `Client: ${tenant.buyer}
Skill: ${stats.name}

${statsLine(stats)}`;

  let narrative: string;
  try {
    const result = await callClaudeWithRetry({ model: MODEL.SYNTHESIS, system: SYSTEM_PROMPT, userMessage, maxTokens: 400 });
    narrative = result.text.trim();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[skill-run-analysis] Generation failed for ${engagementId}/${workerId}:`, message);
    return null;
  }
  if (!narrative) return null;

  const id = crypto.randomUUID();
  const generatedAt = new Date();
  await db.insert(skillRunAnalyses).values({
    id,
    engagementId,
    workerId,
    statsSnapshot: stats,
    narrative,
    generatedAt,
  });

  return { id, stats, narrative, generatedAt };
}
