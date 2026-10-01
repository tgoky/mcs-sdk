import { inngest } from "@/lib/inngest";
import { db } from "@/lib/db";
import { engagements, repIdentityGraphs, type EngagementStack } from "@/models/schema";
import { isEngagementPaused } from "@/lib/engagement-status";
import { getDisabledEngagementIdsForSkill } from "@/lib/engagement-skills";
import { repIdentityIsComplete } from "@/lib/rep-engagements";
import { matchesDailyLocalHour } from "@/features/leak-map/server/schedule-matcher";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { dispatchScheduledSkillRuns } from "@/inngest/fan-out";

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
// The Outscraper watches, after X and before crisis-response reads them.
const REP_GOOGLE_REVIEWS_WATCH_LOCAL_HOUR = 8;
const REP_NEWS_WATCH_LOCAL_HOUR = 9;
const REP_SEARCH_WATCH_LOCAL_HOUR = 10;

/** Each client's run starts at a stable point in the first 45 minutes of
 * its local hour instead of every client at :00 (src/inngest/fan-out.ts). */
const REP_SPREAD_MINUTES = 45;

/**
 * An hourly cron that starts `skillName` for every client with a complete
 * identity setup whose local hour is `localHour`, skipping paused, deleted
 * and switched-off clients. One shape for all nine Reputation Manager
 * skills; Inngest function ids stay `${skillName}-cron`.
 *
 * Pages through clients 500 at a time and creates each page's runs in one
 * INSERT (it used to load every client and insert one run at a time in a
 * single step), then sends them to the skill dispatcher spread across the
 * hour.
 */
function dailyRepCron(skillName: string, phase: string, localHour: number) {
  return inngest.createFunction(
    { id: `${skillName}-cron`, triggers: [{ cron: "0 * * * *" }], retries: 1 },
    async ({ step }) => {
      const dispatched = await dispatchScheduledSkillRuns(step, {
        id: `prepare-${skillName}-runs`,
        skillName,
        phase,
        spreadMinutes: REP_SPREAD_MINUTES,
        loadPage: (after, limit) =>
          db
            .select({
              engagementId: engagements.engagementId,
              buyer: engagements.buyer,
              pausedAt: engagements.pausedAt,
              deletedAt: engagements.deletedAt,
              stack: engagements.stack,
            })
            .from(repIdentityGraphs)
            .innerJoin(engagements, eq(repIdentityGraphs.engagementId, engagements.engagementId))
            .where(and(isNull(engagements.deletedAt), repIdentityIsComplete, after ? gt(engagements.engagementId, after) : undefined))
            .orderBy(asc(engagements.engagementId))
            .limit(limit),
        select: async (rows, now) => {
          const disabled = await getDisabledEngagementIdsForSkill(skillName);
          return rows
            .filter((row) => !isEngagementPaused(row) && !disabled.has(row.engagementId))
            .filter((row) => matchesDailyLocalHour((row.stack as EngagementStack | null)?.timezone, localHour, now))
            .map((row) => ({ engagementId: row.engagementId, label: row.buyer }));
        },
      });
      return { dispatched };
    }
  );
}

/** Once daily at 07:00 local. Deliberately once daily, not the OG skill
 * pack's twice-daily default: this is the scoped-down tripwire-only v1 (see
 * engine-panel-service.ts), and a lower cadence is easier to raise later
 * once there's real cost data than the reverse. */
export const repEnginePanelCron = dailyRepCron("rep-engine-panel", "engine_panel", REP_ENGINE_PANEL_LOCAL_HOUR);
// The watches are staggered to different local hours purely to spread load.
export const repTrustpilotWatchCron = dailyRepCron("rep-trustpilot-watch", "trustpilot_watch", REP_TRUSTPILOT_WATCH_LOCAL_HOUR);
export const repRedditWatchCron = dailyRepCron("rep-reddit-watch", "reddit_watch", REP_REDDIT_WATCH_LOCAL_HOUR);
export const repTwitterWatchCron = dailyRepCron("rep-twitter-watch", "twitter_watch", REP_TWITTER_WATCH_LOCAL_HOUR);
export const repGoogleReviewsWatchCron = dailyRepCron("rep-google-reviews-watch", "google_reviews_watch", REP_GOOGLE_REVIEWS_WATCH_LOCAL_HOUR);
export const repNewsWatchCron = dailyRepCron("rep-news-watch", "news_watch", REP_NEWS_WATCH_LOCAL_HOUR);
export const repSearchWatchCron = dailyRepCron("rep-search-watch", "search_watch", REP_SEARCH_WATCH_LOCAL_HOUR);
/** After the day's watches, so it assesses what they found. */
export const repCrisisResponseCron = dailyRepCron("rep-crisis-response", "crisis_response", REP_CRISIS_RESPONSE_LOCAL_HOUR);
export const repDigestCron = dailyRepCron("rep-digest", "rep_digest", REP_DIGEST_LOCAL_HOUR);
