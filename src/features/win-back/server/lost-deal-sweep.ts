import { db } from "@/lib/db";
import { winBackEnrollments, engagements, type EngagementStack } from "@/models/schema";
import { and, eq, lt, sql } from "drizzle-orm";
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
 * Daily sweep — see credentialHealthCron in src/inngest/crons.ts for the
 * same "global daily maintenance pass, not a per-engagement skill run"
 * shape this follows.
 *
 * Finds every winBackEnrollments row still "active" whose recovery window
 * has elapsed (enrolledAt + recoveryWindowDays < now), which is the thing
 * that was never previously computable at all — nothing recorded
 * individual enrollments before src/features/pile-on/server/enrollment-service.ts
 * started writing to winBackEnrollments. For each:
 *   1. Marks the enrollment "lost" and atomically increments the
 *      engagement's winBackCounts.lost_count.
 *   2. Generates the long-term nurture content ONCE per engagement (not
 *      once per lost prospect — same content-per-engagement philosophy as
 *      the recovery cadence itself), only on the first lost prospect for
 *      that engagement that doesn't already have longTermNurtureAssetMap set.
 *   3. Attempts auto-enrollment into long_term_nurture_list_id if the
 *      buyer configured one. Klaviyo only for now — see the comment below
 *      on why the other three platforms aren't wired yet.
 */
export async function runLostDealSweep(): Promise<LostDealSweepResult> {
  const now = new Date();

  // Postgres-side elapsed-window filter: enrolledAt + recoveryWindowDays
  // (an interval built from the row's own column) must be before now.
  // Keeps this a single query rather than pulling every active row and
  // filtering in JS.
  const elapsed = await db
    .select()
    .from(winBackEnrollments)
    .where(
      and(
        eq(winBackEnrollments.status, "active"),
        lt(
          sql`${winBackEnrollments.enrolledAt} + (${winBackEnrollments.recoveryWindowDays} || ' days')::interval`,
          now
        )
      )
    );

  let markedLost = 0;
  let nurtureGenerated = 0;
  let autoEnrolled = 0;

  // Group by engagement so nurture content generation happens at most
  // once per engagement per sweep, not once per lost prospect.
  const byEngagement = new Map<string, typeof elapsed>();
  for (const row of elapsed) {
    const list = byEngagement.get(row.engagementId) ?? [];
    list.push(row);
    byEngagement.set(row.engagementId, list);
  }

  for (const [engagementId, rows] of byEngagement) {
    const [tenant] = await db
      .select()
      .from(engagements)
      .where(eq(engagements.engagementId, engagementId))
      .limit(1);
    if (!tenant) continue;

    const stack = (tenant.stack as EngagementStack | null) ?? ({} as EngagementStack);

    // ── Mark each enrollment lost + atomic count increment ────────────
    for (const row of rows) {
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
        .where(eq(engagements.engagementId, engagementId));

      markedLost++;
    }

    // ── Generate long-term nurture content once per engagement ─────────
    let nurtureEmails = (tenant.longTermNurtureAssetMap as any)?.emails;
    if (!nurtureEmails) {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.muddventures.com";
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
        nurtureGenerated++;
      } catch (e: any) {
        console.error(`[lost-deal-sweep] Nurture generation failed for ${engagementId}:`, e.message);
        // Don't let a generation failure block the lost-marking above —
        // the counts are still correct, content generation can retry on
        // tomorrow's sweep since longTermNurtureAssetMap stays unset.
      }
    }

    // ── Auto-enrollment (Klaviyo only) ──────────────────────────────────
    // Klaviyo is list-based, matching long_term_nurture_list_id directly.
    // HubSpot/ActiveCampaign/GHL are workflow/automation-based here (same
    // as pile-on/win-back's own enrollment), which would need a
    // *_workflow_id-equivalent field this app's onboarding doesn't collect
    // for long-term nurture yet — not fabricating that wiring without a
    // real field to back it. Klaviyo buyers get real auto-enrollment
    // today; everyone else gets the generated content waiting in
    // longTermNurtureAssetMap for manual loading, same as they'd get for
    // the recovery cadence today if they never configured a workflow ID.
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
  }

  return { checked: elapsed.length, markedLost, nurtureGenerated, autoEnrolled };
}
