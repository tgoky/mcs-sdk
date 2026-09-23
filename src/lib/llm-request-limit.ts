// src/lib/llm-request-limit.ts
//
// Caps the on-demand LLM actions (Library "Compare", "Run analysis") per
// client, so repeated clicks can't run up model cost. Counts the results
// those actions already save (skill_compare_runs, skill_run_analyses), so
// the cap holds across server instances with no extra table. Only
// successful generations are saved, so failed attempts don't count.

import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { skillCompareRuns, skillRunAnalyses } from "@/models/schema";

export const LLM_ACTIONS_PER_HOUR = 10;

export async function llmActionLimitReached(engagementId: string, kind: "compare" | "analysis"): Promise<boolean> {
  const table = kind === "compare" ? skillCompareRuns : skillRunAnalyses;
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(table)
    .where(and(eq(table.engagementId, engagementId), gt(table.generatedAt, since)));
  return (row?.count ?? 0) >= LLM_ACTIONS_PER_HOUR;
}
