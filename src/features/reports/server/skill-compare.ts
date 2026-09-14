// src/features/reports/server/skill-compare.ts
//
// The "Compare" flyout's server side — a real, synthesized comparison
// across 2+ skills the user picked (same product or across products),
// not a spreadsheet of numbers. Same pattern as account-advisor.ts's
// on-demand LLM synthesis (grounded only in real numbers, real trend,
// one model call, kept as history), narrowed to exactly the skills
// selected instead of every enabled worker.
//
// Two things every comparison draws on:
//   - runs/success-rate/needsAttention (getWorkspaceWorkerOverview's own
//     per-worker shape) — the operational health side, works identically
//     for every worker regardless of product.
//   - the real business-outcome block (worker-report-blocks.ts) where
//     one exists — Show rate, Win-Back recovery, mention counts, etc.
//     A worker with no resolver (leak-map, pin-down, most Cold Open/
//     Whop Agent skills today) simply contributes no outcome line; the
//     model is told explicitly, so it never invents one.

import crypto from "crypto";
import { db } from "@/lib/db";
import { skillCompareRuns, engagements, skillRuns } from "@/models/schema";
import { eq, and, gte, inArray } from "drizzle-orm";
import { callClaudeWithRetry, MODEL } from "@/lib/llm";
import { WORKER_REGISTRY, type WorkerId } from "@/lib/worker-registry";
import { getReportBlocksForEngagement } from "@/lib/worker-report-blocks";

const WINDOW_DAYS = 30;
const FAILURE_STATUSES = new Set(["failed", "timed_out"]);

export interface CompareSkillStat {
  workerId: WorkerId;
  name: string;
  runsInWindow: number;
  successRate: number | null;
  needsAttention: boolean;
  outcomeLabel: string | null;
  outcomeValue: string | null;
}

export interface SkillComparison {
  id: string;
  skills: CompareSkillStat[];
  narrative: string;
  generatedAt: Date;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function statsFor(engagementId: string, workerIds: WorkerId[]): Promise<CompareSkillStat[]> {
  const since = daysAgo(WINDOW_DAYS);
  const [runs, blocks] = await Promise.all([
    db
      .select({ skillName: skillRuns.skillName, status: skillRuns.status, startedAt: skillRuns.startedAt })
      .from(skillRuns)
      .where(and(eq(skillRuns.engagementId, engagementId), inArray(skillRuns.skillName, workerIds), gte(skillRuns.startedAt, since))),
    getReportBlocksForEngagement(engagementId, workerIds, { start: since }),
  ]);

  const byWorker = new Map<WorkerId, typeof runs>();
  for (const id of workerIds) byWorker.set(id, []);
  for (const run of runs) {
    const id = run.skillName as WorkerId;
    byWorker.get(id)?.push(run);
  }

  return workerIds.map((id) => {
    const list = byWorker.get(id) ?? [];
    const success = list.filter((r) => r.status === "success").length;
    const sorted = [...list].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    const block = blocks.find((b) => b.workerId === id);
    return {
      workerId: id,
      name: WORKER_REGISTRY[id].name,
      runsInWindow: list.length,
      successRate: list.length > 0 ? Math.round((success / list.length) * 100) : null,
      needsAttention: sorted.length > 0 && FAILURE_STATUSES.has(sorted[0].status),
      outcomeLabel: block?.label ?? null,
      outcomeValue: block?.displayValue ?? null,
    };
  });
}

function statsLine(s: CompareSkillStat): string {
  const parts = [
    `${s.runsInWindow} runs/30d`,
    s.successRate !== null ? `${s.successRate}% success` : "no runs yet",
    s.needsAttention ? "failing on its most recent run" : null,
    s.outcomeLabel && s.outcomeValue ? `${s.outcomeLabel}: ${s.outcomeValue}` : "no tracked business outcome yet",
  ].filter(Boolean);
  return `${s.name} — ${parts.join(", ")}`;
}

const SYSTEM_PROMPT = `You are comparing several automation skills for one client, side by side, for someone deciding where to focus attention or budget. Write a real comparative analysis, not a restated list of the numbers given.

Rules:
- Reference only the specific numbers given below. Never invent a cause, a number, or an explanation the data doesn't support.
- Open by naming which skill is actually pulling its weight right now and which isn't, in one direct sentence — that's the headline, not buried.
- Then explain the "why" behind the gap using only the given numbers (run volume, success rate, whether it's failing, its business outcome if one is given).
- Close with one concrete recommendation: double down, fix, or deprioritize — named specifically, not generic advice.
- A skill with "no runs yet" or "no tracked business outcome yet" — say that plainly, never guess a number for it.
- No boilerplate openers, no filler adjectives, no hedging language, no markdown headers.
- 4-7 sentences total.`;

export async function generateSkillComparison(engagementId: string, workerIds: WorkerId[]): Promise<SkillComparison | null> {
  if (workerIds.length < 2) return null;
  const [tenant] = await db.select({ buyer: engagements.buyer }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  if (!tenant) return null;

  const skills = await statsFor(engagementId, workerIds);

  const userMessage = `Client: ${tenant.buyer}
Comparing ${skills.length} skills, last ${WINDOW_DAYS} days:

${skills.map(statsLine).join("\n")}`;

  let narrative: string;
  try {
    const result = await callClaudeWithRetry({ model: MODEL.SYNTHESIS, system: SYSTEM_PROMPT, userMessage, maxTokens: 400 });
    narrative = result.text.trim();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[skill-compare] Generation failed for ${engagementId}:`, message);
    return null;
  }
  if (!narrative) return null;

  const id = crypto.randomUUID();
  const generatedAt = new Date();
  await db.insert(skillCompareRuns).values({
    id,
    engagementId,
    workerIds,
    statsSnapshot: skills,
    narrative,
    generatedAt,
  });

  return { id, skills, narrative, generatedAt };
}
