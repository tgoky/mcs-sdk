import { db } from "@/lib/db";
import { repEngineFindings, repTrustpilotReviews, repRedditMentions } from "@/models/schema";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { ANOMALY_DETECTION_DEFAULTS, type AnomalyClass } from "@/features/reputation-manager/rep-thresholds";

export interface AnomalyResult {
  anomalyClass: AnomalyClass;
  description: string;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

async function countInWindow(
  engagementId: string,
  table: typeof repEngineFindings | typeof repTrustpilotReviews | typeof repRedditMentions,
  timeCol: any,
  start: Date,
  end: Date
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(table as any)
    .where(and(eq((table as any).engagementId, engagementId), gte(timeCol, start), lt(timeCol, end)));
  return Number(row?.count ?? 0);
}

/**
 * thresholds.yml.template's anomaly_detection.total_mention_spike —
 * combined volume across all three sources in the last window vs. the
 * baseline rate over the trailing days (excluding the window itself, so
 * the spike doesn't inflate its own baseline). Only evaluated when there
 * IS a baseline (baselineCount > 0) — a brand-new engagement's first
 * mentions aren't a "spike," there's nothing established yet to spike
 * relative to; that guard isn't in the spec, it's a genuinely necessary
 * addition to stop this firing on every new engagement's first data.
 */
async function checkTotalMentionSpike(engagementId: string, now: Date): Promise<AnomalyResult | null> {
  const cfg = ANOMALY_DETECTION_DEFAULTS.totalMentionSpike;
  const windowStart = new Date(now.getTime() - cfg.windowMinutes * 60 * 1000);
  const baselineStart = new Date(now.getTime() - cfg.baselineWindowDays * DAY_MS);

  const [recentEngine, recentTrustpilot, recentReddit, baselineEngine, baselineTrustpilot, baselineReddit] = await Promise.all([
    countInWindow(engagementId, repEngineFindings, repEngineFindings.runAt, windowStart, now),
    countInWindow(engagementId, repTrustpilotReviews, repTrustpilotReviews.createdAt, windowStart, now),
    countInWindow(engagementId, repRedditMentions, repRedditMentions.createdAt, windowStart, now),
    countInWindow(engagementId, repEngineFindings, repEngineFindings.runAt, baselineStart, windowStart),
    countInWindow(engagementId, repTrustpilotReviews, repTrustpilotReviews.createdAt, baselineStart, windowStart),
    countInWindow(engagementId, repRedditMentions, repRedditMentions.createdAt, baselineStart, windowStart),
  ]);

  const recentCount = recentEngine + recentTrustpilot + recentReddit;
  const baselineCount = baselineEngine + baselineTrustpilot + baselineReddit;
  if (baselineCount === 0) return null;

  const baselineHours = cfg.baselineWindowDays * 24 - cfg.windowMinutes / 60;
  const baselineRatePerWindow = (baselineCount / baselineHours) * (cfg.windowMinutes / 60);
  if (baselineRatePerWindow <= 0 || recentCount < cfg.multiplier * baselineRatePerWindow) return null;

  return {
    anomalyClass: "total_mention_spike",
    description: `${recentCount} mention(s) in the last ${cfg.windowMinutes} minutes vs. a baseline rate of ~${baselineRatePerWindow.toFixed(1)} for that window (${cfg.multiplier}x threshold).`,
  };
}

/** anomaly_detection.negative_sentiment_spike — recent-window negative
 * share crossing an absolute floor, gated to only fire when the baseline
 * negative share is itself low (this operator isn't normally this
 * negative, so the recent window is the anomaly, not their steady state). */
async function checkNegativeSentimentSpike(engagementId: string, now: Date): Promise<AnomalyResult | null> {
  const cfg = ANOMALY_DETECTION_DEFAULTS.negativeSentimentSpike;
  const windowStart = new Date(now.getTime() - cfg.windowMinutes * 60 * 1000);
  const baselineStart = new Date(now.getTime() - cfg.baselineWindowDays * DAY_MS);

  async function sentimentSplit(start: Date, end: Date): Promise<{ total: number; negative: number }> {
    const [engine, trustpilot, reddit] = await Promise.all([
      db.select({ sentiment: repEngineFindings.sentiment }).from(repEngineFindings).where(and(eq(repEngineFindings.engagementId, engagementId), gte(repEngineFindings.runAt, start), lt(repEngineFindings.runAt, end))),
      db.select({ sentiment: repTrustpilotReviews.sentiment }).from(repTrustpilotReviews).where(and(eq(repTrustpilotReviews.engagementId, engagementId), gte(repTrustpilotReviews.createdAt, start), lt(repTrustpilotReviews.createdAt, end))),
      db.select({ sentiment: repRedditMentions.sentiment }).from(repRedditMentions).where(and(eq(repRedditMentions.engagementId, engagementId), gte(repRedditMentions.createdAt, start), lt(repRedditMentions.createdAt, end))),
    ]);
    const all = [...engine, ...trustpilot, ...reddit];
    return { total: all.length, negative: all.filter((r) => r.sentiment === "negative").length };
  }

  const [recent, baseline] = await Promise.all([sentimentSplit(windowStart, now), sentimentSplit(baselineStart, windowStart)]);
  if (recent.total === 0 || baseline.total === 0) return null;

  const recentNegativePct = (recent.negative / recent.total) * 100;
  const baselineNegativePct = (baseline.negative / baseline.total) * 100;
  if (recentNegativePct < cfg.thresholdPct || baselineNegativePct > cfg.baselineNegativePctCeiling) return null;

  return {
    anomalyClass: "negative_sentiment_spike",
    description: `${recentNegativePct.toFixed(0)}% negative in the last ${cfg.windowMinutes} minutes (${recent.negative}/${recent.total}) vs. a ${cfg.baselineWindowDays}-day baseline of ${baselineNegativePct.toFixed(0)}% negative.`,
  };
}

/** anomaly_detection.new_source_spike — scoped to Reddit's subreddit
 * field, the only domain-like dimension available (see this file's
 * header comment / rep-thresholds.ts). Counts distinct subreddits whose
 * FIRST-EVER mention of this engagement falls inside the window. */
async function checkNewSourceSpike(engagementId: string, now: Date): Promise<AnomalyResult | null> {
  const cfg = ANOMALY_DETECTION_DEFAULTS.newSourceSpike;
  const windowStart = new Date(now.getTime() - cfg.windowHours * HOUR_MS);

  const rows = await db
    .select({ subreddit: repRedditMentions.subreddit, createdAt: repRedditMentions.createdAt })
    .from(repRedditMentions)
    .where(eq(repRedditMentions.engagementId, engagementId));

  const firstSeenBySubreddit = new Map<string, Date>();
  for (const row of rows) {
    const existing = firstSeenBySubreddit.get(row.subreddit);
    if (!existing || row.createdAt < existing) firstSeenBySubreddit.set(row.subreddit, row.createdAt);
  }

  const newInWindow = Array.from(firstSeenBySubreddit.entries()).filter(([, firstSeen]) => firstSeen >= windowStart && firstSeen <= now);
  if (newInWindow.length < cfg.newDomainCount) return null;

  return {
    anomalyClass: "new_source_spike",
    description: `${newInWindow.length} new subreddit(s) mentioning this client for the first time in the last ${cfg.windowHours} hours: ${newInWindow.map(([s]) => `r/${s}`).join(", ")}.`,
  };
}

/** anomaly_detection.reviewer_velocity_drop — scoped to Trustpilot, the
 * only source with a "reviewer" concept. A sudden drop can mean reviews
 * are being suppressed, the listing was hidden, or something else
 * changed — worth surfacing even though it isn't a negative-content
 * event on its own. */
async function checkReviewerVelocityDrop(engagementId: string, now: Date): Promise<AnomalyResult | null> {
  const cfg = ANOMALY_DETECTION_DEFAULTS.reviewerVelocityDrop;
  const recentStart = new Date(now.getTime() - cfg.windowWeeks * WEEK_MS);
  const baselineStart = new Date(recentStart.getTime() - cfg.baselineWindowWeeks * WEEK_MS);

  const [recentCount, baselineCount] = await Promise.all([
    countInWindow(engagementId, repTrustpilotReviews, repTrustpilotReviews.createdAt, recentStart, now),
    countInWindow(engagementId, repTrustpilotReviews, repTrustpilotReviews.createdAt, baselineStart, recentStart),
  ]);

  if (baselineCount === 0) return null;
  const baselineAvgPerWindow = (baselineCount / cfg.baselineWindowWeeks) * cfg.windowWeeks;
  if (baselineAvgPerWindow <= 0) return null;

  const dropFloor = baselineAvgPerWindow * (1 - cfg.dropPct / 100);
  if (recentCount > dropFloor) return null;

  return {
    anomalyClass: "reviewer_velocity_drop",
    description: `Only ${recentCount} Trustpilot review(s) in the last ${cfg.windowWeeks} week(s) vs. a ${cfg.baselineWindowWeeks}-week baseline average of ${baselineAvgPerWindow.toFixed(1)} (${cfg.dropPct}%+ drop).`,
  };
}

/**
 * Runs all four thresholds.yml.template anomaly_detection checks for one
 * engagement. Independent of whether any individual record was flagged —
 * a spike can fire on ordinary-looking mentions arriving too fast, which
 * is why crisis-response-service.ts runs this before its
 * no-flagged-findings early-return, not after.
 */
export async function detectAnomalies(engagementId: string, now: Date = new Date()): Promise<AnomalyResult[]> {
  const results = await Promise.all([
    checkTotalMentionSpike(engagementId, now),
    checkNegativeSentimentSpike(engagementId, now),
    checkNewSourceSpike(engagementId, now),
    checkReviewerVelocityDrop(engagementId, now),
  ]);
  return results.filter((r): r is AnomalyResult => r !== null);
}

/**
 * How long a fired anomaly's own condition can plausibly keep re-firing:
 * each check re-evaluates a rolling window every time crisis-response
 * runs, not a "since last check" delta the way flagged findings are —
 * so a condition that's still true on the next run (this cron is twice
 * daily; new_source_spike's 24h window and reviewer_velocity_drop's
 * 1-week window both comfortably outlive that gap) would otherwise
 * re-declare the same incident every run. crisis-response-service.ts
 * uses this to suppress re-declaring an anomaly class within its own
 * window of a prior incident that already carried it.
 */
export function anomalyCooldownMs(anomalyClass: AnomalyClass): number {
  switch (anomalyClass) {
    case "total_mention_spike":
      return ANOMALY_DETECTION_DEFAULTS.totalMentionSpike.windowMinutes * 60 * 1000;
    case "negative_sentiment_spike":
      return ANOMALY_DETECTION_DEFAULTS.negativeSentimentSpike.windowMinutes * 60 * 1000;
    case "new_source_spike":
      return ANOMALY_DETECTION_DEFAULTS.newSourceSpike.windowHours * HOUR_MS;
    case "reviewer_velocity_drop":
      return ANOMALY_DETECTION_DEFAULTS.reviewerVelocityDrop.windowWeeks * WEEK_MS;
  }
}
