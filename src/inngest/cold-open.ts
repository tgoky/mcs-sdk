// src/inngest/cold-open.ts
//
// Cold Open's own scheduling — same pattern crons.ts already established
// (an hourly Inngest cron checked against each engagement's own local
// hour, rather than N per-timezone cron expressions) and the same
// ghost-run fix AI_ARCHITECT_REPORTfe.md documented for the rest of this
// app: the enablement check runs BEFORE startRun, in the prepare step,
// so a disabled engagement never gets a visible run created for it.

import { inngest } from "@/lib/inngest";
import { dispatchScheduledSkillRuns } from "@/inngest/fan-out";
import { db } from "@/lib/db";
import { engagements, coldOpenConfig } from "@/models/schema";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { isEngagementPaused } from "@/lib/engagement-status";
import { getDisabledEngagementIdsForSkill } from "@/lib/engagement-skills";
import { matchesDailyLocalHour } from "@/features/leak-map/server/schedule-matcher";

// Cold Open's clients come from coldOpenConfig joined to engagements; both
// crons page through them by engagementId (src/inngest/fan-out.ts).
const coldOpenPage = (after: string | null, limit: number) =>
  db
    .select({ engagementId: engagements.engagementId, deletedAt: engagements.deletedAt, pausedAt: engagements.pausedAt, pausedReason: engagements.pausedReason, config: coldOpenConfig })
    .from(coldOpenConfig)
    .innerJoin(engagements, eq(engagements.engagementId, coldOpenConfig.engagementId))
    .where(and(isNull(engagements.deletedAt), after ? gt(engagements.engagementId, after) : undefined))
    .orderBy(asc(engagements.engagementId))
    .limit(limit);

export const coldOpenDailySendCron = inngest.createFunction(
  { id: "cold-open-daily-send-cron", triggers: [{ cron: "0 * * * *" }], retries: 1 }, // hourly; fires per-engagement at their configured local hour
  async ({ step }) => {
    const dispatched = await dispatchScheduledSkillRuns(step, {
      id: "prepare-cold-open-daily-send-runs",
      skillName: "daily-send",
      phase: "fetch",
      label: "Cold Open daily send",
      // Sends land within the first 45 minutes of the client's chosen hour.
      spreadMinutes: 45,
      loadPage: coldOpenPage,
      select: async (rows, now) => {
        const disabled = await getDisabledEngagementIdsForSkill("daily-send", rows.map((r) => r.engagementId));
        return rows
          .filter((r) => {
            if (disabled.has(r.engagementId)) return false;
            if (isEngagementPaused({ pausedAt: r.pausedAt })) return false;
            const settings = r.config.dailySendSettings;
            if (!settings) return false;
            if (r.config.phaseState.send_connect !== "complete" || r.config.phaseState.source_connect !== "complete") return false;
            return matchesDailyLocalHour(settings.timezone, settings.localHour, now);
          })
          .map((r) => ({ engagementId: r.engagementId }));
      },
    });
    return { dispatched };
  }
);

// Reply Sort doesn't need local-hour matching — a reply is worth
// surfacing whenever it arrives, not at a client-chosen send hour. Every
// 4 hours is frequent enough to catch a real "interested" reply same-day
// without polling every ESP account continuously.
export const coldOpenReplySortCron = inngest.createFunction(
  { id: "cold-open-reply-sort-cron", triggers: [{ cron: "0 */4 * * *" }], retries: 1 },
  async ({ step }) => {
    const dispatched = await dispatchScheduledSkillRuns(step, {
      id: "prepare-cold-open-reply-sort-runs",
      skillName: "reply-sort",
      phase: "reply_fetch",
      label: "Cold Open reply sort",
      spreadMinutes: 60,
      loadPage: coldOpenPage,
      select: async (rows) => {
        const disabled = await getDisabledEngagementIdsForSkill("reply-sort", rows.map((r) => r.engagementId));
        return rows
          .filter((r) => !disabled.has(r.engagementId) && !isEngagementPaused({ pausedAt: r.pausedAt }) && r.config.phaseState.send_connect === "complete")
          .map((r) => ({ engagementId: r.engagementId }));
      },
    });
    return { dispatched };
  }
);
