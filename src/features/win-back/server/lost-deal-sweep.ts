import { db } from "@/lib/db";
import { winBackEnrollments, engagements, type EngagementStack } from "@/models/schema";
import { and, eq, lt, sql, inArray } from "drizzle-orm";
import { buildLongTermNurture } from "./cadence-builder";
import { FIRST_NAME_MERGE } from "./recovery-service";
import { KlaviyoClient } from "@/lib/platforms/email";
import { resolveCredential } from "@/lib/credentials";
import { notifyUser } from "@/lib/notify";

export interface LostDealSweepResult {
  checked: number;
  markedLost: number;
  nurtureGenerated: number;
  autoEnrolled: number;
}

/**
 * Fast, DB-only prep: finds every winBackEnrollments row whose recovery
 * window elapsed, marks each "lost" and atomically increments the
 * engagement's winBackCounts.lost_count, and groups the results by
 * engagement. No network calls in here — this is what lostDealSweepCron's
 * single step.run() does before fanning out one lostDealSweepEngagement
 * event per engagement for the slow parts (LLM generation, ESP
 * enrollment, notification). See the comment on that event type in
 * src/lib/inngest.ts for why this split exists.
 */
export async function markElapsedEnrollmentsLost(): Promise<
  { markedLost: number; byEngagement: Array<{ engagementId: string; enrollmentIds: string[] }> }
> {
  const now = new Date();

  const elapsed = await db
    .select()
    .from(winBackEnrollments)
    .where(
      and(
        eq(winBackEnrollments.status, "active"),
        lt(
          sql`${winBackEnrollments.enrolledAt} + (${winBackEnrollments.recoveryWindowDays}::text || ' days')::interval`,
          now
        )
      )
    );

  const byEngagementMap = new Map<string, string[]>();

  for (const row of elapsed) {
    await db
      .update(winBackEnrollments)
      .set({ status: "lost", lostAt: now })
      .where(eq(winBackEnrollments.id, row.id));

    await db
      .update(engagements)
      .set({
        winBackCounts: sql`jsonb_set(
          coalesce(${engagements.winBackCounts}, '{"recovery_count":0,"lost_count":0}'::jsonb),
          '{lost_count}',
          (coalesce((${engagements.winBackCounts}->>'lost_count')::int, 0) + 1)::text::jsonb
        )`,
      })
      .where(eq(engagements.engagementId, row.engagementId));

    const list = byEngagementMap.get(row.engagementId) ?? [];
    list.push(row.id);
    byEngagementMap.set(row.engagementId, list);
  }

  return {
    markedLost: elapsed.length,
    byEngagement: Array.from(byEngagementMap, ([engagementId, enrollmentIds]) => ({ engagementId, enrollmentIds })),
  };
}

/**
 * The slow, per-engagement part: generates long-term nurture content
 * (Claude call, only if not already generated for this engagement),
 * attempts Klaviyo auto-enrollment, and notifies the buyer. Runs inside
 * its own fanned-out Inngest invocation (one per engagement with newly
 * lost prospects), not inside the main cron's loop.
 */
export async function processLostDealsForEngagement(
  engagementId: string,
  enrollmentIds: string[]
): Promise<{ nurtureGenerated: boolean; autoEnrolled: number }> {
  const [tenant] = await db.select().from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  if (!tenant) return { nurtureGenerated: false, autoEnrolled: 0 };

  const stack = (tenant.stack as EngagementStack | null) ?? ({} as EngagementStack);
  let nurtureGenerated = false;
  let autoEnrolled = 0;

  // ── Generate long-term nurture content once per engagement ─────────
  let nurtureEmails = (tenant.longTermNurtureAssetMap as any)?.emails;
  if (!nurtureEmails) {
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://mcs-abra.vercel.app";
      const rescheduleUrl = `${appUrl}/reschedule/${engagementId}`;
      const emailPlatform = stack.email_platform ?? "klaviyo";

      const { emails } = await buildLongTermNurture({
        buyer: tenant.buyer,
        brandVoiceProfile: tenant.brandVoiceProfile,
        offerDetails: tenant.offerDetails as any,
        rescheduleUrlMergeField: rescheduleUrl,
        firstNameMergeField: FIRST_NAME_MERGE[emailPlatform] ?? "{{first_name}}",
        prospectMeets: tenant.prospectMeets ?? undefined,
      });

      await db
        .update(engagements)
        .set({
          longTermNurtureAssetMap: { generatedAt: new Date().toISOString(), emails },
          updatedAt: new Date(),
        })
        .where(eq(engagements.engagementId, engagementId));

      nurtureEmails = emails;
      nurtureGenerated = true;
    } catch (e: any) {
      console.error(`[lost-deal-sweep] Nurture generation failed for ${engagementId}:`, e.message);
    }
  }

  // ── Fetch the enrollment rows for prospect email/name ───────────────
  const rows = await db
    .select()
    .from(winBackEnrollments)
    .where(inArray(winBackEnrollments.id, enrollmentIds));

  // ── Auto-enrollment (Klaviyo only) ──────────────────────────────────
  if (stack.email_platform === "klaviyo" && stack.long_term_nurture_list_id) {
    try {
      const apiKey = await resolveCredential(engagementId, "klaviyo");
      const klaviyo = new KlaviyoClient(apiKey);
      for (const row of rows) {
        await klaviyo.enrollInList(row.prospectEmail, row.prospectName ?? "", stack.long_term_nurture_list_id, {
          showtime_status: "long_term_nurture",
        });
        autoEnrolled++;
      }
    } catch (e: any) {
      console.error(`[lost-deal-sweep] Klaviyo auto-enrollment failed for ${engagementId}:`, e.message);
    }
  }

  // ── Notify the buyer ─────────────────────────────────────────────
  try {
    await notifyUser({
      whopUserId: tenant.whopUserId,
      engagementId,
      type: "lost_deal_swept",
      severity: "info",
      title: `${rows.length} prospect${rows.length > 1 ? "s" : ""} moved to long-term nurture`,
      body: `${rows.length} prospect${rows.length > 1 ? "s" : ""} went past the recovery window without rebooking and ${rows.length > 1 ? "have" : "has"} been marked lost. ${
        stack.email_platform === "klaviyo" && stack.long_term_nurture_list_id
          ? "Auto-enrolled into the configured long-term nurture list."
          : "Long-term nurture content is ready in the engagement dashboard — no auto-enrollment list configured yet, so this needs to be loaded manually."
      }`,
      slackWebhookUrl: stack.slack_webhook_url,
    });
  } catch (e: any) {
    console.error(`[lost-deal-sweep] Notification failed for ${engagementId}:`, e.message);
  }

  return { nurtureGenerated, autoEnrolled };
}

/**
 * Sequential, does-everything version — kept for the manual on-demand
 * route, same reasoning as runCredentialHealthCheck in credential-health.ts.
 * The scheduled cron (lostDealSweepCron) does NOT call this — it fans out
 * via markElapsedEnrollmentsLost + processLostDealsForEngagement instead.
 */
export async function runLostDealSweep(): Promise<LostDealSweepResult> {
  const { markedLost, byEngagement } = await markElapsedEnrollmentsLost();
  let nurtureGenerated = 0;
  let autoEnrolled = 0;

  for (const { engagementId, enrollmentIds } of byEngagement) {
    const result = await processLostDealsForEngagement(engagementId, enrollmentIds);
    if (result.nurtureGenerated) nurtureGenerated++;
    autoEnrolled += result.autoEnrolled;
  }

  return { checked: markedLost, markedLost, nurtureGenerated, autoEnrolled };
}
