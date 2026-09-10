// src/inngest/cold-open.ts
//
// Cold Open's own scheduling — same pattern crons.ts already established
// (an hourly Inngest cron checked against each engagement's own local
// hour, rather than N per-timezone cron expressions) and the same
// ghost-run fix AI_ARCHITECT_REPORTfe.md documented for the rest of this
// app: the enablement check runs BEFORE startRun, in the prepare step,
// so a disabled engagement never gets a visible run created for it.

import crypto from "crypto";
import { inngest, skillRunExecute } from "@/lib/inngest";
import { db } from "@/lib/db";
import { engagements, coldOpenConfig } from "@/models/schema";
import { eq, isNull } from "drizzle-orm";
import { startRun } from "@/lib/run-log";
import { isEngagementPaused } from "@/lib/engagement-status";
import { getDisabledEngagementIdsForSkill } from "@/lib/engagement-skills";
import { matchesDailyLocalHour } from "@/features/leak-map/server/schedule-matcher";

export const coldOpenDailySendCron = inngest.createFunction(
  { id: "cold-open-daily-send-cron", triggers: [{ cron: "0 * * * *" }], retries: 1 }, // hourly; fires per-engagement at their configured local hour
  async ({ step }) => {
    const now = new Date();
    const prepared = await step.run("prepare-cold-open-daily-send-runs", async () => {
      const disabled = await getDisabledEngagementIdsForSkill("daily-send");

      const rows = await db
        .select({ engagementId: engagements.engagementId, deletedAt: engagements.deletedAt, pausedAt: engagements.pausedAt, pausedReason: engagements.pausedReason, config: coldOpenConfig })
        .from(coldOpenConfig)
        .innerJoin(engagements, eq(engagements.engagementId, coldOpenConfig.engagementId))
        .where(isNull(engagements.deletedAt));

      const eligible = rows.filter((r) => {
        if (disabled.has(r.engagementId)) return false;
        if (isEngagementPaused({ pausedAt: r.pausedAt })) return false;
        const settings = r.config.dailySendSettings;
        if (!settings) return false;
        if (r.config.phaseState.send_connect !== "complete" || r.config.phaseState.source_connect !== "complete") return false;
        return matchesDailyLocalHour(settings.timezone, settings.localHour, now);
      });

      const out: { runId: string; engagementId: string }[] = [];
      for (const row of eligible) {
        const runId = crypto.randomUUID();
        await startRun({ id: runId, engagementId: row.engagementId, skillName: "daily-send", phase: "fetch", label: "Cold Open daily send" });
        out.push({ runId, engagementId: row.engagementId });
      }
      return out;
    });

    if (prepared.length > 0) {
      await step.sendEvent(
        "dispatch-cold-open-daily-send",
        prepared.map(({ runId, engagementId }) => skillRunExecute.create({ runId, engagementId, skillName: "daily-send" }))
      );
    }

    return { dispatched: prepared.length };
  }
);

// Reply Sort doesn't need local-hour matching — a reply is worth
// surfacing whenever it arrives, not at a client-chosen send hour. Every
// 4 hours is frequent enough to catch a real "interested" reply same-day
// without polling every ESP account continuously.
export const coldOpenReplySortCron = inngest.createFunction(
  { id: "cold-open-reply-sort-cron", triggers: [{ cron: "0 */4 * * *" }], retries: 1 },
  async ({ step }) => {
    const prepared = await step.run("prepare-cold-open-reply-sort-runs", async () => {
      const disabled = await getDisabledEngagementIdsForSkill("reply-sort");

      const rows = await db
        .select({ engagementId: engagements.engagementId, deletedAt: engagements.deletedAt, pausedAt: engagements.pausedAt, pausedReason: engagements.pausedReason, config: coldOpenConfig })
        .from(coldOpenConfig)
        .innerJoin(engagements, eq(engagements.engagementId, coldOpenConfig.engagementId))
        .where(isNull(engagements.deletedAt));

      const eligible = rows.filter((r) => {
        if (disabled.has(r.engagementId)) return false;
        if (isEngagementPaused({ pausedAt: r.pausedAt })) return false;
        return r.config.phaseState.send_connect === "complete";
      });

      const out: { runId: string; engagementId: string }[] = [];
      for (const row of eligible) {
        const runId = crypto.randomUUID();
        await startRun({ id: runId, engagementId: row.engagementId, skillName: "reply-sort", phase: "reply_fetch", label: "Cold Open reply sort" });
        out.push({ runId, engagementId: row.engagementId });
      }
      return out;
    });

    if (prepared.length > 0) {
      await step.sendEvent(
        "dispatch-cold-open-reply-sort",
        prepared.map(({ runId, engagementId }) => skillRunExecute.create({ runId, engagementId, skillName: "reply-sort" }))
      );
    }

    return { dispatched: prepared.length };
  }
);
