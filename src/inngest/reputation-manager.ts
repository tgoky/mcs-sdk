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

/**
 * Dispatches rep-trustpilot-watch once daily for every engagement with a
 * real identity graph. Same shape as repEnginePanelCron above — see that
 * one's comment for the general pattern reasoning. Staggered to a
 * different hour purely to spread load, not for any functional reason.
 */
export const repTrustpilotWatchCron = inngest.createFunction(
  { id: "rep-trustpilot-watch-cron", triggers: [{ cron: "TZ=UTC 30 7 * * *" }], retries: 1 }, // 07:30 UTC daily
  async ({ step }) => {
    const prepared = await step.run("prepare-trustpilot-watch-runs", async () => {
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

      const disabled = await getDisabledEngagementIdsForSkill("rep-trustpilot-watch");

      const out: { runId: string; engagementId: string }[] = [];
      for (const row of rows) {
        if (isEngagementPaused(row)) continue;
        if (disabled.has(row.engagementId)) continue;

        const runId = crypto.randomUUID();
        await startRun({
          id: runId,
          engagementId: row.engagementId,
          skillName: "rep-trustpilot-watch",
          phase: "trustpilot_watch",
          label: row.buyer,
        });
        out.push({ runId, engagementId: row.engagementId });
      }
      return out;
    });

    if (prepared.length > 0) {
      await step.sendEvent(
        "dispatch-rep-trustpilot-watch-runs",
        prepared.map((r) => skillRunExecute.create({ runId: r.runId, engagementId: r.engagementId, skillName: "rep-trustpilot-watch" }))
      );
    }

    return { dispatched: prepared.length };
  }
);

/**
 * Dispatches rep-reddit-watch once daily. Same shape again.
 */
export const repRedditWatchCron = inngest.createFunction(
  { id: "rep-reddit-watch-cron", triggers: [{ cron: "TZ=UTC 0 8 * * *" }], retries: 1 }, // 08:00 UTC daily
  async ({ step }) => {
    const prepared = await step.run("prepare-reddit-watch-runs", async () => {
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

      const disabled = await getDisabledEngagementIdsForSkill("rep-reddit-watch");

      const out: { runId: string; engagementId: string }[] = [];
      for (const row of rows) {
        if (isEngagementPaused(row)) continue;
        if (disabled.has(row.engagementId)) continue;

        const runId = crypto.randomUUID();
        await startRun({
          id: runId,
          engagementId: row.engagementId,
          skillName: "rep-reddit-watch",
          phase: "reddit_watch",
          label: row.buyer,
        });
        out.push({ runId, engagementId: row.engagementId });
      }
      return out;
    });

    if (prepared.length > 0) {
      await step.sendEvent(
        "dispatch-rep-reddit-watch-runs",
        prepared.map((r) => skillRunExecute.create({ runId: r.runId, engagementId: r.engagementId, skillName: "rep-reddit-watch" }))
      );
    }

    return { dispatched: prepared.length };
  }
);

/**
 * Dispatches rep-twitter-watch once daily. Same shape again.
 */
export const repTwitterWatchCron = inngest.createFunction(
  { id: "rep-twitter-watch-cron", triggers: [{ cron: "TZ=UTC 30 8 * * *" }], retries: 1 }, // 08:30 UTC daily
  async ({ step }) => {
    const prepared = await step.run("prepare-twitter-watch-runs", async () => {
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

      const disabled = await getDisabledEngagementIdsForSkill("rep-twitter-watch");

      const out: { runId: string; engagementId: string }[] = [];
      for (const row of rows) {
        if (isEngagementPaused(row)) continue;
        if (disabled.has(row.engagementId)) continue;

        const runId = crypto.randomUUID();
        await startRun({
          id: runId,
          engagementId: row.engagementId,
          skillName: "rep-twitter-watch",
          phase: "twitter_watch",
          label: row.buyer,
        });
        out.push({ runId, engagementId: row.engagementId });
      }
      return out;
    });

    if (prepared.length > 0) {
      await step.sendEvent(
        "dispatch-rep-twitter-watch-runs",
        prepared.map((r) => skillRunExecute.create({ runId: r.runId, engagementId: r.engagementId, skillName: "rep-twitter-watch" }))
      );
    }

    return { dispatched: prepared.length };
  }
);

/**
 * Dispatches rep-crisis-response once daily, after the three watch
 * skills above have had a chance to run — 09:00 UTC gives booking-poll-
 * style margin past even the latest of them (08:30). Same eligibility
 * gate as the others (has a real identity graph); no separate
 * "has anything actually been flagged" pre-filter here — the service's
 * own early-return (loadFlaggedFindingsSince returning empty) already
 * handles that case cheaply, without wasting an LLM call, so pre-
 * filtering at the cron level would just be the same check done twice.
 */
export const repCrisisResponseCron = inngest.createFunction(
  { id: "rep-crisis-response-cron", triggers: [{ cron: "TZ=UTC 0 9 * * *" }], retries: 1 }, // 09:00 UTC daily
  async ({ step }) => {
    const prepared = await step.run("prepare-crisis-response-runs", async () => {
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

      const disabled = await getDisabledEngagementIdsForSkill("rep-crisis-response");

      const out: { runId: string; engagementId: string }[] = [];
      for (const row of rows) {
        if (isEngagementPaused(row)) continue;
        if (disabled.has(row.engagementId)) continue;

        const runId = crypto.randomUUID();
        await startRun({
          id: runId,
          engagementId: row.engagementId,
          skillName: "rep-crisis-response",
          phase: "crisis_response",
          label: row.buyer,
        });
        out.push({ runId, engagementId: row.engagementId });
      }
      return out;
    });

    if (prepared.length > 0) {
      await step.sendEvent(
        "dispatch-rep-crisis-response-runs",
        prepared.map((r) => skillRunExecute.create({ runId: r.runId, engagementId: r.engagementId, skillName: "rep-crisis-response" }))
      );
    }

    return { dispatched: prepared.length };
  }
);
