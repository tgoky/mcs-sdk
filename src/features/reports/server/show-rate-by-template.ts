// src/features/reports/server/show-rate-by-template.ts
//
// Which confirmation-page template correlates with the best show rate,
// across every engagement one operator (whopUserId) runs — same
// whopUserId-only, no-workspaceId scope portfolio-outcomes.ts and
// /dashboard/analytics's own top-of-file query already use. This is a
// template-performance rollup, NOT the per-booking no-show-risk
// prediction show-rate-scorer.ts does (see that file's own header) —
// this never reads or writes showRateFeatures, it only aggregates
// human-confirmed outcomes already logged in briefOutcomeLog.
//
// briefOutcomeLog is the convergence point for every outcome-recording
// path (dashboard control, Slack buttons, Recall.ai bot, the
// assumed-no-show sweep) — see outcome-resolution.ts's own header for
// why that file, not showRateFeatures.actualOutcome (prediction-audit
// data, sparse/backfilled), is the authoritative source here.
//
// The actual bucketing/aggregation is pure logic in
// src/lib/show-rate-by-template.ts (unit-tested there, no DATABASE_URL
// needed) — this file is just the db read that feeds it.

import { db } from "@/lib/db";
import { briefOutcomeLog, engagements } from "@/models/schema";
import { and, eq, isNull } from "drizzle-orm";
import { aggregateShowRateByTemplate, type TemplateShowRateStat } from "@/lib/show-rate-by-template";

export type { TemplateShowRateStat };
export { LOW_SAMPLE_THRESHOLD } from "@/lib/show-rate-by-template";

export async function getShowRateByTemplate(whopUserId: string): Promise<TemplateShowRateStat[]> {
  const rows = await db
    .select({ template: engagements.confirmationPageTemplate, outcome: briefOutcomeLog.outcome })
    .from(briefOutcomeLog)
    .innerJoin(engagements, eq(briefOutcomeLog.engagementId, engagements.engagementId))
    .where(and(eq(engagements.whopUserId, whopUserId), isNull(engagements.deletedAt)));

  return aggregateShowRateByTemplate(rows);
}
