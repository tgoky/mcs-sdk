import crypto from "crypto";
import { inngest, skillRunExecute } from "@/lib/inngest";
import { db } from "@/lib/db";
import { engagements, repIdentityGraphs } from "@/models/schema";
import { startRun } from "@/lib/run-log";
import { isEngagementPaused } from "@/lib/engagement-status";
import { getDisabledEngagementIdsForSkill } from "@/lib/engagement-skills";
import { eq, isNull } from "drizzle-orm";

/**
 * Dispatches rep-engine-panel once daily for every engagement that has a
 * real identity graph. Deliberately once daily, not the OG skill pack's
 * twice-daily default — this is the scoped-down tripwire-only v1 (see
 * engine-panel-service.ts), and starting at a lower cadence is easier to
 * raise later once there's real cost data than the reverse.
 *
 * Same prepare-then-batch-send shape as nightlyBriefsCron/
 * leakMapScheduleCron in crons.ts: one step.run does the DB read + per-
 * engagement startRun bookkeeping, one step.sendEvent carries the whole
 * batch — not a dispatchSkillRun call per engagement, which would send
 * each event separately instead of one batched request.
 */
export const repEnginePanelCron = inngest.createFunction(
  { id: "rep-engine-panel-cron", triggers: [{ cron: "TZ=UTC 0 7 * * *" }], retries: 1 }, // 07:00 UTC daily
  async ({ step }) => {
    const prepared = await step.run("prepare-engine-panel-runs", async () => {
      const rows = await db
        .select({
          engagementId: engagements.engagementId,
          buyer: engagements.buyer,
          pausedAt: engagements.pausedAt,
          deletedAt: engagements.deletedAt,
        })
        .from(repIdentityGraphs)
        .innerJoin(engagements, eq(repIdentityGraphs.engagementId, engagements.engagementId))
        .where(isNull(engagements.deletedAt));

      const disabled = await getDisabledEngagementIdsForSkill("rep-engine-panel");

      const out: { runId: string; engagementId: string }[] = [];
      for (const row of rows) {
        if (isEngagementPaused(row)) continue;
        if (disabled.has(row.engagementId)) continue;

        const runId = crypto.randomUUID();
        await startRun({
          id: runId,
          engagementId: row.engagementId,
          skillName: "rep-engine-panel",
          phase: "engine_panel",
          label: row.buyer,
        });
        out.push({ runId, engagementId: row.engagementId });
      }
      return out;
    });

    if (prepared.length > 0) {
      await step.sendEvent(
        "dispatch-rep-engine-panel-runs",
        prepared.map((r) => skillRunExecute.create({ runId: r.runId, engagementId: r.engagementId, skillName: "rep-engine-panel" }))
      );
    }

    return { dispatched: prepared.length };
  }
);
