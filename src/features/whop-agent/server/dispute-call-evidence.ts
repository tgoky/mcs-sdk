// src/features/whop-agent/server/dispute-call-evidence.ts
//
// Evidence for a Whop dispute from the buyer's calls (Showtime's records):
// that they booked, that reminders reached them, that they attended, and
// that a meeting bot recorded the call. Card networks weigh proof the
// service was delivered, and a sales or coaching call the buyer attended is
// exactly that. Only facts this app recorded are used; nothing is inferred.
//
// The buyer is found by the disputed payment's email (whop_payments,
// recorded from Whop's own payment and dispute events).

import { db } from "@/lib/db";
import { bookingRoster, briefOutcomeLog, conversationIntelligenceSessions, sequenceMessageLog, whopPayments } from "@/models/schema";
import { and, eq, inArray, or } from "drizzle-orm";
import { RECALL_NO_SHOW_SUB_CODES } from "@/lib/platforms/conversation-intelligence";
import { outcomeSourceLabel } from "@/lib/copy";

export interface CallEvidenceSources {
  bookings: { externalCallId: string; createdAt: Date; callTime: Date; status: string }[];
  outcomes: { bookingId: string; outcome: string; source: string | null; loggedAt: Date }[];
  recordings: { bookingId: string; status: string; subCode: string | null; completedAt: Date | null; extractionSummary: string | null }[];
  deliveredReminders: number;
}

export interface CallEvidence {
  /** One fact per line, dated, for the evidence log and the narrative. */
  lines: string[];
  /** The first attended call (YYYY-MM-DD): Whop's service_date. */
  serviceDate: string | null;
  attended: number;
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const when = (d: Date) => `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;

/** The latest outcome per booking wins: a no-show later corrected to showed counts as showed. */
function latestOutcomes(outcomes: CallEvidenceSources["outcomes"]): Map<string, CallEvidenceSources["outcomes"][number]> {
  const out = new Map<string, CallEvidenceSources["outcomes"][number]>();
  for (const o of [...outcomes].sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime())) out.set(o.bookingId, o);
  return out;
}

export function callEvidenceFrom(src: CallEvidenceSources): CallEvidence {
  const lines: string[] = [];
  const outcome = latestOutcomes(src.outcomes);
  const recordingsByBooking = new Map<string, CallEvidenceSources["recordings"]>();
  for (const r of src.recordings) recordingsByBooking.set(r.bookingId, [...(recordingsByBooking.get(r.bookingId) ?? []), r]);

  const attendedDates: Date[] = [];
  for (const b of [...src.bookings].sort((a, c) => a.callTime.getTime() - c.callTime.getTime())) {
    lines.push(`${day(b.createdAt)}: booked a call for ${when(b.callTime)}${b.status === "cancelled" ? " (later cancelled)" : ""}.`);
    const o = outcome.get(b.externalCallId);
    // A recording counts as attendance only when the call really had people in it.
    const recorded = (recordingsByBooking.get(b.externalCallId) ?? []).find((r) => r.completedAt && (r.status === "done" || r.status === "call_ended") && !(r.subCode && RECALL_NO_SHOW_SUB_CODES.has(r.subCode)));
    if (o?.outcome === "showed" || recorded) {
      attendedDates.push(b.callTime);
      if (o?.outcome === "showed") lines.push(`${day(b.callTime)}: attended the call (${outcomeSourceLabel(o.source, o.outcome) || "logged by the team"}).`);
      if (recorded) lines.push(`${day(recorded.completedAt!)}: the call was recorded by a meeting bot and ended ${when(recorded.completedAt!)}${recorded.extractionSummary ? `. Summary: ${recorded.extractionSummary.trim().slice(0, 400)}` : "."}`);
    } else if (o?.outcome === "no_show") {
      lines.push(`${day(b.callTime)}: did not attend this call.`);
    }
  }
  if (src.deliveredReminders > 0) lines.push(`${src.deliveredReminders} reminder ${src.deliveredReminders === 1 ? "message was" : "messages were"} delivered to the buyer, confirmed by the carrier or email provider.`);

  attendedDates.sort((a, b) => a.getTime() - b.getTime());
  return { lines, serviceDate: attendedDates[0] ? day(attendedDates[0]) : null, attended: attendedDates.length };
}

/** The buyer behind a disputed payment, then their calls. Null when the
 * payment has no email on file or no calls were recorded. */
export async function gatherCallEvidence(engagementId: string, paymentId: string | undefined, fallbackEmail?: string | null): Promise<CallEvidence | null> {
  let email = fallbackEmail?.trim().toLowerCase() || null;
  if (paymentId) {
    const [p] = await db.select({ email: whopPayments.email }).from(whopPayments).where(and(eq(whopPayments.engagementId, engagementId), eq(whopPayments.paymentId, paymentId))).limit(1);
    email = p?.email ?? email;
  }
  if (!email) return null;

  const bookings = await db
    .select({ externalCallId: bookingRoster.externalCallId, createdAt: bookingRoster.createdAt, callTime: bookingRoster.callTime, status: bookingRoster.status })
    .from(bookingRoster)
    .where(and(eq(bookingRoster.engagementId, engagementId), eq(bookingRoster.prospectEmail, email)));
  if (bookings.length === 0) return null;
  const ids = bookings.map((b) => b.externalCallId);

  const [outcomes, recordings, reminders] = await Promise.all([
    db.select({ bookingId: briefOutcomeLog.bookingId, outcome: briefOutcomeLog.outcome, source: briefOutcomeLog.source, loggedAt: briefOutcomeLog.loggedAt }).from(briefOutcomeLog).where(and(eq(briefOutcomeLog.engagementId, engagementId), inArray(briefOutcomeLog.bookingId, ids))),
    db
      .select({ bookingId: conversationIntelligenceSessions.bookingId, status: conversationIntelligenceSessions.status, subCode: conversationIntelligenceSessions.subCode, completedAt: conversationIntelligenceSessions.completedAt, extractionSummary: conversationIntelligenceSessions.extractionSummary })
      .from(conversationIntelligenceSessions)
      .where(and(eq(conversationIntelligenceSessions.engagementId, engagementId), inArray(conversationIntelligenceSessions.bookingId, ids))),
    db
      .select({ id: sequenceMessageLog.id })
      .from(sequenceMessageLog)
      .where(and(eq(sequenceMessageLog.engagementId, engagementId), eq(sequenceMessageLog.deliveryStatus, "delivered"), or(eq(sequenceMessageLog.prospectEmail, email), inArray(sequenceMessageLog.bookingId, ids)))),
  ]);

  const evidence = callEvidenceFrom({ bookings, outcomes, recordings, deliveredReminders: reminders.length });
  return evidence.lines.length ? evidence : null;
}
