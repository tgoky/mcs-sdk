// src/features/reports/server/account-advisor.ts
//
// Phase 4 of the reports/analytics rework — the actual "act like an
// assistant, give me a real rundown" ask, distinct from report-notes.ts's
// thin per-period restatement (1-2 sentences, current numbers only, no
// cross-skill view). This is triggered by the user (a "Generate account
// review" button, not re-run on every page load — see MODEL.SYNTHESIS's
// cost relative to MODEL.FAST), takes every enabled worker's real current
// block, its real week-over-week trend, and any cross-product
// correlation flag, and writes an actual analysis: what's working,
// what's declining, one concrete next action. Every review is kept
// (accountReviews table) as real history, not overwritten by the next
// one.

import crypto from "crypto";
import { db } from "@/lib/db";
import { accountReviews, engagements } from "@/models/schema";
import { eq, desc } from "drizzle-orm";
import { callClaudeWithRetry, MODEL } from "@/lib/llm";
import { getEnabledWorkerIdsForEngagement } from "@/lib/engagement-skills";
import { getReportBlocksForEngagement, attachTrends, type ReportBlockWithTrend } from "@/lib/worker-report-blocks";
import { getPriorSnapshot } from "@/lib/client-metric-snapshots";
import { computeCorrelationFlags } from "@/lib/report-correlation";
import { startOfWeek } from "@/lib/dashboard-stats";

export interface AccountReview {
  id: string;
  reviewText: string;
  generatedAt: Date;
}

function blocksLine(blocks: ReportBlockWithTrend[]): string {
  if (blocks.length === 0) return "(no enabled skills have reported data yet)";
  return blocks.map((b) => `${b.label}: ${b.displayValue}${b.trendLabel ? ` (${b.trendLabel})` : ""}`).join("\n");
}

const SYSTEM_PROMPT = `You are an account strategist reviewing one client's real automation performance across every skill they have enabled — potentially spanning two different products (Showtime, a booking/outreach automation suite, and Reputation Manager, a reputation-monitoring suite). Write a real analysis, not a restated metrics dump.

Rules:
- Reference only the specific numbers given below. Never invent a cause, trend, or explanation the data doesn't support.
- Structure your answer in three short parts: what's working, what's declining or at risk, and one concrete next action.
- If a flagged correlation is given, address it directly — that's the one thing a single-product tool could never tell this operator.
- No boilerplate openers, no filler adjectives, no hedging language.
- 4-6 sentences total. Output only the review text, no preamble, no markdown headers.`;

/**
 * Generates one on-demand account review, grounded in real current
 * blocks + real week-over-week trend + real correlation flags. Returns
 * null (not thrown) when there's genuinely nothing to review yet (no
 * enabled worker has any data), or when the model call fails — same
 * "don't spend a call saying nothing happened" discipline
 * report-notes.ts already applies, just for a bigger, user-triggered
 * synthesis instead of an automatic per-period note.
 */
export async function generateAccountReview(engagementId: string): Promise<AccountReview | null> {
  const [tenant] = await db.select({ buyer: engagements.buyer }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  if (!tenant) return null;

  const now = new Date();
  const weekStart = startOfWeek(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const enabledWorkerIds = await getEnabledWorkerIdsForEngagement(engagementId);
  const [weekBlocksRaw, monthBlocksRaw, priorWeekSnapshot] = await Promise.all([
    getReportBlocksForEngagement(engagementId, enabledWorkerIds, { start: weekStart }),
    getReportBlocksForEngagement(engagementId, enabledWorkerIds, { start: monthStart }),
    getPriorSnapshot(engagementId, weekStart),
  ]);

  if (weekBlocksRaw.length === 0 && monthBlocksRaw.length === 0) return null;

  const weekBlocks = attachTrends(weekBlocksRaw, priorWeekSnapshot?.blocks ?? null);
  const monthBlocks = attachTrends(monthBlocksRaw, null);
  const correlationFlags = computeCorrelationFlags(weekBlocks);

  const userMessage = `Client: ${tenant.buyer}

This week's metrics:
${blocksLine(weekBlocks)}

This month's metrics:
${blocksLine(monthBlocks)}
${correlationFlags.length > 0 ? `\nFlagged correlations:\n${correlationFlags.map((f) => f.message).join("\n")}` : ""}`;

  let reviewText: string;
  try {
    const result = await callClaudeWithRetry({ model: MODEL.SYNTHESIS, system: SYSTEM_PROMPT, userMessage, maxTokens: 500 });
    reviewText = result.text.trim();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[account-advisor] Generation failed for ${engagementId}:`, message);
    return null;
  }
  if (!reviewText) return null;

  const id = crypto.randomUUID();
  const generatedAt = new Date();
  await db.insert(accountReviews).values({ id, engagementId, reviewText, blocksSnapshot: weekBlocks, generatedAt });

  return { id, reviewText, generatedAt };
}

export async function getRecentAccountReviews(engagementId: string, limit = 5): Promise<AccountReview[]> {
  const rows = await db
    .select({ id: accountReviews.id, reviewText: accountReviews.reviewText, generatedAt: accountReviews.generatedAt })
    .from(accountReviews)
    .where(eq(accountReviews.engagementId, engagementId))
    .orderBy(desc(accountReviews.generatedAt))
    .limit(limit);
  return rows;
}
