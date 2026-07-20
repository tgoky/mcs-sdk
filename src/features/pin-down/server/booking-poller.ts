import { db } from "@/lib/db";
import { engagements, webhookEvents, type EngagementStack } from "@/models/schema";
import { eq, sql } from "drizzle-orm";
import { resolveCredential } from "@/lib/credentials";
import { listBookingsSinceForTenant, deriveWebhookIdempotencyKey } from "@/lib/platforms/booking";
import { handleInboundBookingEvent, classifyBookingEvent } from "@/features/pile-on/server/enrollment-service";
import { startRun, failRun } from "@/lib/run-log";
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
 * automatically.
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
    .select({ engagementId: engagements.engagementId, stack: engagements.stack })
    .from(engagements)
    .where(sql`${engagements.stack}->>'webhook_receiver_mode' = 'polling'`);

  const now = Date.now();
  const due: string[] = [];

  for (const row of rows) {
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
  } catch (e: any) {
    console.error(`[booking-poller] Poll failed for engagement ${engagementId}: ${e.message}`);
    errors = 1;
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

    const runId = crypto.randomUUID();
    try {
      await startRun({
        id: runId,
        engagementId,
        skillName: eventKind === "cancelled" ? "win-back" : "pile-on",
        phase: "webhook_received",
        label: `${call.name} <${call.email}> (polled)`,
      });
      const classified = classifyBookingEvent(syntheticPayload);
      await handleInboundBookingEvent(syntheticPayload, tenant, runId, classified === "unknown" ? eventKind : classified, step);
      newBookings++;
    } catch (e: any) {
      console.error(`[booking-poller] Enrollment failed for polled booking ${call.id}: ${e.message}`);
      await failRun(runId, e).catch(() => {});
      errors++;
    }
  }

  // Advance the watermark even when calls is empty — the whole point is
  // "since the last successful poll", not "since the last booking found".
  await db
    .update(engagements)
    .set({
      stack: { ...stack, webhook_receiver_last_polled_at: now.toISOString() },
      updatedAt: now,
    })
    .where(eq(engagements.engagementId, engagementId));

  return { polled: calls.length, newBookings, duplicates, errors };
}