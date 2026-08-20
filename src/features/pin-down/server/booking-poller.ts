import { db } from "@/lib/db";
import { engagements, webhookEvents, type EngagementStack } from "@/models/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { resolveCredential } from "@/lib/credentials";
import { listBookingsSinceForTenant, deriveWebhookIdempotencyKey } from "@/lib/platforms/booking";
import { handleInboundBookingEvent, classifyBookingEvent } from "@/features/pile-on/server/enrollment-service";
import { upsertBookingRoster } from "@/lib/booking-roster";
import { startRun, failRun, logStep } from "@/lib/run-log";
import { isEngagementPaused } from "@/lib/engagement-status";
import { isSkillEnabledForEngagement } from "@/lib/engagement-skills";
import crypto from "crypto";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

/**
 * Pin-Down recovery gap 5 — polling fallback for booking webhooks.
 *
 * The OG SKILL.md installed a Claude scheduled task with a 5-minute
 * default interval whenever a buyer's booking platform didn't support
 * webhook subscriptions: "call 'list bookings since timestamp' on the
 * booking API, write new bookings to
 * engagement-folder/incoming_bookings/<timestamp>.md, and update
 * webhook_receiver.last_polled_at." UTP dropped this outright — engagements
 * on OnceHub (which has never supported programmatic webhook registration;
 * see registerWebhookForTenant in booking.ts) simply never got processed
 * automaticallyx.
 *
 * This module is the recovery: instead of writing to a markdown file, a
 * synthetic booking-event payload is fed through the exact same
 * handleInboundBookingEvent() pipeline the live webhook route uses, so
 * Pile-On/Win-Back enrollment logic doesn't fork into two implementations.
 * Idempotency uses the same webhook_events table as the live webhook path
 * (Pin-Down recovery gap 8) — a booking seen once via polling and later
 * confirmed by a (possibly recovered) webhook subscription can never
 * double-enroll, because they collide on the same derived key.
 */

/**
 * Fast, DB-only prep — mirrors the split used by lostDealSweepCron /
 * weeklyMetricsCron: this step finds every engagement whose
 * webhook_receiver_mode is "polling" and is due for its next poll cycle
 * based on webhook_poll_interval_minutes, with no network calls. The
 * actual platform API calls happen one engagement at a time in
 * pollBookingsForEngagement, fanned out via bookingPollEngagement events.
 */
export async function findEngagementsDueForPoll(): Promise<string[]> {
  const rows = await db
    .select({ engagementId: engagements.engagementId, stack: engagements.stack, pausedAt: engagements.pausedAt })
    .from(engagements)
    .where(
      and(
        sql`${engagements.stack}->>'webhook_receiver_mode' = 'polling'`,
        // Without this, an offboarded/soft-deleted engagement whose stack
        // still says "polling" gets polled forever — pausedAt (checked
        // per-row below via isEngagementPaused) doesn't cover deletedAt.
        isNull(engagements.deletedAt)
      )
    );

  const now = Date.now();
  const due: string[] = [];

  for (const row of rows) {
    if (isEngagementPaused(row)) continue;

    const stack = row.stack as EngagementStack | null;
    if (!stack?.booking_platform_credentials_ref) continue;

    const intervalMs = (stack.webhook_poll_interval_minutes ?? 5) * 60_000;
    const lastPolledAt = stack.webhook_receiver_last_polled_at
      ? new Date(stack.webhook_receiver_last_polled_at).getTime()
      : 0;

    if (now - lastPolledAt >= intervalMs) {
      due.push(row.engagementId);
    }
  }

  return due;
}

/**
 * Per-engagement poll cycle: the slow part (one or more platform API
 * calls) that findEngagementsDueForPoll's cheap DB scan fans out to. Runs
 * inside its own Inngest invocation (see processBookingPollEngagement in
 * src/inngest/crons.ts) so one tenant's slow/failing booking API can't
 * block or retry-storm every other tenant's poll cycle.
 */
export async function pollBookingsForEngagement(engagementId: string, step?: StepTools): Promise<{
  polled: number;
  newBookings: number;
  duplicates: number;
  errors: number;
}> {
  const [tenant] = await db
    .select()
    .from(engagements)
    .where(eq(engagements.engagementId, engagementId))
    .limit(1);

  if (!tenant) {
    return { polled: 0, newBookings: 0, duplicates: 0, errors: 0 };
  }

  const stack = tenant.stack as EngagementStack | null;
  if (!stack?.booking_platform || stack.webhook_receiver_mode !== "polling") {
    return { polled: 0, newBookings: 0, duplicates: 0, errors: 0 };
  }

  const now = new Date();
  // First poll for a tenant that just switched into polling mode: look
  // back one interval rather than from epoch zero, so it doesn't try to
  // ingest the buyer's entire historical booking log on the first cycle.
  const sinceISO =
    stack.webhook_receiver_last_polled_at ??
    new Date(now.getTime() - (stack.webhook_poll_interval_minutes ?? 5) * 60_000).toISOString();

  let calls: Awaited<ReturnType<typeof listBookingsSinceForTenant>> = [];
  let errors = 0;

  try {
    const apiKey = await resolveCredential(engagementId, stack.booking_platform);
    calls = await listBookingsSinceForTenant(stack.booking_platform, apiKey, stack.booking_platform_meta, sinceISO);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error(`[booking-poller] Poll failed for engagement ${engagementId}: ${message}`);
    errors = 1;
    // Bug fix (2026-08-20): this used to only console.error, which nobody
    // running the app ever sees. webhook_last_error is the exact field
    // computeBookingSyncStatus() already reads to render the Booking Sync
    // health card — it was just never written from this path, only from
    // the live webhook route. A bad credential, an expired token, or a
    // misconfigured location_id could (and did) fail silently forever
    // while the UI kept reporting "Auto-polling · healthy". Writing it
    // here means a broken poll now surfaces exactly where a broken
    // webhook already does, instead of only in a server log nobody reads.
    await db
      .update(engagements)
      .set({
        stack: {
          ...stack,
          webhook_last_error: `Poll failed at ${now.toISOString()} — ${message}`,
        },
        updatedAt: now,
      })
      .where(eq(engagements.engagementId, engagementId))
      .catch((dbErr: unknown) => {
        console.error(`[booking-poller] Failed to persist poll error for ${engagementId}:`, dbErr);
      });
    // Don't advance the watermark on a failed poll — the next cycle will
    // retry the same window rather than silently skipping it.
    return { polled: 0, newBookings: 0, duplicates: 0, errors };
  }

  let newBookings = 0;
  let duplicates = 0;

  for (const call of calls) {
    const eventKind = call.eventKind ?? "created";
    // Synthetic payload shaped so classifyBookingEvent() and
    // handleInboundBookingEvent()'s field-normalization fallbacks
    // (payload.email / payload.name / payload.event) pick it up exactly
    // like a real webhook delivery, without a second parallel
    // implementation of the enrollment logic.
    const syntheticPayload = {
      event: eventKind === "cancelled" ? "booking.cancelled" : "booking.created",
      email: call.email,
      name: call.name,
      prospect_email: call.email,
      prospect_name: call.name,
      // Roster coverage (src/lib/booking-roster.ts) — the polled call already
      // carries a real callTime/phone from NormalizedCall; surfaced here
      // under the same `call_time` key the live webhook path's synthetic
      // extraction looks for, so polling-mode engagements get the same
      // roster write as webhook-mode ones instead of a silent gap.
      call_time: call.callTime.toISOString(),
      phone: call.phone,
      _source: "poll",
      _bookingId: call.id,
    };

    let idempotencyKey: string | null = null;

    if (stack.booking_platform === "calendly") {
      // Calendly poller only has the Event UUID, not the Invitee URI used by 
      // live webhooks. Namespace with "poll:" to guarantee created/cancelled 
      // don't collide with each other, and cleanly separate from live webhooks.
      idempotencyKey = `poll:calendly:${call.id}:${eventKind}`;
    } else {
      // Cal.com, GHL, and OnceHub use IDs that perfectly match their live webhook paths
      idempotencyKey = deriveWebhookIdempotencyKey(stack.booking_platform, {
        id: call.id,
        payload: {
          uid: call.id,
        },
        appointment: { id: call.id },
        calendar: { id: call.id },
        data: { id: call.id },
        booking: { id: call.id },
        triggerEvent: eventKind === "cancelled" ? "BOOKING_CANCELLED" : "BOOKING_CREATED",
        type: eventKind === "cancelled" ? "AppointmentDelete" : "AppointmentCreate",
        event: eventKind === "cancelled" ? "booking.cancelled" : "booking.created",
        trigger: eventKind === "cancelled" ? "cancelled" : "created",
      });
    }

    // Final fallback
    idempotencyKey ??= `poll:${stack.booking_platform}:${call.id}:${eventKind}`;

    try {
      await db.insert(webhookEvents).values({
        engagementId,
        eventSource: stack.booking_platform, // same source key as the live webhook path — a booking seen by both collides correctly
        idempotencyKey,
        eventKind,
      });
    } catch {
      duplicates++;
      continue; // already processed, either by a prior poll or a live webhook
    }

    const skillId = eventKind === "cancelled" ? "win-back" : "pile-on";

    // Roster write — unconditional, ahead of the skill-enabled check below,
    // fail-soft. "A booking happened" is ground truth for the calendar
    // regardless of which automation reacts to it, and it no longer needs
    // a run to attach its log line to (see the ghost-run fix below).
    const rosterResult = await upsertBookingRoster(syntheticPayload, engagementId, eventKind, stack.booking_platform).catch(
      (e: unknown) => ({ wrote: false, reason: e instanceof Error ? e.message : String(e) })
    );

    // Ghost-run fix: this check used to happen AFTER startRun, so a
    // disabled skill still got a visible run created for it that then
    // revealed itself as skipped when opened — hide-and-seek. Checking
    // first means a disabled skill never creates a run at all.
    if (!(await isSkillEnabledForEngagement(engagementId, skillId))) {
      continue;
    }

    const runId = crypto.randomUUID();
    try {
      await startRun({
        id: runId,
        engagementId,
        skillName: skillId,
        phase: "webhook_received",
        label: `${call.name} <${call.email}>`,
      });
      await logStep(runId, {
        phase: "booking_roster",
        status: rosterResult.wrote ? "success" : "skipped",
        detail: rosterResult.wrote ? "Roster updated" : (rosterResult.reason ?? "Not written"),
      });

      const classified = classifyBookingEvent(syntheticPayload);
      await handleInboundBookingEvent(syntheticPayload, tenant, runId, classified === "unknown" ? eventKind : classified, step);
      newBookings++;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      console.error(`[booking-poller] Enrollment failed for polled booking ${call.id}: ${message}`);
      await failRun(runId, e).catch(() => {});
      errors++;
    }
  }

  // Advance the watermark even when calls is empty — the whole point is
  // "since the last successful poll", not "since the last booking found".
  // Also clears any stale webhook_last_error from a prior failed cycle —
  // reaching this line means the platform API call above succeeded, so a
  // credential/config error that was previously surfaced in the Booking
  // Sync status card no longer applies and shouldn't linger.
  await db
    .update(engagements)
    .set({
      stack: { ...stack, webhook_receiver_last_polled_at: now.toISOString(), webhook_last_error: undefined },
      updatedAt: now,
    })
    .where(eq(engagements.engagementId, engagementId));

  return { polled: calls.length, newBookings, duplicates, errors };
}