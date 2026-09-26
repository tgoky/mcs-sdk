// src/lib/prospect-timeline.ts
//
// One person's whole journey with a client, across whichever products the
// client has on: cold email sent and answered (Cold Open), booked,
// reminded, replied by text, showed or not, recovered (Showtime), paid,
// refunded or disputed (Whop). Nothing is stored for this; it's read from
// what each product already records, joined on the person's email and
// phone. A product that's off contributes nothing, and nothing breaks
// without it.
//
// Every step says how it's known ("proof"): a provider's receipt, the
// booking tool, a person on the team, a payment record. That's what makes
// the numbers built on it believable.

import { db } from "@/lib/db";
import {
  bookingRoster,
  briefOutcomeLog,
  coldOpenLeads,
  coldOpenReplies,
  sequenceMessageLog,
  smsReplies,
  winBackEnrollments,
} from "@/models/schema";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { getEnabledWorkerIdsForEngagement } from "@/lib/engagement-skills";
import { WORKER_REGISTRY } from "@/lib/worker-registry";
import type { ProductId } from "@/lib/product-catalog";
import { paymentsForEmails, type BuyerPayment } from "@/lib/whop-payments";
import { phoneKey } from "@/lib/sms-replies";
import { outcomeSourceLabel } from "@/lib/copy";

export type TimelineProduct = "cold-open" | "showtime" | "whop-agent" | "reputation-manager";

export interface TimelineEvent {
  at: string;
  product: TimelineProduct;
  kind:
    | "emailed"
    | "replied"
    | "booked"
    | "cancelled"
    | "message"
    | "text_reply"
    | "showed"
    | "no_show"
    | "rescheduled"
    | "recovery"
    | "paid"
    | "payment_failed"
    | "refunded"
    | "disputed";
  title: string;
  detail?: string;
  /** How this step is known. */
  proof?: string;
  amount?: { value: number; currency: string };
  /** The step went wrong (undelivered, failed payment, dispute). */
  warn?: boolean;
}

export interface TimelineSummary {
  emailed: boolean;
  replied: boolean;
  booked: boolean;
  showed: boolean | null;
  paid: { value: number; currency: string } | null;
  refunded: { value: number; currency: string } | null;
  disputed: boolean;
  /** The Cold Open campaign that started it, when there was one. */
  campaignId: string | null;
}

export interface ProspectTimeline {
  person: { name: string | null; email: string | null; phone: string | null };
  products: TimelineProduct[];
  events: TimelineEvent[];
  summary: TimelineSummary;
}

// ── What each product recorded, as plain rows ───────────────────────────

export interface TimelineSources {
  leads: { pushedAt: Date | null; createdAt: Date; campaignId: string; status: string }[];
  replies: { classifiedAt: Date; disposition: string; rawBody: string; campaignId: string | null }[];
  bookings: { externalCallId: string; createdAt: Date; callTime: Date; status: string; updatedAt: Date }[];
  messages: { sentAt: Date; channel: string; sequenceType: string; status: string; provider: string | null; providerMessageId: string | null; deliveryStatus: string | null; deliveryError: string | null; error: string | null }[];
  textReplies: { receivedAt: Date; intent: string | null; body: string }[];
  outcomes: { loggedAt: Date; outcome: string; source: string | null }[];
  recoveries: { enrolledAt: Date; status: string; exitedAt: Date | null; exitReason: string | null }[];
  payments: BuyerPayment[];
}

const SEQUENCE_LABEL: Record<string, string> = {
  pile_on_sms: "Reminder text",
  win_back_sms: "Recovery text",
  win_back_email_smtp: "Recovery email",
  review_request_email: "Asked for a review",
  review_request_sms: "Asked for a review",
};

const REPLY_LABEL: Record<string, string> = {
  interested: "Replied: interested",
  objection: "Replied with an objection",
  not_now: "Replied: not now",
  not_a_fit: "Replied: not a fit",
  auto_reply: "Auto-reply",
  unsubscribe: "Asked to unsubscribe",
  unclassified: "Replied",
};

const TEXT_REPLY_LABEL: Record<string, string> = {
  confirm: "Confirmed by text",
  reschedule: "Asked by text to reschedule",
  cancel: "Asked by text to cancel",
  question: "Asked a question by text",
  stop: "Texted STOP",
  start: "Opted back in to texts",
  other: "Replied by text",
};

const snippet = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const iso = (d: Date | string) => new Date(d).toISOString();

function messageProof(m: TimelineSources["messages"][number]): { proof: string; warn: boolean } {
  if (m.status === "failed") return { proof: `Not sent: ${m.error ?? "the provider refused it"}`, warn: true };
  if (m.deliveryStatus === "undelivered" || m.deliveryStatus === "failed") return { proof: `Not delivered: ${m.deliveryError ?? "the carrier rejected it"}`, warn: true };
  if (m.deliveryStatus === "delivered") return { proof: "Delivered (provider receipt)", warn: false };
  if (m.providerMessageId) return { proof: `Accepted by ${m.provider === "ghl_sms" ? "GoHighLevel" : m.provider === "twilio" ? "Twilio" : m.provider ?? "the provider"} (receipt ${m.providerMessageId.slice(0, 12)}…)`, warn: false };
  return { proof: "Sent (no receipt kept for older messages)", warn: false };
}

export function assembleTimeline(src: TimelineSources, products: ReadonlySet<TimelineProduct>): { events: TimelineEvent[]; summary: TimelineSummary } {
  const events: TimelineEvent[] = [];

  if (products.has("cold-open")) {
    for (const l of src.leads) {
      if (l.status !== "pushed" || !l.pushedAt) continue;
      events.push({ at: iso(l.pushedAt), product: "cold-open", kind: "emailed", title: "Cold email sequence started", detail: `Campaign ${l.campaignId}`, proof: "Pushed to the sending tool" });
    }
    for (const r of src.replies) {
      events.push({ at: iso(r.classifiedAt), product: "cold-open", kind: "replied", title: REPLY_LABEL[r.disposition] ?? "Replied", detail: snippet(r.rawBody), proof: "Reply from the sending tool" });
    }
  }

  if (products.has("showtime")) {
    for (const b of src.bookings) {
      events.push({ at: iso(b.createdAt), product: "showtime", kind: "booked", title: "Booked a call", detail: `For ${new Date(b.callTime).toUTCString().replace(" GMT", " UTC")}`, proof: "From the booking tool" });
      if (b.status === "cancelled") events.push({ at: iso(b.updatedAt), product: "showtime", kind: "cancelled", title: "Cancelled the call", proof: "From the booking tool", warn: true });
    }
    for (const m of src.messages) {
      if (m.sequenceType.startsWith("review_request_")) continue; // Reputation's, below
      const { proof, warn } = messageProof(m);
      events.push({ at: iso(m.sentAt), product: "showtime", kind: "message", title: `${SEQUENCE_LABEL[m.sequenceType] ?? "Message"} (${m.channel === "email" ? "email" : "text"})`, proof, warn });
    }
    for (const t of src.textReplies) {
      events.push({ at: iso(t.receivedAt), product: "showtime", kind: "text_reply", title: TEXT_REPLY_LABEL[t.intent ?? "other"] ?? "Replied by text", detail: `"${snippet(t.body)}"`, proof: "Text received" });
    }
    for (const o of src.outcomes) {
      const kind = o.outcome === "showed" ? "showed" : o.outcome === "no_show" ? "no_show" : "rescheduled";
      events.push({ at: iso(o.loggedAt), product: "showtime", kind, title: kind === "showed" ? "Showed up" : kind === "no_show" ? "Didn't show" : "Rescheduled", proof: outcomeSourceLabel(o.source, o.outcome) || "Logged", warn: kind === "no_show" });
    }
    for (const r of src.recoveries) {
      events.push({ at: iso(r.enrolledAt), product: "showtime", kind: "recovery", title: "Booking recovery started" });
      if (r.exitedAt) events.push({ at: iso(r.exitedAt), product: "showtime", kind: "recovery", title: r.status === "rebooked" ? "Rebooked through recovery" : r.status === "reply_exited" ? "Answered the recovery, handed to the team" : "Booking recovery ended", detail: r.exitReason ?? undefined });
    }
  }

  if (products.has("reputation-manager")) {
    for (const m of src.messages.filter((x) => x.sequenceType.startsWith("review_request_"))) {
      const { proof, warn } = messageProof(m);
      events.push({ at: iso(m.sentAt), product: "reputation-manager", kind: "message", title: `Asked for a review (${m.channel === "email" ? "email" : "text"})`, proof, warn });
    }
  }

  if (products.has("whop-agent")) {
    for (const p of src.payments) {
      const money = p.amount != null && p.currency ? { value: p.amount, currency: p.currency } : undefined;
      if (p.outcome === "failed") {
        events.push({ at: iso(p.occurredAt), product: "whop-agent", kind: "payment_failed", title: "Payment failed", detail: p.failureMessage ?? undefined, proof: `Whop payment ${p.paymentId}`, amount: money, warn: true });
      }
      if (p.recoverySentAt) events.push({ at: iso(p.recoverySentAt), product: "whop-agent", kind: "recovery", title: "Sent a message to fix the payment", proof: "Whop direct message" });
      if (p.recoveredAt) {
        events.push({ at: iso(p.recoveredAt), product: "whop-agent", kind: "recovery", title: "Payment recovered", proof: `Paid after the message`, amount: p.recoveredAmount != null && p.currency ? { value: p.recoveredAmount, currency: p.currency } : undefined });
      }
      if (p.outcome === "failed") continue;
      events.push({ at: iso(p.paidAt ?? p.occurredAt), product: "whop-agent", kind: "paid", title: `Paid${p.productTitle ? ` for ${p.productTitle}` : ""}`, proof: `Whop payment ${p.paymentId}`, amount: money });
      if (p.outcome === "refunded") events.push({ at: iso(p.occurredAt), product: "whop-agent", kind: "refunded", title: "Refunded", proof: `Whop payment ${p.paymentId}`, amount: p.refundedAmount != null && p.currency ? { value: p.refundedAmount, currency: p.currency } : undefined, warn: true });
      if (p.outcome === "disputed") events.push({ at: iso(p.occurredAt), product: "whop-agent", kind: "disputed", title: "Disputed the payment", proof: `Whop payment ${p.paymentId}`, warn: true });
    }
  }

  events.sort((a, b) => a.at.localeCompare(b.at));

  const sum = (kind: "paid" | "refunded") => {
    const rows = events.filter((e) => e.kind === kind && e.amount);
    if (!rows.length) return null;
    const currency = rows[0].amount!.currency;
    return { value: rows.filter((e) => e.amount!.currency === currency).reduce((s, e) => s + e.amount!.value, 0), currency };
  };
  const lastOutcome = [...events].reverse().find((e) => e.kind === "showed" || e.kind === "no_show");
  const firstLead = products.has("cold-open") ? src.leads.find((l) => l.status === "pushed") : undefined;
  return {
    events,
    summary: {
      emailed: events.some((e) => e.kind === "emailed"),
      replied: events.some((e) => e.kind === "replied"),
      booked: events.some((e) => e.kind === "booked"),
      showed: lastOutcome ? lastOutcome.kind === "showed" : null,
      paid: sum("paid"),
      refunded: sum("refunded"),
      disputed: events.some((e) => e.kind === "disputed"),
      campaignId: firstLead?.campaignId ?? null,
    },
  };
}

// ── Loading ──────────────────────────────────────────────────────────────

const PRODUCT_OF: Record<ProductId, TimelineProduct> = {
  showtime: "showtime",
  "cold-open": "cold-open",
  "whop-agent": "whop-agent",
  "reputation-manager": "reputation-manager",
};

export async function productsOnFor(engagementId: string): Promise<Set<TimelineProduct>> {
  const workers = await getEnabledWorkerIdsForEngagement(engagementId);
  return new Set(workers.map((w) => PRODUCT_OF[WORKER_REGISTRY[w].productId]).filter(Boolean));
}

export async function loadProspectTimeline(engagementId: string, key: { bookingId?: string; email?: string; phone?: string }): Promise<ProspectTimeline | null> {
  let email = key.email?.trim().toLowerCase() || null;
  let phone = key.phone?.trim() || null;
  let name: string | null = null;

  if (key.bookingId) {
    const [b] = await db
      .select({ email: bookingRoster.prospectEmail, phone: bookingRoster.prospectPhone, name: bookingRoster.prospectName })
      .from(bookingRoster)
      .where(and(eq(bookingRoster.engagementId, engagementId), eq(bookingRoster.externalCallId, key.bookingId)))
      .limit(1);
    if (b) {
      email ??= b.email?.toLowerCase() ?? null;
      phone ??= b.phone ?? null;
      name = b.name ?? null;
    }
  }
  if (!email && !phone && !key.bookingId) return null;

  const products = await productsOnFor(engagementId);
  const pkey = phoneKey(phone);

  // Bookings: theirs by email, and the one asked about.
  const bookingConds = [email ? eq(bookingRoster.prospectEmail, email) : null, key.bookingId ? eq(bookingRoster.externalCallId, key.bookingId) : null].filter((c): c is NonNullable<typeof c> => c !== null);
  const bookings = bookingConds.length
    ? await db
        .select({ externalCallId: bookingRoster.externalCallId, createdAt: bookingRoster.createdAt, callTime: bookingRoster.callTime, status: bookingRoster.status, updatedAt: bookingRoster.updatedAt, name: bookingRoster.prospectName })
        .from(bookingRoster)
        .where(and(eq(bookingRoster.engagementId, engagementId), or(...bookingConds)))
    : [];
  name ??= bookings.find((b) => b.name)?.name ?? null;
  const bookingIds = [...new Set(bookings.map((b) => b.externalCallId).concat(key.bookingId ? [key.bookingId] : []))];

  const [leads, replies, messages, textReplies, outcomes, recoveries, payments] = await Promise.all([
    email && products.has("cold-open")
      ? db.select({ pushedAt: coldOpenLeads.pushedAt, createdAt: coldOpenLeads.createdAt, campaignId: coldOpenLeads.campaignId, status: coldOpenLeads.status }).from(coldOpenLeads).where(and(eq(coldOpenLeads.engagementId, engagementId), eq(coldOpenLeads.email, email)))
      : [],
    email && products.has("cold-open")
      ? db.select({ classifiedAt: coldOpenReplies.classifiedAt, disposition: coldOpenReplies.disposition, rawBody: coldOpenReplies.rawBody, campaignId: coldOpenReplies.campaignId }).from(coldOpenReplies).where(and(eq(coldOpenReplies.engagementId, engagementId), eq(coldOpenReplies.leadEmail, email)))
      : [],
    (products.has("showtime") || products.has("reputation-manager")) && (email || bookingIds.length)
      ? db
          .select({ sentAt: sequenceMessageLog.sentAt, channel: sequenceMessageLog.channel, sequenceType: sequenceMessageLog.sequenceType, status: sequenceMessageLog.status, provider: sequenceMessageLog.provider, providerMessageId: sequenceMessageLog.providerMessageId, deliveryStatus: sequenceMessageLog.deliveryStatus, deliveryError: sequenceMessageLog.deliveryError, error: sequenceMessageLog.error })
          .from(sequenceMessageLog)
          .where(and(eq(sequenceMessageLog.engagementId, engagementId), or(...[email ? eq(sequenceMessageLog.prospectEmail, email) : null, bookingIds.length ? inArray(sequenceMessageLog.bookingId, bookingIds) : null].filter((c): c is NonNullable<typeof c> => c !== null))))
      : [],
    products.has("showtime") && (email || pkey)
      ? db
          .select({ receivedAt: smsReplies.receivedAt, intent: smsReplies.intent, body: smsReplies.body })
          .from(smsReplies)
          .where(
            and(
              eq(smsReplies.engagementId, engagementId),
              // Same last-10-digits match as lib/sms-replies.ts phoneKey.
              or(...[email ? eq(smsReplies.prospectEmail, email) : null, pkey ? sql`right(regexp_replace(${smsReplies.fromPhone}, '[^0-9]', '', 'g'), 10) = ${pkey}` : null].filter((c): c is NonNullable<typeof c> => c !== null))
            )
          )
      : [],
    products.has("showtime") && bookingIds.length
      ? db.select({ loggedAt: briefOutcomeLog.loggedAt, outcome: briefOutcomeLog.outcome, source: briefOutcomeLog.source }).from(briefOutcomeLog).where(and(eq(briefOutcomeLog.engagementId, engagementId), inArray(briefOutcomeLog.bookingId, bookingIds)))
      : [],
    email && products.has("showtime")
      ? db.select({ enrolledAt: winBackEnrollments.enrolledAt, status: winBackEnrollments.status, exitedAt: winBackEnrollments.exitedAt, exitReason: winBackEnrollments.exitReason }).from(winBackEnrollments).where(and(eq(winBackEnrollments.engagementId, engagementId), eq(winBackEnrollments.prospectEmail, email)))
      : [],
    email && products.has("whop-agent") ? paymentsForEmails(engagementId, [email]) : [],
  ]);

  const { events, summary } = assembleTimeline({ leads, replies, bookings, messages, textReplies, outcomes, recoveries, payments }, products);
  return { person: { name, email, phone }, products: [...products], events, summary };
}
