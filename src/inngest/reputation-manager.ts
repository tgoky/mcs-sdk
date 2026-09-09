import crypto from "crypto";
import { inngest, skillRunExecute } from "@/lib/inngest";
import { db } from "@/lib/db";
import { engagements, repIdentityGraphs, type EngagementStack } from "@/models/schema";
import { startRun } from "@/lib/run-log";
import { isEngagementPaused } from "@/lib/engagement-status";
import { getDisabledEngagementIdsForSkill } from "@/lib/engagement-skills";
import { matchesDailyLocalHour } from "@/features/leak-map/server/schedule-matcher";
import { eq, isNull } from "drizzle-orm";

// Every rep-* cron below used to be a literal fixed-UTC Inngest trigger
// (e.g. "TZ=UTC 0 7 * * *"), which meant an operator's per-engagement
// "Client timezone" setting (edit-stack-settings.tsx) had zero effect on
// any Reputation Manager skill — a client in Asia/Tokyo got their "morning"
// engine-panel check at 4pm local, with no way to change it, while the
// same setting genuinely worked for Showtime's nightly briefs/credential
// health/lost-deal sweep/weekly metrics. That's the same
// matchesDailyLocalHour fix nightlyBriefsCron (crons.ts) already applied
// for Showtime, ported here for Reputation Manager: each cron now runs
// hourly and fires per-engagement only when it's that engagement's own
// configured local hour (defaulting to UTC when unset, so a tenant that's
// never touched the timezone field behaves exactly as it did under the
// old fixed-UTC trigger).
const REP_ENGINE_PANEL_LOCAL_HOUR = 7;
const REP_TRUSTPILOT_WATCH_LOCAL_HOUR = 8;
const REP_REDDIT_WATCH_LOCAL_HOUR = 9;
const REP_TWITTER_WATCH_LOCAL_HOUR = 10;
const REP_CRISIS_RESPONSE_LOCAL_HOUR = 11;
const REP_DIGEST_LOCAL_HOUR = 18;

/**
 * Dispatches rep-engine-panel once daily, at 07:00 in each engagement's own
 * configured timezone. Deliberately once daily, not the OG skill pack's
 * twice-daily default — this is the scoped-down tripwire-only v1 (see
 * engine-panel-service.ts), and starting at a lower cadence is easier to
 * raise later once there's real cost data than the reverse.
 *
 * Same prepare-then-batch-send shape as nightlyBriefsCron/
 * leakMapScheduleCron in crons.ts: one step.run does the DB read + per-
 * engagement startRun bookkeeping, one step.sendEvent carries the whole
 * batch — not a dispatchSkillRun call per engagement, which would send
 * each event separately instead of one batched request. Runs hourly and
 * checks each engagement's local hour, same as those two, instead of a
 * fixed cron expression — see this file's header comment for why.
 */
export const repEnginePanelCron = inngest.createFunction(
  { id: "rep-engine-panel-cron", triggers: [{ cron: "0 * * * *" }], retries: 1 }, // hourly; fires per-engagement at their local 07:00
  async ({ step }) => {
    const now = new Date();
    const prepared = await step.run("prepare-engine-panel-runs", async () => {
      const rows = await db
        .select({
          engagementId: engagements.engagementId,
          buyer: engagements.buyer,
          pausedAt: engagements.pausedAt,
          deletedAt: engagements.deletedAt,
          stack: engagements.stack,
        })
        .from(repIdentityGraphs)
        .innerJoin(engagements, eq(repIdentityGraphs.engagementId, engagements.engagementId))
        .where(isNull(engagements.deletedAt));

      const disabled = await getDisabledEngagementIdsForSkill("rep-engine-panel");

      const out: { runId: string; engagementId: string }[] = [];
      for (const row of rows) {
        if (isEngagementPaused(row)) continue;
        if (disabled.has(row.engagementId)) continue;
        if (!matchesDailyLocalHour((row.stack as EngagementStack | null)?.timezone, REP_ENGINE_PANEL_LOCAL_HOUR, now)) continue;

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
 * Dispatches rep-trustpilot-watch once daily, at 08:00 in each engagement's
 * own timezone. Same shape as repEnginePanelCron above — see that one's
 * comment for the general pattern reasoning. Staggered to a different
 * local hour purely to spread load, not for any functional reason.
 */
export const repTrustpilotWatchCron = inngest.createFunction(
  { id: "rep-trustpilot-watch-cron", triggers: [{ cron: "0 * * * *" }], retries: 1 }, // hourly; fires per-engagement at their local 08:00
  async ({ step }) => {
    const now = new Date();
    const prepared = await step.run("prepare-trustpilot-watch-runs", async () => {
      const rows = await db
        .select({
          engagementId: engagements.engagementId,
          buyer: engagements.buyer,
          pausedAt: engagements.pausedAt,
          deletedAt: engagements.deletedAt,
          stack: engagements.stack,
        })
        .from(repIdentityGraphs)
        .innerJoin(engagements, eq(repIdentityGraphs.engagementId, engagements.engagementId))
        .where(isNull(engagements.deletedAt));

      const disabled = await getDisabledEngagementIdsForSkill("rep-trustpilot-watch");

      const out: { runId: string; engagementId: string }[] = [];
      for (const row of rows) {
        if (isEngagementPaused(row)) continue;
        if (disabled.has(row.engagementId)) continue;
        if (!matchesDailyLocalHour((row.stack as EngagementStack | null)?.timezone, REP_TRUSTPILOT_WATCH_LOCAL_HOUR, now)) continue;

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
 * Dispatches rep-reddit-watch once daily, at 09:00 in each engagement's own
 * timezone. Same shape again.
 */
export const repRedditWatchCron = inngest.createFunction(
  { id: "rep-reddit-watch-cron", triggers: [{ cron: "0 * * * *" }], retries: 1 }, // hourly; fires per-engagement at their local 09:00
  async ({ step }) => {
    const now = new Date();
    const prepared = await step.run("prepare-reddit-watch-runs", async () => {
      const rows = await db
        .select({
          engagementId: engagements.engagementId,
          buyer: engagements.buyer,
          pausedAt: engagements.pausedAt,
          deletedAt: engagements.deletedAt,
          stack: engagements.stack,
        })
        .from(repIdentityGraphs)
        .innerJoin(engagements, eq(repIdentityGraphs.engagementId, engagements.engagementId))
        .where(isNull(engagements.deletedAt));

      const disabled = await getDisabledEngagementIdsForSkill("rep-reddit-watch");

      const out: { runId: string; engagementId: string }[] = [];
      for (const row of rows) {
        if (isEngagementPaused(row)) continue;
        if (disabled.has(row.engagementId)) continue;
        if (!matchesDailyLocalHour((row.stack as EngagementStack | null)?.timezone, REP_REDDIT_WATCH_LOCAL_HOUR, now)) continue;

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
 * Dispatches rep-twitter-watch once daily, at 10:00 in each engagement's
 * own timezone. Same shape again.
 */
export const repTwitterWatchCron = inngest.createFunction(
  { id: "rep-twitter-watch-cron", triggers: [{ cron: "0 * * * *" }], retries: 1 }, // hourly; fires per-engagement at their local 10:00
  async ({ step }) => {
    const now = new Date();
    const prepared = await step.run("prepare-twitter-watch-runs", async () => {
      const rows = await db
        .select({
          engagementId: engagements.engagementId,
          buyer: engagements.buyer,
          pausedAt: engagements.pausedAt,
          deletedAt: engagements.deletedAt,
          stack: engagements.stack,
        })
        .from(repIdentityGraphs)
        .innerJoin(engagements, eq(repIdentityGraphs.engagementId, engagements.engagementId))
        .where(isNull(engagements.deletedAt));

      const disabled = await getDisabledEngagementIdsForSkill("rep-twitter-watch");

      const out: { runId: string; engagementId: string }[] = [];
      for (const row of rows) {
        if (isEngagementPaused(row)) continue;
        if (disabled.has(row.engagementId)) continue;
        if (!matchesDailyLocalHour((row.stack as EngagementStack | null)?.timezone, REP_TWITTER_WATCH_LOCAL_HOUR, now)) continue;

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
 * Dispatches rep-crisis-response once daily, at 11:00 in each engagement's
 * own timezone — after the four watch skills above have had a chance to
 * run at that same engagement's local 07:00-10:00. Because every rep-*
 * cron now keys off the SAME engagement's own timezone (not a shared UTC
 * clock), this ordering holds per-client regardless of which timezone that
 * client is in. Same eligibility gate as the others (has a real identity
 * graph); no separate "has anything actually been flagged" pre-filter here
 * — the service's own early-return (loadFlaggedFindingsSince returning
 * empty) already handles that case cheaply, without wasting an LLM call,
 * so pre-filtering at the cron level would just be the same check done
 * twice.
 */
export const repCrisisResponseCron = inngest.createFunction(
  { id: "rep-crisis-response-cron", triggers: [{ cron: "0 * * * *" }], retries: 1 }, // hourly; fires per-engagement at their local 11:00
  async ({ step }) => {
    const now = new Date();
    const prepared = await step.run("prepare-crisis-response-runs", async () => {
      const rows = await db
        .select({
          engagementId: engagements.engagementId,
          buyer: engagements.buyer,
          pausedAt: engagements.pausedAt,
          deletedAt: engagements.deletedAt,
          stack: engagements.stack,
        })
        .from(repIdentityGraphs)
        .innerJoin(engagements, eq(repIdentityGraphs.engagementId, engagements.engagementId))
        .where(isNull(engagements.deletedAt));

      const disabled = await getDisabledEngagementIdsForSkill("rep-crisis-response");

      const out: { runId: string; engagementId: string }[] = [];
      for (const row of rows) {
        if (isEngagementPaused(row)) continue;
        if (disabled.has(row.engagementId)) continue;
        if (!matchesDailyLocalHour((row.stack as EngagementStack | null)?.timezone, REP_CRISIS_RESPONSE_LOCAL_HOUR, now)) continue;

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

/**
 * Dispatches rep-digest once daily, at 18:00 in each engagement's own
 * timezone — the end of that client's day, well past crisis-response's
 * local 11:00, so a full day's detections are in before the rollup runs.
 * Once-daily, not the OG spec's twice-daily per-timezone cadence — see
 * digest.ts's own header for why once-daily matches this product's
 * existing rep-* cron shape rather than inventing a new mechanism for one
 * skill. Same eligibility gate as every other rep-* cron (has a real
 * identity graph).
 */
export const repDigestCron = inngest.createFunction(
  { id: "rep-digest-cron", triggers: [{ cron: "0 * * * *" }], retries: 1 }, // hourly; fires per-engagement at their local 18:00
  async ({ step }) => {
    const now = new Date();
    const prepared = await step.run("prepare-digest-runs", async () => {
      const rows = await db
        .select({
          engagementId: engagements.engagementId,
          buyer: engagements.buyer,
          pausedAt: engagements.pausedAt,
          deletedAt: engagements.deletedAt,
          stack: engagements.stack,
        })
        .from(repIdentityGraphs)
        .innerJoin(engagements, eq(repIdentityGraphs.engagementId, engagements.engagementId))
        .where(isNull(engagements.deletedAt));

      const disabled = await getDisabledEngagementIdsForSkill("rep-digest");

      const out: { runId: string; engagementId: string }[] = [];
      for (const row of rows) {
        if (isEngagementPaused(row)) continue;
        if (disabled.has(row.engagementId)) continue;
        if (!matchesDailyLocalHour((row.stack as EngagementStack | null)?.timezone, REP_DIGEST_LOCAL_HOUR, now)) continue;

        const runId = crypto.randomUUID();
        await startRun({
          id: runId,
          engagementId: row.engagementId,
          skillName: "rep-digest",
          phase: "rep_digest",
          label: row.buyer,
        });
        out.push({ runId, engagementId: row.engagementId });
      }
      return out;
    });

    if (prepared.length > 0) {
      await step.sendEvent(
        "dispatch-rep-digest-runs",
        prepared.map((r) => skillRunExecute.create({ runId: r.runId, engagementId: r.engagementId, skillName: "rep-digest" }))
      );
    }

    return { dispatched: prepared.length };
  }
);
