// src/lib/booking-roster.ts
//
// Writes the ground-truth `booking_roster` row the moment a booking webhook
// arrives — see the module comment on bookingRoster in models/schema.ts for
// why this table exists (the black-box problem: briefedCallsLog only gets a
// row at brief-send time, so nothing showed a booking existed until the
// night before the call).
//
// Deliberately independent of handleInboundBookingEvent
// (features/pile-on/server/enrollment-service.ts): that function's own
// enrollment side effects (ESP enrollment, SMS, hybrid personalization) are
// gated on Pile-On/Win-Back being enabled for the engagement. Whether a
// booking happened is a fact independent of what automations react to it —
// an operator with Pile-On off but Pre-Call Read on should still see the
// booking on the roster. So this is called unconditionally, before any
// skill-enabled check, and its own failures are caught and logged rather
// than thrown — a roster-write hiccup must never block the real enrollment
// path this runs alongside.
//
// Field extraction below intentionally mirrors the confirmed patterns
// already used in enrollment-service.ts (prospectEmail/prospectName/
// prospectPhone/bookingId/callTime) rather than importing them, since that
// function's extraction is inlined and not exported — kept in sync by
// comment reference. meetingUrl/callEndTime are NOT extracted from the raw
// webhook payload: unlike the REST-API responses booking.ts polls (where
// those fields are confirmed against real API docs/responses per platform),
// the raw webhook payload's field names for these aren't independently
// confirmed here, and this codebase's standard is "undefined, not guessed."
// They stay null until a caller populates them from a confirmed source.

import { db } from "@/lib/db";
import { bookingRoster } from "@/models/schema";
import { and, eq, sql } from "drizzle-orm";
import { deriveProspectName } from "@/lib/prospect-identity";

export interface RosterUpsertResult {
  wrote: boolean;
  reason?: string;
}

function extractBookingId(payload: any): string {
  return (
    payload._bookingId ??
    payload.payload?.uri?.split("/").pop() ??
    payload.uid ??
    payload.id ??
    null
  );
}

function extractCallTime(payload: any): Date | null {
  const raw =
    payload.call_time ??
    payload.payload?.start_time ??
    payload.payload?.scheduled_time ??
    null;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Upserts one booking_roster row for this webhook event. Returns
 * { wrote: false, reason } rather than throwing on any non-fatal condition
 * (no resolvable booking id, no resolvable call time on a "created" event)
 * — the caller logs this as a soft skip, never fails the run over it.
 */
export async function upsertBookingRoster(
  payload: any,
  engagementId: string,
  eventKind: "created" | "cancelled" | "unknown",
  bookingPlatform: string | undefined
): Promise<RosterUpsertResult> {
  const externalCallId = extractBookingId(payload);
  if (!externalCallId) {
    return { wrote: false, reason: "No resolvable booking id on payload" };
  }

  if (eventKind === "cancelled") {
    // Cancellation: flip status on the existing row if we have one. If we
    // somehow never saw the "created" event for this booking (e.g. it was
    // booked before this table existed), there's nothing to update — do
    // NOT insert a bare cancelled row with a guessed call time, since we
    // have no reliable callTime source on a cancellation payload for every
    // platform. That's an acceptable gap: a call this table never knew
    // about being cancelled is a no-op either way from the roster's
    // perspective.
    const result = await db
      .update(bookingRoster)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(and(eq(bookingRoster.engagementId, engagementId), eq(bookingRoster.externalCallId, externalCallId)))
      .returning({ id: bookingRoster.id });
    return result.length > 0
      ? { wrote: true }
      : { wrote: false, reason: "Cancelled booking had no existing roster row to update" };
  }

  if (eventKind !== "created") {
    return { wrote: false, reason: `Unclassified event kind (${eventKind}) — not written to roster` };
  }

  const callTime = extractCallTime(payload);
  if (!callTime) {
    return { wrote: false, reason: "No resolvable call time on payload" };
  }

  const prospectEmail: string =
    payload.data?.attributes?.email ?? payload.email ?? payload.prospect_email ?? payload.payload?.email ?? "";
  // Fix: used to fall back to the literal string "Prospect" when the
  // payload had no name field, which then got stored as this row's real
  // prospectName and rendered verbatim across the roster/calendar UI as
  // if it were an actual name — see deriveProspectName's doc. Falls back
  // to an email-derived display name now, and only to null (not a fake
  // placeholder) when there's no email either; every UI reading this
  // column already has its own "Unnamed Prospect" fallback for that case.
  const prospectName: string | null =
    payload.data?.attributes?.first_name ??
    payload.name ??
    payload.prospect_name ??
    payload.payload?.name ??
    deriveProspectName(null, prospectEmail);
  const prospectPhone: string | undefined =
    payload.phone ??
    payload.prospect_phone ??
    payload.data?.attributes?.phone ??
    payload.payload?.text_reminder_number ??
    payload.responses?.attendeePhoneNumber ??
    payload.contact?.phone ??
    payload.customer?.phone ??
    undefined;

  // Upsert on the (engagementId, externalCallId) unique index — a redelivery
  // or a reschedule that keeps the same platform event id updates the
  // existing row (fresh callTime, back to "scheduled") instead of erroring
  // or duplicating.
  await db
    .insert(bookingRoster)
    .values({
      engagementId,
      externalCallId,
      prospectName,
      prospectEmail: prospectEmail || null,
      prospectPhone: prospectPhone ?? null,
      callTime,
      bookingPlatform: bookingPlatform ?? null,
      status: "scheduled",
    })
    .onConflictDoUpdate({
      target: [bookingRoster.engagementId, bookingRoster.externalCallId],
      set: {
        prospectName,
        prospectEmail: prospectEmail || null,
        prospectPhone: prospectPhone ?? null,
        callTime,
        bookingPlatform: bookingPlatform ?? null,
        status: "scheduled",
        updatedAt: new Date(),
      },
    });

  return { wrote: true };
}
