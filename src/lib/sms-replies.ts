// src/lib/sms-replies.ts
//
// Texts prospects send back to a client's number. Before this, a reply
// to a reminder ("can we move to 3pm?") reached Twilio and went nowhere.
//
// Each reply is:
//   1. matched to the person: the client's bookings by phone, then the
//      sequences that texted that number;
//   2. sorted: carrier opt-out and opt-in words by rule (these carry legal
//      weight, so no model decides them), everything else by Jev picking
//      from a fixed list;
//   3. acted on: STOP stops every sequence texting that number, START lets
//      them resume, a reply to a Booking Recovery text ends that recovery
//      (they answered, a person takes it from here), and anything a person
//      should answer goes to the Queue.

import { db } from "@/lib/db";
import { bookingRoster, sequenceMessageLog, smsOptOuts, smsReplies } from "@/models/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { askJev } from "@/lib/jev";

export const SMS_REPLY_INTENTS = ["stop", "start", "confirm", "reschedule", "cancel", "question", "other"] as const;
export type SmsReplyIntent = (typeof SMS_REPLY_INTENTS)[number];

/** Last 10 digits: the same person whether written "+1 (555) 123-4567"
 * or "5551234567". Null when there aren't enough digits to be a number. */
export function phoneKey(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

// Twilio's default opt-out and opt-in keywords (Advanced Opt-Out). Twilio
// itself blocks further texts to a number that sent one of the opt-out
// words; this app honours the same words so its sequences stop trying.
const OPT_OUT_WORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "optout", "revoke"]);
const OPT_IN_WORDS = new Set(["start", "unstop", "yes"]);

export interface KeywordResult {
  intent: SmsReplyIntent;
  /** "cancel" on its own opts out at the carrier, but the person may have
   * meant "cancel my call": a human should look. */
  ambiguousCancel: boolean;
}

/** Only a message that is exactly one of the words counts, as carriers
 * treat it ("stop by at 3?" is not an opt-out). "yes" only opts back in
 * when the number had opted out; otherwise it's a confirmation. */
export function classifyByKeyword(body: string, currentlyOptedOut: boolean): KeywordResult | null {
  const word = body.trim().toLowerCase().replace(/[.!\s]+$/g, "");
  if (OPT_OUT_WORDS.has(word)) return { intent: "stop", ambiguousCancel: word === "cancel" };
  if (OPT_IN_WORDS.has(word)) {
    if (word === "yes" && !currentlyOptedOut) return { intent: "confirm", ambiguousCancel: false };
    return { intent: "start", ambiguousCancel: false };
  }
  return null;
}

const JEV_OPTIONS: Record<Exclude<SmsReplyIntent, "stop" | "start">, string> = {
  confirm: "They confirm they'll be there, or just acknowledge (\"see you then\", \"got it\", a thumbs up).",
  reschedule: "They want a different day or time, say they can't make it at the booked time, or ask to move the call.",
  cancel: "They want to cancel the call or say they're no longer interested.",
  question: "They ask something (about the call, the link, the price, who they're meeting) and expect an answer.",
  other: "Anything else, or it's unclear what they want.",
};

/** Below this, the reply goes to a person as "other" rather than being
 * acted on as a guess. */
export const MIN_JEV_CONFIDENCE = 60;

export interface Classified {
  intent: SmsReplyIntent;
  confidence: number | null;
  classifiedBy: "keyword" | "jev" | "fallback";
  ambiguousCancel: boolean;
}

export async function classifySmsReply(
  body: string,
  context: { engagementId: string; currentlyOptedOut: boolean; callTime?: string | null; prospectName?: string | null }
): Promise<Classified> {
  const keyword = classifyByKeyword(body, context.currentlyOptedOut);
  if (keyword) return { ...keyword, confidence: 100, classifiedBy: "keyword" };
  try {
    const result = await askJev({
      state: {
        reply: body.slice(0, 1000),
        context: "A prospect's text reply to a reminder about a booked sales call.",
        bookedCallTime: context.callTime ?? undefined,
        prospectName: context.prospectName ?? undefined,
      },
      questions: {
        intent: { type: "choice", instructions: "What does the person want, going by this text?", criteria: JEV_OPTIONS },
      },
      reading: { engagementId: context.engagementId, purpose: "sms-reply" },
    });
    const answer = result.answers.intent;
    if (answer?.type === "choice" && answer.choice in JEV_OPTIONS) {
      const confidence = Math.round(answer.confidence * 100);
      const intent = confidence >= MIN_JEV_CONFIDENCE ? (answer.choice as SmsReplyIntent) : "other";
      return { intent, confidence, classifiedBy: "jev", ambiguousCancel: false };
    }
  } catch (err) {
    console.warn(`[sms-replies] sorting a reply failed for ${context.engagementId}:`, err instanceof Error ? err.message : err);
  }
  // Can't tell: a person reads it.
  return { intent: "other", confidence: null, classifiedBy: "fallback", ambiguousCancel: false };
}

/** A person should answer everything except an acknowledgement and a
 * clean opt-in; an opt-out goes too when "cancel" might have meant the
 * call rather than the texts. */
export function needsPerson(c: Pick<Classified, "intent" | "ambiguousCancel">): boolean {
  if (c.intent === "stop") return c.ambiguousCancel;
  return c.intent !== "confirm" && c.intent !== "start";
}

// ── Who sent it ──────────────────────────────────────────────────────────

export interface MatchedProspect {
  prospectEmail: string | null;
  prospectName: string | null;
  bookingId: string | null;
  callTime: string | null;
}

/** The booking that phone number belongs to: the next upcoming call, else
 * the most recent one; failing that, the latest sequence that texted it. */
export function pickBooking<T extends { callTime: Date; phone: string | null }>(rows: T[], key: string, now: Date): T | null {
  const theirs = rows.filter((r) => phoneKey(r.phone) === key);
  const upcoming = theirs.filter((r) => r.callTime >= now).sort((a, b) => a.callTime.getTime() - b.callTime.getTime());
  if (upcoming.length) return upcoming[0];
  return theirs.sort((a, b) => b.callTime.getTime() - a.callTime.getTime())[0] ?? null;
}

export async function matchProspect(engagementId: string, fromPhone: string, now = new Date()): Promise<MatchedProspect> {
  const key = phoneKey(fromPhone);
  const empty = { prospectEmail: null, prospectName: null, bookingId: null, callTime: null };
  if (!key) return empty;
  const bookings = await db
    .select({ bookingId: bookingRoster.externalCallId, email: bookingRoster.prospectEmail, name: bookingRoster.prospectName, phone: bookingRoster.prospectPhone, callTime: bookingRoster.callTime })
    .from(bookingRoster)
    .where(eq(bookingRoster.engagementId, engagementId))
    .orderBy(desc(bookingRoster.callTime))
    .limit(1000);
  const booking = pickBooking(bookings, key, now);
  if (booking) return { prospectEmail: booking.email, prospectName: booking.name, bookingId: booking.bookingId, callTime: booking.callTime.toISOString() };

  const sent = await db
    .select({ email: sequenceMessageLog.prospectEmail, phone: sequenceMessageLog.prospectPhone, bookingId: sequenceMessageLog.bookingId })
    .from(sequenceMessageLog)
    .where(and(eq(sequenceMessageLog.engagementId, engagementId), eq(sequenceMessageLog.channel, "sms")))
    .orderBy(desc(sequenceMessageLog.sentAt))
    .limit(1000);
  const last = sent.find((r) => phoneKey(r.phone) === key);
  return last ? { prospectEmail: last.email, prospectName: null, bookingId: last.bookingId, callTime: null } : empty;
}

// ── Opt-outs ─────────────────────────────────────────────────────────────

export async function isOptedOut(engagementId: string, phone: string | null | undefined): Promise<boolean> {
  const key = phoneKey(phone);
  if (!key) return false;
  const [row] = await db
    .select({ id: smsOptOuts.id })
    .from(smsOptOuts)
    .where(and(eq(smsOptOuts.engagementId, engagementId), eq(smsOptOuts.phoneKey, key), isNull(smsOptOuts.optedInAt)))
    .limit(1);
  return Boolean(row);
}

export async function recordOptOut(engagementId: string, phone: string, at = new Date()): Promise<void> {
  const key = phoneKey(phone);
  if (!key) return;
  await db
    .insert(smsOptOuts)
    .values({ engagementId, phoneKey: key, optedOutAt: at })
    .onConflictDoUpdate({ target: [smsOptOuts.engagementId, smsOptOuts.phoneKey], set: { optedOutAt: at, optedInAt: null } });
}

export async function recordOptIn(engagementId: string, phone: string, at = new Date()): Promise<void> {
  const key = phoneKey(phone);
  if (!key) return;
  await db
    .update(smsOptOuts)
    .set({ optedInAt: at })
    .where(and(eq(smsOptOuts.engagementId, engagementId), eq(smsOptOuts.phoneKey, key)));
}

// ── Queue ────────────────────────────────────────────────────────────────

export const SMS_REPLY_QUEUE_TITLES: Record<SmsReplyIntent, string> = {
  reschedule: "Wants to reschedule (text reply)",
  cancel: "Wants to cancel (text reply)",
  question: "Asked a question (text reply)",
  other: "Text reply (needs review)",
  stop: "Texted CANCEL: stopped texts, may mean the call",
  start: "Opted back in to texts",
  confirm: "Confirmed by text",
};

export async function getSmsReplyEngagementId(id: string): Promise<string | null> {
  const [row] = await db.select({ engagementId: smsReplies.engagementId }).from(smsReplies).where(eq(smsReplies.id, id)).limit(1);
  return row?.engagementId ?? null;
}

export async function resolveSmsReplyQueueItem(id: string): Promise<boolean> {
  const updated = await db
    .update(smsReplies)
    .set({ queueResolvedAt: new Date() })
    .where(and(eq(smsReplies.id, id), eq(smsReplies.routedToQueue, true), isNull(smsReplies.queueResolvedAt)))
    .returning({ id: smsReplies.id });
  return updated.length > 0;
}

// ── Where Twilio sends replies ───────────────────────────────────────────

export const TWILIO_INBOUND_PATH = "twilio-inbound";
