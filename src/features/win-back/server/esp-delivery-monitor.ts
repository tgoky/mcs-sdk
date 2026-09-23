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
import { eq, and, inArray, sql } from "drizzle-orm";
import { getRollingDeliveryStats } from "@/lib/esp-delivery-events";
import { exitWinBackSequence } from "@/lib/platforms/email";
import { resolveCredential } from "@/lib/credentials";
import { notifyUser } from "@/lib/notify";

const ROLLING_WINDOW_DAYS = 7;

/** Reads current stats + thresholds and, if crossed and not already
 * paused, applies the pause: flips the stack flag (via an atomic
 * compare-and-swap, not a naive read-then-write — see below), bulk-exits
 * every active enrollment from its ESP, and alerts the operator. Safe to
 * call unconditionally after every event.
 *
 * Bug fixes from this session's own adversarial review, kept as comments
 * so the fix's reasoning survives the next person reading this:
 *
 * 1. RACE CONDITION: two webhook deliveries for the same engagement
 *    arriving near-simultaneously (realistic — an ESP often fires
 *    bounce/complaint events in a tight burst) could both read
 *    win_back_auto_paused as false before either wrote true, both cross
 *    the threshold, and both run the bulk-exit sweep + send a critical
 *    alert. Fixed by making the pause-flag write a real atomic
 *    compare-and-swap (an UPDATE ... WHERE the flag is still unset,
 *    evaluated server-side against the row's current state, not a
 *    client-side read-then-write) — only the caller whose UPDATE
 *    actually matches a row gets to proceed to the sweep.
 * 2. PARTIAL-FAILURE MASKING: the old version unconditionally marked
 *    EVERY active enrollment "auto_paused" in the DB after the sweep,
 *    even ones whose ESP-side unenroll call had actually thrown — so the
 *    DB could claim a prospect was stopped while the ESP was still
 *    actively emailing them, with the operator alert falsely claiming
 *    "all N were unenrolled." Fixed by only flipping DB status for
 *    enrollments whose exit actually succeeded (or needed no ESP call at
 *    all, i.e. smtp), and being honest in the alert body about any that
 *    didn't.
 * 3. PERMANENT STRANDING: because the pause flag was written before the
 *    sweep loop, a process killed/timed-out partway through a large
 *    sequential loop of ESP HTTP calls meant the un-swept remainder
 *    would never be retried — every later call short-circuited on
 *    "already paused." Fixed by sweeping for any still-active
 *    enrollments on EVERY call, not just the one that first crossed the
 *    threshold — cheap (one SELECT) when there's nothing left to do,
 *    and it means a later webhook event finishes an interrupted sweep
 *    instead of abandoning it. Deliberately does not re-notify the
 *    operator on a straggler-only sweep, to avoid alert spam if an ESP
 *    outage makes every attempt fail. */
export async function checkAndApplyAutoPause(engagementId: string): Promise<void> {
  const [tenant] = await db
    .select({ whopUserId: engagements.whopUserId, workspaceId: engagements.workspaceId, stack: engagements.stack })
    .from(engagements)
    .where(eq(engagements.engagementId, engagementId))
    .limit(1);
  if (!tenant) return;
  const stack = (tenant.stack as EngagementStack | null) ?? ({} as EngagementStack);

  if (stack.win_back_auto_paused) {
    // Already paused — nothing new to alert on, but still worth sweeping
    // for any enrollment stranded "active" by an earlier interrupted or
    // partially-failed sweep (see fix 3 above).
    await sweepActiveEnrollments(engagementId, stack, tenant.whopUserId ?? null, tenant.workspaceId ?? null, stack.win_back_auto_paused_reason ?? "Win-Back is auto-paused.", false);
    return;
  }

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

  // Atomic compare-and-swap (fix 1 above): only an UPDATE whose WHERE
  // clause still matches — i.e. the flag is still unset in the row AS
  // POSTGRES SEES IT RIGHT NOW, not as this function read it moments ago
  // — actually flips it. A concurrent caller that loses this race gets
  // 0 rows back and returns without duplicating the sweep or the alert.
  const [claimed] = await db
    .update(engagements)
    .set({
      stack: sql`jsonb_set(jsonb_set(jsonb_set(coalesce(${engagements.stack}, '{}'::jsonb), '{win_back_auto_paused}', 'true'::jsonb), '{win_back_auto_paused_at}', to_jsonb(${new Date().toISOString()}::text)), '{win_back_auto_paused_reason}', to_jsonb(${reasonText}::text))`,
      updatedAt: new Date(),
    })
    .where(and(eq(engagements.engagementId, engagementId), sql`coalesce(${engagements.stack}->>'win_back_auto_paused', 'false') <> 'true'`))
    .returning({ id: engagements.engagementId });
  if (!claimed) return; // lost the race to a concurrent call — it's already being handled

  await sweepActiveEnrollments(engagementId, stack, tenant.whopUserId ?? null, tenant.workspaceId ?? null, reasonText, true);
}

/** The actual unenroll sweep, split out so both the pause-triggering call
 * and any later straggler-retry call (see fix 3 above) share one
 * implementation. Only marks an enrollment's DB status "auto_paused" for
 * ones that actually succeeded (or needed no ESP call), never masks a
 * failure (fix 2 above). */
async function sweepActiveEnrollments(
  engagementId: string,
  stack: EngagementStack,
  whopUserId: string | null,
  workspaceId: string | null,
  reasonText: string,
  notifyOnCompletion: boolean
): Promise<void> {
  const activeEnrollments = await db
    .select({ id: winBackEnrollments.id, prospectEmail: winBackEnrollments.prospectEmail })
    .from(winBackEnrollments)
    .where(and(eq(winBackEnrollments.engagementId, engagementId), eq(winBackEnrollments.status, "active")));
  if (activeEnrollments.length === 0) return;

  const succeededIds: string[] = [];
  let failedCount = 0;

  if (stack.email_platform && stack.email_platform !== "smtp") {
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
              recovery_automation_id: stack.recovery_automation_id,
              activecampaign_base_url: stack.activecampaign_base_url,
            },
            "auto_paused"
          );
          succeededIds.push(enrollment.id);
        } catch (espErr) {
          failedCount++;
          console.error(`[esp-delivery-monitor] ESP unenroll failed for enrollment ${enrollment.id} — left "active" for a later retry, not falsely marked stopped:`, espErr);
        }
      }
    } catch (credErr) {
      failedCount = activeEnrollments.length;
      console.error(`[esp-delivery-monitor] Couldn't resolve credential to unenroll active prospects for ${engagementId} — none marked stopped, will retry on the next call:`, credErr);
    }
  } else {
    // smtp — no ESP list to exit; the enrollment row's own status flip
    // below is what actually stops the durable send sequence.
    succeededIds.push(...activeEnrollments.map((e) => e.id));
  }

  if (succeededIds.length > 0) {
    await db
      .update(winBackEnrollments)
      .set({ status: "auto_paused", exitReason: "bounce_complaint_auto_pause", exitedAt: new Date() })
      .where(inArray(winBackEnrollments.id, succeededIds));
  }

  if (notifyOnCompletion && whopUserId) {
    const total = activeEnrollments.length;
    const failureNote = failedCount > 0 ? ` ${failedCount} of ${total} could NOT be confirmed unenrolled (ESP call failed) and remain active. A later event will retry them automatically, or unenroll manually if this persists.` : "";
    await notifyUser({
      whopUserId,
      engagementId,
      type: "win_back_delivery_auto_paused",
      severity: "critical",
      title: "Win-Back auto-paused: deliverability threshold crossed",
      body: `${reasonText} ${succeededIds.length} of ${total} active enrollment(s) were unenrolled from ${stack.email_platform}.${failureNote} New enrollments are on hold until you resume from the engagement's Win-Back panel.`,
      slackWebhookUrl: stack.slack_webhook_url,
      workspaceId: workspaceId ?? undefined,
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
  // Atomic, no prior read needed — Postgres's jsonb `-` key-removal
  // operator applied server-side against the row's current state, same
  // "don't read-then-write" reasoning as checkAndApplyAutoPause's own
  // compare-and-swap above (a concurrent auto-pause landing between a
  // read and a write here could otherwise get silently clobbered).
  await db
    .update(engagements)
    .set({
      stack: sql`coalesce(${engagements.stack}, '{}'::jsonb) - 'win_back_auto_paused' - 'win_back_auto_paused_at' - 'win_back_auto_paused_reason'`,
      updatedAt: new Date(),
    })
    .where(eq(engagements.engagementId, engagementId));
}
