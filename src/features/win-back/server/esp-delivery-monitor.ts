// src/features/win-back/server/esp-delivery-monitor.ts
//
// Phase 6 — bounce/complaint-rate auto-pause. Called at the end of every
// delivery-event ingestion path (each platform's webhook route, the
// SMTP bounce classifier, the HubSpot poller) after recordDeliveryEvent.
//
// Reuses exitWinBackSequence — the same per-prospect ESP-unenroll
// machinery /api/win-back/enrollments/[id]/stop/route.ts already uses
// for a manual single-prospect stop — applied in bulk to every currently
// active enrollment on the engagement, plus a stack-level flag that
// blocks NEW enrollments via the worker-blocking-conditions registry
// (see WORKER_BLOCKING_CONDITIONS below).
//
// GHL coverage gap — deliberately NOT silently papered over. Every
// other platform in this Phase 6 batch has a real ingestion path
// (a webhook route, or HubSpot's poller). GHL does not: per this
// session's research, GHL's own bounce/complaint event source (LC
// Email marketplace webhooks) requires the app to be a registered GHL
// Marketplace OAuth app requesting the lc-email.readonly scope — a
// materially different, larger integration than this codebase's
// existing per-location API-key model (GHLCRMClient), comparable in
// scope to standing up an entire new OAuth provider (see the Composio
// OAuth system, composio.ts, for what that class of work actually
// involves). That's a real product decision, not something to fold
// silently into a webhook route. Consequence: a GHL-only client's
// bounce/complaint rate always reads 0 here — not because their
// deliverability is fine, but because nothing feeds this table for
// them yet. win-back-config-form.tsx surfaces this explicitly (a GHL
// client sees "not monitored," never a false-looking "0%") rather than
// letting silence read as health.
//
// Sends-denominator honesty note: the rate uses rolling-window
// ENROLLMENT count as the denominator, not a true per-touch send count.
// That's a real approximation, not a precision claim — the templated
// first email always fires per enrollment (enrollInWinBackSequence is
// called unconditionally, see pile-on/server/enrollment-service.ts's own
// comment), so "enrollments" is a reasonable proxy for "at least one
// send," but the actual multi-touch cadence for the 6 ESP-driven
// platforms runs inside the ESP's own automation — this app has no
// visibility into how many total touches each enrollment produced. This
// is disclosed in the stack field comments (schema.ts) too, not just
// here.

import { db } from "@/lib/db";
import { engagements, winBackEnrollments, type EngagementStack } from "@/models/schema";
import { eq, and } from "drizzle-orm";
import { getRollingDeliveryStats } from "@/lib/esp-delivery-events";
import { exitWinBackSequence } from "@/lib/platforms/email";
import { resolveCredential } from "@/lib/credentials";
import { notifyUser } from "@/lib/notify";

const ROLLING_WINDOW_DAYS = 7;

/** Reads current stats + thresholds and, if crossed and not already
 * paused, applies the pause: flips the stack flag, bulk-exits every
 * active enrollment from its ESP, and alerts the operator. Safe to call
 * unconditionally after every event — a no-op once already paused (never
 * re-fires, never re-sweeps enrollments a second time), and a no-op
 * below the sample floor or the thresholds. */
export async function checkAndApplyAutoPause(engagementId: string): Promise<void> {
  const [tenant] = await db
    .select({ whopUserId: engagements.whopUserId, workspaceId: engagements.workspaceId, stack: engagements.stack })
    .from(engagements)
    .where(eq(engagements.engagementId, engagementId))
    .limit(1);
  if (!tenant) return;
  const stack = (tenant.stack as EngagementStack | null) ?? ({} as EngagementStack);
  if (stack.win_back_auto_paused) return; // already paused — never re-fire

  const stats = await getRollingDeliveryStats(engagementId, ROLLING_WINDOW_DAYS);
  const minSample = stack?.win_back_delivery_sample_minimum ?? 20;
  if (stats.enrollments < minSample) return; // too little volume to trust a rate — same "small sample = noise" floor as Leak-Map/whop-refund-dispute-velocity

  const bounceRate = stats.bounced / stats.enrollments;
  const complaintRate = stats.complained / stats.enrollments;
  const bounceThreshold = stack?.win_back_bounce_rate_threshold ?? 0.05;
  const complaintThreshold = stack?.win_back_complaint_rate_threshold ?? 0.001;

  const crossed =
    bounceRate >= bounceThreshold
      ? { metric: "bounce", rate: bounceRate, threshold: bounceThreshold }
      : complaintRate >= complaintThreshold
        ? { metric: "complaint", rate: complaintRate, threshold: complaintThreshold }
        : null;
  if (!crossed) return;

  const reasonText = `${crossed.metric === "bounce" ? "Bounce" : "Complaint"} rate ${(crossed.rate * 100).toFixed(2)}% over the last ${ROLLING_WINDOW_DAYS} days (${stats.enrollments} enrollments, threshold ${(crossed.threshold * 100).toFixed(2)}%).`;

  await db
    .update(engagements)
    .set({
      stack: {
        ...stack,
        win_back_auto_paused: true,
        win_back_auto_paused_at: new Date().toISOString(),
        win_back_auto_paused_reason: reasonText,
      },
      updatedAt: new Date(),
    })
    .where(eq(engagements.engagementId, engagementId));

  // Bulk-exit every currently active enrollment — same mechanics as the
  // manual single-prospect stop route, just applied to all of them.
  const activeEnrollments = await db
    .select({ id: winBackEnrollments.id, prospectEmail: winBackEnrollments.prospectEmail })
    .from(winBackEnrollments)
    .where(and(eq(winBackEnrollments.engagementId, engagementId), eq(winBackEnrollments.status, "active")));

  if (activeEnrollments.length > 0 && stack?.email_platform && stack.email_platform !== "smtp") {
    try {
      const apiKey = await resolveCredential(engagementId, stack.email_platform);
      for (const enrollment of activeEnrollments) {
        try {
          await exitWinBackSequence(
            stack.email_platform,
            apiKey,
            enrollment.prospectEmail,
            {
              location_id: stack.booking_platform_meta?.location_id,
              recovery_workflow_id: stack.recovery_workflow_id,
              recovery_list_id: stack.recovery_list_id,
              activecampaign_base_url: stack.activecampaign_base_url,
            },
            "auto_paused"
          );
        } catch (espErr) {
          console.error(`[esp-delivery-monitor] ESP unenroll failed for enrollment ${enrollment.id}:`, espErr);
        }
      }
    } catch (credErr) {
      console.error(`[esp-delivery-monitor] Couldn't resolve credential to unenroll active prospects for ${engagementId}:`, credErr);
    }
  }

  if (activeEnrollments.length > 0) {
    await db
      .update(winBackEnrollments)
      .set({ status: "auto_paused", exitReason: "bounce_complaint_auto_pause", exitedAt: new Date() })
      .where(and(eq(winBackEnrollments.engagementId, engagementId), eq(winBackEnrollments.status, "active")));
  }

  if (tenant.whopUserId) {
    await notifyUser({
      whopUserId: tenant.whopUserId,
      engagementId,
      type: "win_back_delivery_auto_paused",
      severity: "critical",
      title: "Win-Back auto-paused — deliverability threshold crossed",
      body: `${reasonText} All ${activeEnrollments.length} active enrollment(s) were unenrolled from ${stack?.email_platform}. New enrollments are on hold until you resume from the engagement's Win-Back panel.`,
      slackWebhookUrl: stack?.slack_webhook_url,
      workspaceId: tenant.workspaceId ?? undefined,
    }).catch((e) => console.error("[esp-delivery-monitor] notify failed (non-fatal):", e));
  }
}

/** Operator-initiated resume — clears the pause flags. Does NOT
 * re-enroll prospects who were auto-paused; re-enrolling would need the
 * original triggering event (cancellation/no-show) to fire again, which
 * this deliberately does not fake. Backs a "Resume Win-Back sends"
 * control the operator uses once they've confirmed/fixed the underlying
 * deliverability problem. */
export async function resumeWinBackSends(engagementId: string): Promise<void> {
  const [tenant] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  const stack = (tenant?.stack as EngagementStack | null) ?? ({} as EngagementStack);
  const { win_back_auto_paused, win_back_auto_paused_at, win_back_auto_paused_reason, ...rest } = stack;
  await db
    .update(engagements)
    .set({ stack: rest, updatedAt: new Date() })
    .where(eq(engagements.engagementId, engagementId));
}
