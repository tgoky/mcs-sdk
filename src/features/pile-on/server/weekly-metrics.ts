import { db } from "@/lib/db";
import { skillRuns, engagements, type EngagementStack } from "@/models/schema";
import { and, eq, gte, lt } from "drizzle-orm";
import { KlaviyoClient } from "@/lib/platforms/email";
import { resolveCredential } from "@/lib/credentials";
import { notifyUser } from "@/lib/notify";
import { isEngagementPaused } from "@/lib/engagement-status";

export interface WeeklyMetricsResult {
  engagementsProcessed: number;
  notified: number;
}

/**
 * Weekly Monday metrics readout — the piece of the original spec that had
 * no corresponding task loop at all before this.
 *
 * Deliberately simple, on purpose: "opening metrics" here means new
 * bookings this week vs. the prior week (a real, honest signal derived
 * from skill_runs, which already records every successful pile-on run),
 * and "list sizes" means Klaviyo target/recovery list profile counts
 * (real, via the verified profile_count endpoint added to KlaviyoClient).
 * "Traffic anomalies" in the original spec is vague enough that building
 * a full anomaly-detection system for it would mean inventing behavior
 * with nothing to verify it against — so this ships the one honest,
 * checkable anomaly signal available today (a >=30% week-over-week
 * booking drop, gated on a minimum sample size so a buyer with 2 bookings
 * a week doesn't get a false "anomaly" alert from ordinary noise) rather
 * than a fabricated broader analytics engine.
 *
 * List-size reporting is Klaviyo-only for now, matching the precedent set
 * by the lost-deal sweep's Klaviyo-only auto-enrollment.
 *
 * Delivery reuses notifyUser as-is: in-app + Slack always, and email to
 * the account owner automatically if RESEND_API_KEY is configured.
 */

/**
 * Fast, DB-only prep: computes this-week/prior-week booking counts per
 * engagement (from skill_runs, no external API calls) and returns just
 * the engagement ids that have anything worth reporting. This is what
 * weeklyMetricsCron's single step.run() does before fanning out one
 * weeklyMetricsEngagement event per id — the slow part (Klaviyo list-size
 * lookups + notification) moves to processWeeklyMetricsForEngagement,
 * run inside its own fanned-out invocation instead of a shared loop.
 */
export async function findEngagementsForWeeklyReadout(): Promise<string[]> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const allEngagements = await db
    .select({ engagementId: engagements.engagementId, pausedAt: engagements.pausedAt })
    .from(engagements);
  const eligible: string[] = [];

  for (const { engagementId, pausedAt } of allEngagements) {
    if (isEngagementPaused({ pausedAt })) continue;

    const [thisWeekBookings, priorWeekBookings] = await Promise.all([
      db
        .select({ id: skillRuns.id })
        .from(skillRuns)
        .where(
          and(
            eq(skillRuns.engagementId, engagementId),
            eq(skillRuns.skillName, "pile-on"),
            eq(skillRuns.status, "success"),
            gte(skillRuns.startedAt, weekAgo)
          )
        ),
      db
        .select({ id: skillRuns.id })
        .from(skillRuns)
        .where(
          and(
            eq(skillRuns.engagementId, engagementId),
            eq(skillRuns.skillName, "pile-on"),
            eq(skillRuns.status, "success"),
            gte(skillRuns.startedAt, twoWeeksAgo),
            lt(skillRuns.startedAt, weekAgo)
          )
        ),
    ]);

    // Nothing worth reporting for an engagement with zero activity in
    // either window — avoids a weekly "0 bookings, 0 bookings" email for
    // an engagement that's still mid-setup or paused.
    if (thisWeekBookings.length === 0 && priorWeekBookings.length === 0) continue;
    eligible.push(engagementId);
  }

  return eligible;
}

/**
 * The slow, per-engagement part: recomputes this engagement's booking
 * counts (cheap, but re-run here rather than threaded through the event
 * payload — keeps the event payload minimal, matching the "only ship what
 * a fanned-out handler can't cheaply re-derive itself" principle used
 * elsewhere), fetches Klaviyo list sizes, and notifies the buyer.
 */
export async function processWeeklyMetricsForEngagement(engagementId: string): Promise<{ notified: boolean }> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [tenant] = await db.select().from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  if (!tenant) return { notified: false };

  const stack = (tenant.stack as EngagementStack | null) ?? ({} as EngagementStack);

  const [thisWeekBookings, priorWeekBookings] = await Promise.all([
    db
      .select({ id: skillRuns.id })
      .from(skillRuns)
      .where(
        and(
          eq(skillRuns.engagementId, engagementId),
          eq(skillRuns.skillName, "pile-on"),
          eq(skillRuns.status, "success"),
          gte(skillRuns.startedAt, weekAgo)
        )
      ),
    db
      .select({ id: skillRuns.id })
      .from(skillRuns)
      .where(
        and(
          eq(skillRuns.engagementId, engagementId),
          eq(skillRuns.skillName, "pile-on"),
          eq(skillRuns.status, "success"),
          gte(skillRuns.startedAt, twoWeeksAgo),
          lt(skillRuns.startedAt, weekAgo)
        )
      ),
  ]);

  const thisWeekCount = thisWeekBookings.length;
  const priorWeekCount = priorWeekBookings.length;

  let pctChange: number | null = null;
  let isAnomaly = false;
  if (priorWeekCount > 0) {
    pctChange = ((thisWeekCount - priorWeekCount) / priorWeekCount) * 100;
    isAnomaly = priorWeekCount >= 3 && pctChange <= -30;
  }

  const listSizes: string[] = [];
  if (stack.email_platform === "klaviyo") {
    try {
      const apiKey = await resolveCredential(engagementId, "klaviyo");
      const klaviyo = new KlaviyoClient(apiKey);
      if (stack.target_list_id) {
        const count = await klaviyo.getListProfileCount(stack.target_list_id);
        if (count !== null) listSizes.push(`Target list: ${count} profiles`);
      }
      if (stack.recovery_list_id) {
        const count = await klaviyo.getListProfileCount(stack.recovery_list_id);
        if (count !== null) listSizes.push(`Recovery list: ${count} profiles`);
      }
    } catch (e: any) {
      console.error(`[weekly-metrics] List size fetch failed for ${engagementId}:`, e.message);
    }
  }

  const bodyLines = [
    `Bookings this week: ${thisWeekCount} (${pctChange === null ? "no prior-week baseline yet" : `${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(0)}% vs last week`})`,
    ...listSizes,
  ];
  if (isAnomaly) {
    bodyLines.push(`⚠ Booking volume dropped ${Math.abs(pctChange!).toFixed(0)}% week-over-week — may be worth a look.`);
  }

  try {
    await notifyUser({
      whopUserId: tenant.whopUserId,
      engagementId,
      type: "weekly_metrics",
      severity: isAnomaly ? "warning" : "info",
      title: `Weekly readout — ${tenant.buyer}`,
      body: bodyLines.join("\n"),
      slackWebhookUrl: stack.slack_webhook_url,
    });
    return { notified: true };
  } catch (e: any) {
    console.error(`[weekly-metrics] Notification failed for ${engagementId}:`, e.message);
    return { notified: false };
  }
}

/**
 * Sequential, does-everything version — kept for potential manual/on-demand
 * use. The scheduled cron (weeklyMetricsCron) does NOT call this — it fans
 * out via findEngagementsForWeeklyReadout + processWeeklyMetricsForEngagement
 * instead, for the same reason credential-health.ts and lost-deal-sweep.ts
 * split the same way: one giant step.run() looping every tenant's real API
 * calls gives Inngest no step boundary to checkpoint at.
 */
export async function runWeeklyMetricsReadout(): Promise<WeeklyMetricsResult> {
  const eligible = await findEngagementsForWeeklyReadout();
  let notified = 0;
  for (const engagementId of eligible) {
    const result = await processWeeklyMetricsForEngagement(engagementId);
    if (result.notified) notified++;
  }
  return { engagementsProcessed: eligible.length, notified };
}
