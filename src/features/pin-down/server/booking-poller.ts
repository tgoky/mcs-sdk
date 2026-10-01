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
import { stackPatchSql } from "@/lib/engagement-stack";

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

    const intervalMs = (stack.webhook_poll_interval_minutes ?? 25) * 60_000;
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
/**
 * The run id for one polled booking event, the same on every invocation.
 * Inngest re-runs this function from the top after a step fails or the
 * request runs out of time; a fresh random id would give every step of the
 * booking's handling a new name, so none of its finished steps would be
 * reused.
 */
export function pollRunId(engagementId: string, idempotencyKey: string): string {
  const h = crypto.createHash("sha256").update(`booking-poll-run:${engagementId}:${idempotencyKey}`).digest("hex");
  // Shaped as a version-5 UUID, which skill_runs.id requires.
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

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
  const platform = stack.booking_platform;

  // Inngest re-runs this function from the top whenever a step fails or
  // the request hits its time limit. Everything that must give the same
  // answer on a re-run (the poll time, the bookings fetched, which of them
  // this run claimed, each booking's run) is a step, so a re-run resumes
  // where it stopped instead of seeing its own claims as duplicates.
  const once = step
    ? <T,>(id: string, fn: () => Promise<T>) => step.run(id, fn) as Promise<T>
    : <T,>(_id: string, fn: () => Promise<T>) => fn();

  const fetched = await once("list-polled-bookings", async () => {
    const now = new Date();
    // First poll for a tenant that just switched into polling mode: look
    // back one interval rather than from epoch zero, so it doesn't try to
    // ingest the buyer's entire historical booking log on the first cycle.
    const sinceISO =
      stack.webhook_receiver_last_polled_at ??
      new Date(now.getTime() - (stack.webhook_poll_interval_minutes ?? 25) * 60_000).toISOString();
    try {
      const apiKey = await resolveCredential(engagementId, platform);
      const listed = await listBookingsSinceForTenant(platform, apiKey, stack.booking_platform_meta, sinceISO);
      // Only what the handling below reads: step results are stored, and a
      // long outage can make this window large.
      const calls = listed.map((c) => ({ id: c.id, email: c.email, name: c.name, phone: c.phone, eventKind: c.eventKind, callTime: c.callTime.toISOString() }));
      return { ok: true as const, nowIso: now.toISOString(), sinceISO, calls };
    } catch (e: unknown) {
      return { ok: false as const, nowIso: now.toISOString(), message: e instanceof Error ? e.message : "Unknown error" };
    }
  });
  const now = new Date(fetched.nowIso);

  if (!fetched.ok) {
    const message = fetched.message;
    console.error(`[booking-poller] Poll failed for engagement ${engagementId}: ${message}`);
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
        stack: stackPatchSql({ webhook_last_error: `Poll failed at ${now.toISOString()}: ${message}` }),
        updatedAt: now,
      })
      .where(eq(engagements.engagementId, engagementId))
      .catch((dbErr: unknown) => {
        console.error(`[booking-poller] Failed to persist poll error for ${engagementId}:`, dbErr);
      });
    // Don't advance the watermark on a failed poll — the next cycle will
    // retry the same window rather than silently skipping it.
    return { polled: 0, newBookings: 0, duplicates: 0, errors: 1 };
  }

  const calls = fetched.calls;
  const seenKeys = new Set<string>();
  const events = calls.map((call) => {
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
      call_time: call.callTime,
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
      idempotencyKey = deriveWebhookIdempotencyKey(platform, {
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
    return { call, eventKind, syntheticPayload, idempotencyKey };
  }).filter((e) => {
    // A listing can return one booking twice (overlapping pages); handle it once.
    if (seenKeys.has(e.idempotencyKey)) return false;
    seenKeys.add(e.idempotencyKey);
    return true;
  });

  // One claim for the whole poll. A booking already claimed, by an earlier
  // poll or by the live webhook (same source key, so a booking seen by
  // both collides correctly), comes back unclaimed. A database error
  // fails the step, so it's retried instead of read as "duplicate".
  const claimedKeys = new Set(
    await once("claim-polled-bookings", async () => {
      if (events.length === 0) return [] as string[];
      const rows = await db
        .insert(webhookEvents)
        .values(events.map((e) => ({ engagementId, eventSource: platform, idempotencyKey: e.idempotencyKey, eventKind: e.eventKind })))
        .onConflictDoNothing({ target: [webhookEvents.eventSource, webhookEvents.idempotencyKey] })
        .returning({ idempotencyKey: webhookEvents.idempotencyKey });
      return rows.map((r) => r.idempotencyKey);
    })
  );

  let newBookings = 0;
  let errors = 0;
  let released = 0;
  const duplicates = calls.length - events.filter((e) => claimedKeys.has(e.idempotencyKey)).length;

  for (const { call, eventKind, syntheticPayload, idempotencyKey } of events) {
    if (!claimedKeys.has(idempotencyKey)) continue; // already processed, either by a prior poll or a live webhook

    const skillId = eventKind === "cancelled" ? "win-back" : "pile-on";
    const runId = pollRunId(engagementId, idempotencyKey);

    let prepared: { enabled: boolean };
    try {
      prepared = await once(`prepare-polled-booking-${runId}`, async () => {
        // Roster write — unconditional, ahead of the skill-enabled check below,
        // fail-soft. "A booking happened" is ground truth for the calendar
        // regardless of which automation reacts to it, and it no longer needs
        // a run to attach its log line to (see the ghost-run fix below).
        const rosterResult = await upsertBookingRoster(syntheticPayload, engagementId, eventKind, platform).catch(
          (e: unknown) => ({ wrote: false, reason: e instanceof Error ? e.message : String(e) })
        );

        // Ghost-run fix: this check used to happen AFTER startRun, so a
        // disabled skill still got a visible run created for it that then
        // revealed itself as skipped when opened — hide-and-seek. Checking
        // first means a disabled skill never creates a run at all.
        if (!(await isSkillEnabledForEngagement(engagementId, skillId))) return { enabled: false };

        await startRun({
          id: runId,
          engagementId,
          skillName: skillId,
          phase: "webhook_received",
          label: `${call.name} <${call.email}>`,
        });
        // A log line only: it mustn't fail the step after the run exists.
        await logStep(runId, {
          phase: "booking_roster",
          status: rosterResult.wrote ? "success" : "skipped",
          detail: rosterResult.wrote ? "Roster updated" : (rosterResult.reason ?? "Not written"),
        }).catch(() => {});
        return { enabled: true };
      });
    } catch (e: unknown) {
      // Its run wasn't created (that's the step's last fallible write), so
      // nothing for this booking has gone out: give the claim back so the
      // next poll picks it up, instead of leaving it claimed and unhandled.
      console.error(`[booking-poller] Couldn't start polled booking ${call.id}:`, e);
      errors++;
      try {
        await once(`release-polled-booking-${runId}`, async () => {
          await db.delete(webhookEvents).where(and(eq(webhookEvents.eventSource, platform), eq(webhookEvents.idempotencyKey, idempotencyKey)));
        });
        released++;
      } catch (releaseErr: unknown) {
        // Still claimed: the next poll will skip it. Keep going with the
        // rest of this poll's bookings rather than abandoning them too.
        console.error(`[booking-poller] Couldn't give back polled booking ${call.id}:`, releaseErr);
      }
      continue;
    }
    if (!prepared.enabled) continue;

    try {
      const classified = classifyBookingEvent(syntheticPayload);
      await handleInboundBookingEvent(syntheticPayload, tenant, runId, classified === "unknown" ? eventKind : classified, step);
      newBookings++;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      console.error(`[booking-poller] Enrollment failed for polled booking ${call.id}: ${message}`);
      // Once: a failed step comes back on every later re-run, and each
      // failRun alerts the client.
      await once(`fail-polled-run-${runId}`, () => failRun(runId, e));
      errors++;
    }
  }

  // A booking given back above is only picked up again if the next poll
  // lists it, so the window starts where this one did (the bookings
  // already handled come back as duplicates). Not past a day, though: a
  // booking that can never be started would otherwise hold it forever.
  const heldSince = Date.parse(fetched.sinceISO);
  if (released > 0 && now.getTime() - heldSince < 24 * 60 * 60_000) {
    await db
      .update(engagements)
      .set({
        stack: stackPatchSql({
          webhook_receiver_last_polled_at: fetched.sinceISO,
          webhook_last_error: `Poll at ${now.toISOString()}: ${released} booking(s) couldn't be started and will be retried on the next poll.`,
        }),
        updatedAt: now,
      })
      .where(eq(engagements.engagementId, engagementId));
    return { polled: calls.length, newBookings, duplicates, errors };
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
      stack: stackPatchSql({
        webhook_receiver_last_polled_at: now.toISOString(),
        webhook_last_error: released > 0 ? `Poll at ${now.toISOString()}: gave up on ${released} booking(s) that couldn't be started for a day.` : undefined,
      }),
      updatedAt: now,
    })
    .where(eq(engagements.engagementId, engagementId));

  return { polled: calls.length, newBookings, duplicates, errors };
}