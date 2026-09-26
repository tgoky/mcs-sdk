// src/features/reports/server/connected-results.ts
//
// The part of a client's report no single tool can produce: what the
// products it has on did together in the last 30 days. People are matched
// across products by email, the same way lib/prospect-timeline.ts builds
// one person's journey:
//
//   emailed  → Cold Open pushed them to the sending tool
//   replied  → they answered (auto-replies and unsubscribes don't count)
//   booked   → they booked a call (Showtime's booking roster)
//   showed   → the latest recorded outcome for their call is "showed"
//   paid     → Whop recorded a payment from them
//
// Money is only what Whop recorded (receipts), never an estimate.

import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookingRoster, briefOutcomeLog, coldOpenLeads, coldOpenReplies, whopPayments } from "@/models/schema";
import { RESULTS_WINDOW_DAYS, type ConnectedResults } from "@/lib/client-results-shape";
import type { TimelineProduct } from "@/lib/prospect-timeline";

const DAY = 86_400_000;

export interface ConnectedInputs {
  /** Every lead Cold Open ever pushed (a person emailed last month can book this month). */
  leads: { email: string; campaignId: string; pushedAt: Date | null; status: string }[];
  replies: { email: string; at: Date; disposition: string }[];
  bookings: { bookingId: string; email: string | null; createdAt: Date }[];
  outcomes: { bookingId: string; outcome: string; at: Date }[];
  payments: { email: string | null; outcome: string; amount: number | null; refundedAmount: number | null; currency: string | null; at: Date }[];
}

const norm = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();

export function computeConnectedResults(input: ConnectedInputs, products: ReadonlySet<TimelineProduct>, windowStart: Date, now: Date): ConnectedResults | null {
  const inWindow = (d: Date | null) => !!d && d >= windowStart && d < now;
  const on = (p: TimelineProduct) => products.has(p);
  const funnel: ConnectedResults["funnel"] = {};

  // Cold Open
  const emailedAll = new Map<string, string>(); // email → first campaign
  for (const l of input.leads) if (l.status === "pushed" && l.email && !emailedAll.has(norm(l.email))) emailedAll.set(norm(l.email), l.campaignId);
  if (on("cold-open")) {
    funnel.emailed = new Set(input.leads.filter((l) => l.status === "pushed" && inWindow(l.pushedAt)).map((l) => norm(l.email))).size;
    funnel.replied = new Set(input.replies.filter((r) => inWindow(r.at) && r.disposition !== "auto_reply" && r.disposition !== "unsubscribe").map((r) => norm(r.email))).size;
  }

  // Showtime
  const booked = input.bookings.filter((b) => inWindow(b.createdAt));
  const latest = new Map<string, { outcome: string; at: Date }>();
  for (const o of input.outcomes) {
    const prev = latest.get(o.bookingId);
    if (!prev || o.at > prev.at) latest.set(o.bookingId, o);
  }
  const showedEmails = new Set(booked.filter((b) => latest.get(b.bookingId)?.outcome === "showed").map((b) => norm(b.email)).filter(Boolean));
  const bookedEmails = new Set(booked.map((b) => norm(b.email)).filter(Boolean));
  if (on("showtime")) {
    funnel.booked = booked.length;
    funnel.showed = booked.filter((b) => latest.get(b.bookingId)?.outcome === "showed").length;
  }

  // Whop: the client's main currency; others are left out rather than added up.
  const pays = input.payments.filter((p) => inWindow(p.at) && p.outcome !== "failed" && p.amount != null);
  const currencyCount = new Map<string, number>();
  for (const p of pays) if (p.currency) currencyCount.set(p.currency, (currencyCount.get(p.currency) ?? 0) + 1);
  const currency = [...currencyCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const mainPays = pays.filter((p) => p.currency === currency);
  const paidBy = new Map<string, number>();
  for (const p of mainPays) if (p.email) paidBy.set(norm(p.email), (paidBy.get(norm(p.email)) ?? 0) + (p.amount ?? 0));
  let money: ConnectedResults["money"] = null;
  if (on("whop-agent")) {
    funnel.paid = new Set(mainPays.map((p) => norm(p.email)).filter(Boolean)).size;
    if (currency) {
      const collected = mainPays.reduce((s, p) => s + (p.amount ?? 0), 0);
      const refunded = mainPays.reduce((s, p) => s + (p.outcome === "refunded" ? (p.refundedAmount ?? p.amount ?? 0) : 0), 0);
      money = { collected, refunded, kept: collected - refunded, currency, payments: mainPays.length };
    }
  }

  const valueOf = (emails: Iterable<string>) => {
    let v = 0;
    for (const e of emails) v += paidBy.get(e) ?? 0;
    return v;
  };

  const fromColdOpen =
    on("cold-open") && on("showtime")
      ? (() => {
          const bookedFromCold = [...bookedEmails].filter((e) => emailedAll.has(e));
          const showedFromCold = [...showedEmails].filter((e) => emailedAll.has(e));
          const paidFromCold = on("whop-agent") ? bookedFromCold.filter((e) => paidBy.has(e)) : [];
          return { booked: bookedFromCold.length, showed: showedFromCold.length, paid: paidFromCold.length, value: on("whop-agent") ? valueOf(paidFromCold) : null };
        })()
      : null;

  const paidAfterCall =
    on("showtime") && on("whop-agent")
      ? (() => {
          const buyers = [...showedEmails].filter((e) => paidBy.has(e));
          return { buyers: buyers.length, value: valueOf(buyers) };
        })()
      : null;

  const campaigns: ConnectedResults["campaigns"] = [];
  if (on("cold-open") && on("showtime")) {
    const byCampaign = new Map<string, Set<string>>();
    for (const [email, campaignId] of emailedAll) {
      if (!byCampaign.has(campaignId)) byCampaign.set(campaignId, new Set());
      byCampaign.get(campaignId)!.add(email);
    }
    for (const [campaignId, emails] of byCampaign) {
      const emailedInWindow = new Set(input.leads.filter((l) => l.campaignId === campaignId && l.status === "pushed" && inWindow(l.pushedAt)).map((l) => norm(l.email))).size;
      const b = [...emails].filter((e) => bookedEmails.has(e));
      const s = [...emails].filter((e) => showedEmails.has(e));
      const paid = on("whop-agent") ? [...emails].filter((e) => paidBy.has(e) && bookedEmails.has(e)) : [];
      if (emailedInWindow + b.length === 0) continue;
      campaigns.push({ campaignId, emailed: emailedInWindow, booked: b.length, showed: s.length, paid: paid.length, value: on("whop-agent") ? valueOf(paid) : null });
    }
    campaigns.sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || b.booked - a.booked);
  }

  // Worth showing only when at least two products contribute something.
  const contributing = [funnel.emailed !== undefined, funnel.booked !== undefined, funnel.paid !== undefined].filter(Boolean).length;
  if (contributing < 2) return null;
  return { products: [...products], funnel, money, fromColdOpen, paidAfterCall, campaigns: campaigns.slice(0, 10) };
}

export async function getConnectedResults(engagementId: string, products: ReadonlySet<TimelineProduct>, now = new Date()): Promise<ConnectedResults | null> {
  const windowStart = new Date(now.getTime() - RESULTS_WINDOW_DAYS * DAY);
  const [leads, replies, bookings, payments] = await Promise.all([
    products.has("cold-open")
      ? db.select({ email: coldOpenLeads.email, campaignId: coldOpenLeads.campaignId, pushedAt: coldOpenLeads.pushedAt, status: coldOpenLeads.status }).from(coldOpenLeads).where(eq(coldOpenLeads.engagementId, engagementId))
      : [],
    products.has("cold-open")
      ? db.select({ email: coldOpenReplies.leadEmail, at: coldOpenReplies.classifiedAt, disposition: coldOpenReplies.disposition }).from(coldOpenReplies).where(and(eq(coldOpenReplies.engagementId, engagementId), gte(coldOpenReplies.classifiedAt, windowStart), lt(coldOpenReplies.classifiedAt, now)))
      : [],
    products.has("showtime")
      ? db.select({ bookingId: bookingRoster.externalCallId, email: bookingRoster.prospectEmail, createdAt: bookingRoster.createdAt }).from(bookingRoster).where(and(eq(bookingRoster.engagementId, engagementId), gte(bookingRoster.createdAt, windowStart), lt(bookingRoster.createdAt, now)))
      : [],
    products.has("whop-agent")
      ? db.select({ email: whopPayments.email, outcome: whopPayments.outcome, amount: whopPayments.amount, refundedAmount: whopPayments.refundedAmount, currency: whopPayments.currency, at: whopPayments.occurredAt }).from(whopPayments).where(and(eq(whopPayments.engagementId, engagementId), gte(whopPayments.occurredAt, windowStart), lt(whopPayments.occurredAt, now)))
      : [],
  ]);
  const bookingIds = bookings.map((b) => b.bookingId);
  const outcomes = bookingIds.length
    ? await db.select({ bookingId: briefOutcomeLog.bookingId, outcome: briefOutcomeLog.outcome, at: briefOutcomeLog.loggedAt }).from(briefOutcomeLog).where(and(eq(briefOutcomeLog.engagementId, engagementId), inArray(briefOutcomeLog.bookingId, bookingIds)))
    : [];
  return computeConnectedResults({ leads, replies, bookings, outcomes, payments }, products, windowStart, now);
}
