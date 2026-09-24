// src/features/reports/server/client-results.ts
//
// What each client actually got in the last 30 days, next to the 30 days
// before: the numbers a business owner cares about, per product, read
// straight from what the skills record. Nothing is estimated here except
// the one figure labelled as such (extra shows at the offer price).
//
// Counts are kept raw per client and window, so a portfolio total is the
// same arithmetic over summed counts (a rate across clients is summed
// numerators over summed denominators, not an average of rates).

import { and, gte, inArray, lt } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  bookingRoster,
  briefOutcomeLog,
  coldOpenLeads,
  coldOpenReplies,
  pendingActions,
  pileOnSendLog,
  repIncidents,
  repRedditMentions,
  repTrustpilotReviews,
  repTwitterMentions,
  repWebFindings,
  whopChangeLedger,
  winBackEnrollments,
} from "@/models/schema";
import { RESULTS_WINDOW_DAYS, type ClientResults, type ProductResults, type RawCounts, type ShowRateThenNow } from "@/lib/client-results-shape";

export * from "@/lib/client-results-shape";

const DAY = 86_400_000;
/** Outcomes needed in a client's first month before it counts as a baseline. */
const BASELINE_MIN_OUTCOMES = 10;

export const emptyCounts = (): RawCounts => ({
  booked: 0,
  showed: 0,
  noShow: 0,
  winBackRebooked: 0,
  winBackLost: 0,
  textLatenciesMs: [],
  contacted: 0,
  humanReplies: 0,
  interested: 0,
  newReviews: 0,
  ratingSum: 0,
  ratingCount: 0,
  badReviews: 0,
  badAnswered: 0,
  mentions: 0,
  negativeMentions: 0,
  incidents: 0,
  saveOffersSent: 0,
  membersStayed: 0,
  disputesAnswered: 0,
});

export function addCounts(a: RawCounts, b: RawCounts): RawCounts {
  const out = emptyCounts();
  for (const key of Object.keys(out) as (keyof RawCounts)[]) {
    if (key === "textLatenciesMs") out.textLatenciesMs = [...a.textLatenciesMs, ...b.textLatenciesMs];
    else (out[key] as number) = (a[key] as number) + (b[key] as number);
  }
  return out;
}

const rate = (n: number, d: number) => (d > 0 ? n / d : null);
function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const hasShowtime = (c: RawCounts) => c.booked + c.showed + c.noShow + c.winBackRebooked + c.winBackLost + c.textLatenciesMs.length > 0;
const hasColdOpen = (c: RawCounts) => c.contacted + c.humanReplies > 0;
const hasReputation = (c: RawCounts) => c.newReviews + c.mentions + c.incidents > 0;
const hasWhop = (c: RawCounts) => c.saveOffersSent + c.membersStayed + c.disputesAnswered > 0;

/** The per-product numbers for one client (or a whole portfolio's summed
 * counts). A product appears only when it has activity in either window. */
export function productResults(cur: RawCounts, prev: RawCounts): ProductResults[] {
  const out: ProductResults[] = [];
  if (hasShowtime(cur) || hasShowtime(prev)) {
    out.push({
      product: "showtime",
      metrics: [
        { key: "booked", label: "Calls booked", current: cur.booked, previous: prev.booked, format: "count", better: "up" },
        { key: "showRate", label: "Show rate", current: rate(cur.showed, cur.showed + cur.noShow), previous: rate(prev.showed, prev.showed + prev.noShow), format: "percent", better: "up" },
        { key: "rebooked", label: "No-shows rebooked", current: cur.winBackRebooked, previous: prev.winBackRebooked, format: "count", better: "up" },
        { key: "firstText", label: "Time to first text", current: median(cur.textLatenciesMs), previous: median(prev.textLatenciesMs), format: "duration", better: "down" },
      ],
    });
  }
  if (hasColdOpen(cur) || hasColdOpen(prev)) {
    out.push({
      product: "cold-open",
      metrics: [
        { key: "contacted", label: "Leads contacted", current: cur.contacted, previous: prev.contacted, format: "count", better: "up" },
        { key: "replyRate", label: "Reply rate", current: rate(cur.humanReplies, cur.contacted), previous: rate(prev.humanReplies, prev.contacted), format: "percent", better: "up" },
        { key: "interested", label: "Interested replies", current: cur.interested, previous: prev.interested, format: "count", better: "up" },
      ],
    });
  }
  if (hasReputation(cur) || hasReputation(prev)) {
    out.push({
      product: "reputation",
      metrics: [
        { key: "newReviews", label: "New reviews", current: cur.newReviews, previous: prev.newReviews, format: "count", better: "up" },
        { key: "avgRating", label: "Average rating", current: cur.ratingCount ? cur.ratingSum / cur.ratingCount : null, previous: prev.ratingCount ? prev.ratingSum / prev.ratingCount : null, format: "rating", better: "up" },
        { key: "badAnswered", label: "Bad reviews answered", current: rate(cur.badAnswered, cur.badReviews), previous: rate(prev.badAnswered, prev.badReviews), format: "percent", better: "up" },
        { key: "mentions", label: "Mentions caught", current: cur.mentions, previous: prev.mentions, format: "count", better: "up" },
      ],
    });
  }
  if (hasWhop(cur) || hasWhop(prev)) {
    out.push({
      product: "whop",
      metrics: [
        { key: "saveOffers", label: "Save offers sent", current: cur.saveOffersSent, previous: prev.saveOffersSent, format: "count", better: "up" },
        { key: "stayed", label: "Members who stayed", current: cur.membersStayed, previous: prev.membersStayed, format: "count", better: "up" },
        { key: "disputes", label: "Disputes answered", current: cur.disputesAnswered, previous: prev.disputesAnswered, format: "count", better: "up" },
      ],
    });
  }
  return out;
}

/** The first number in an offer price ("$2,000", "1.5k/mo" is left alone
 * when unclear). Null unless it's a plain amount. */
export function offerPriceValue(price: string | null | undefined): number | null {
  if (!price) return null;
  const m = price.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(k)?/i);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] ? 1000 : 1);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function showRateThenNow(baseline: { showed: number; noShow: number } | undefined, cur: RawCounts, offerPrice: string | null): ShowRateThenNow | null {
  if (!baseline) return null;
  const base = baseline.showed + baseline.noShow;
  const now = cur.showed + cur.noShow;
  if (base < BASELINE_MIN_OUTCOMES || now === 0) return null;
  const baselineRate = baseline.showed / base;
  const currentRate = cur.showed / now;
  const extraShows = Math.max(0, Math.round((currentRate - baselineRate) * now));
  const price = offerPriceValue(offerPrice);
  return { baseline: baselineRate, current: currentRate, extraShows, estimatedValue: price && extraShows > 0 ? extraShows * price : null, offerPrice: price ? offerPrice : null };
}

type Row = { engagementId: string | null; at: Date | null };

/** Reads every client's counts for the two windows in one batch of queries. */
export async function getClientResults(
  clients: { engagementId: string; buyer: string; offerPrice?: string | null }[],
  now = new Date()
): Promise<ClientResults[]> {
  if (clients.length === 0) return [];
  const ids = clients.map((c) => c.engagementId);
  const curStart = new Date(now.getTime() - RESULTS_WINDOW_DAYS * DAY);
  const prevStart = new Date(now.getTime() - 2 * RESULTS_WINDOW_DAYS * DAY);
  // Both windows at once: the 30 days before the last 30, and the last 30.
  const windowed = (engagementCol: AnyPgColumn, at: AnyPgColumn) => and(inArray(engagementCol, ids), gte(at, prevStart), lt(at, now));

  const [booked, outcomes, winBack, texts, leads, replies, reviews, trustpilot, reddit, twitter, incidents, actions, ledger] = await Promise.all([
    db.select({ engagementId: bookingRoster.engagementId, at: bookingRoster.createdAt }).from(bookingRoster).where(windowed(bookingRoster.engagementId, bookingRoster.createdAt)),
    db.select({ engagementId: briefOutcomeLog.engagementId, at: briefOutcomeLog.loggedAt, outcome: briefOutcomeLog.outcome }).from(briefOutcomeLog).where(inArray(briefOutcomeLog.engagementId, ids)),
    db.select({ engagementId: winBackEnrollments.engagementId, at: winBackEnrollments.enrolledAt, status: winBackEnrollments.status }).from(winBackEnrollments).where(windowed(winBackEnrollments.engagementId, winBackEnrollments.enrolledAt)),
    db.select({ engagementId: pileOnSendLog.engagementId, at: pileOnSendLog.createdAt, latencyMs: pileOnSendLog.latencyMs, error: pileOnSendLog.error }).from(pileOnSendLog).where(windowed(pileOnSendLog.engagementId, pileOnSendLog.createdAt)),
    db.select({ engagementId: coldOpenLeads.engagementId, at: coldOpenLeads.pushedAt, status: coldOpenLeads.status }).from(coldOpenLeads).where(windowed(coldOpenLeads.engagementId, coldOpenLeads.pushedAt)),
    db.select({ engagementId: coldOpenReplies.engagementId, at: coldOpenReplies.classifiedAt, disposition: coldOpenReplies.disposition }).from(coldOpenReplies).where(windowed(coldOpenReplies.engagementId, coldOpenReplies.classifiedAt)),
    db.select({ engagementId: repWebFindings.engagementId, at: repWebFindings.createdAt, source: repWebFindings.source, rating: repWebFindings.rating, ownerAnswered: repWebFindings.ownerAnswered, sentiment: repWebFindings.sentiment }).from(repWebFindings).where(windowed(repWebFindings.engagementId, repWebFindings.createdAt)),
    db.select({ engagementId: repTrustpilotReviews.engagementId, at: repTrustpilotReviews.createdAt, rating: repTrustpilotReviews.rating }).from(repTrustpilotReviews).where(windowed(repTrustpilotReviews.engagementId, repTrustpilotReviews.createdAt)),
    db.select({ engagementId: repRedditMentions.engagementId, at: repRedditMentions.createdAt, sentiment: repRedditMentions.sentiment }).from(repRedditMentions).where(windowed(repRedditMentions.engagementId, repRedditMentions.createdAt)),
    db.select({ engagementId: repTwitterMentions.engagementId, at: repTwitterMentions.createdAt, sentiment: repTwitterMentions.sentiment }).from(repTwitterMentions).where(windowed(repTwitterMentions.engagementId, repTwitterMentions.createdAt)),
    db.select({ engagementId: repIncidents.engagementId, at: repIncidents.declaredAt }).from(repIncidents).where(windowed(repIncidents.engagementId, repIncidents.declaredAt)),
    db.select({ engagementId: pendingActions.engagementId, at: pendingActions.createdAt, actionType: pendingActions.actionType, status: pendingActions.status }).from(pendingActions).where(windowed(pendingActions.engagementId, pendingActions.createdAt)),
    db.select({ engagementId: whopChangeLedger.engagementId, at: whopChangeLedger.occurredAt, eventType: whopChangeLedger.eventType, changedFields: whopChangeLedger.changedFields }).from(whopChangeLedger).where(windowed(whopChangeLedger.engagementId, whopChangeLedger.occurredAt)),
  ]);

  const counts = new Map<string, { cur: RawCounts; prev: RawCounts }>(ids.map((id) => [id, { cur: emptyCounts(), prev: emptyCounts() }]));
  const bucket = (r: Row): RawCounts | null => {
    if (!r.engagementId || !r.at) return null;
    const entry = counts.get(r.engagementId);
    if (!entry) return null;
    if (r.at >= curStart && r.at < now) return entry.cur;
    if (r.at >= prevStart && r.at < curStart) return entry.prev;
    return null;
  };

  for (const r of booked) {
    const c = bucket(r);
    if (c) c.booked++;
  }
  const baselines = new Map<string, { first: Date; showed: number; noShow: number }>();
  const sortedOutcomes = [...outcomes].sort((a, b) => a.at.getTime() - b.at.getTime());
  for (const r of sortedOutcomes) {
    if (r.outcome !== "showed" && r.outcome !== "no_show") continue;
    // The client's first month of outcomes is its baseline.
    const b = baselines.get(r.engagementId) ?? { first: r.at, showed: 0, noShow: 0 };
    if (r.at.getTime() - b.first.getTime() < RESULTS_WINDOW_DAYS * DAY) {
      if (r.outcome === "showed") b.showed++;
      else b.noShow++;
    }
    baselines.set(r.engagementId, b);
    const c = bucket(r);
    if (!c) continue;
    if (r.outcome === "showed") c.showed++;
    else c.noShow++;
  }
  for (const r of winBack) {
    const c = bucket(r);
    if (!c) continue;
    if (r.status === "rebooked") c.winBackRebooked++;
    else if (r.status === "lost") c.winBackLost++;
  }
  for (const r of texts) {
    const c = bucket(r);
    if (c && !r.error && typeof r.latencyMs === "number") c.textLatenciesMs.push(r.latencyMs);
  }
  for (const r of leads) {
    const c = bucket(r);
    if (c && r.status === "pushed") c.contacted++;
  }
  for (const r of replies) {
    const c = bucket(r);
    if (!c || r.disposition === "auto_reply") continue;
    c.humanReplies++;
    if (r.disposition === "interested") c.interested++;
  }
  const review = (c: RawCounts, rating: number | null, answered: boolean | null) => {
    c.newReviews++;
    if (typeof rating === "number") {
      c.ratingSum += rating;
      c.ratingCount++;
      if (rating <= 2) {
        c.badReviews++;
        if (answered) c.badAnswered++;
      }
    }
  };
  for (const r of reviews) {
    const c = bucket(r);
    if (!c) continue;
    if (r.source === "google_reviews") review(c, r.rating, r.ownerAnswered);
    else {
      c.mentions++;
      if (r.sentiment === "negative") c.negativeMentions++;
    }
  }
  for (const r of trustpilot) {
    const c = bucket(r);
    // Trustpilot reviews count toward new reviews and the rating; with no
    // owner-reply data, only Google's feed the "answered" rate.
    if (c) {
      c.newReviews++;
      c.ratingSum += r.rating;
      c.ratingCount++;
    }
  }
  for (const r of [...reddit, ...twitter]) {
    const c = bucket(r);
    if (!c) continue;
    c.mentions++;
    if (r.sentiment === "negative") c.negativeMentions++;
  }
  for (const r of incidents) {
    const c = bucket(r);
    if (c) c.incidents++;
  }
  for (const r of actions) {
    const c = bucket(r);
    if (!c || r.status !== "approved") continue;
    if (r.actionType === "whop_cancellation_offer_create") c.saveOffersSent++;
    if (r.actionType === "whop_dispute_evidence_submit") c.disputesAnswered++;
  }
  for (const r of ledger) {
    const c = bucket(r);
    // A member turning their cancellation back off: they stayed.
    const flag = r.changedFields?.cancel_at_period_end;
    if (c && r.eventType === "membership.cancel_at_period_end_changed" && flag && flag.previous === true && flag.current === false) c.membersStayed++;
  }

  return clients.map((client) => {
    const { cur, prev } = counts.get(client.engagementId)!;
    return {
      engagementId: client.engagementId,
      buyer: client.buyer,
      current: cur,
      previous: prev,
      products: productResults(cur, prev),
      showRate: showRateThenNow(baselines.get(client.engagementId), cur, client.offerPrice ?? null),
    };
  });
}

/** The portfolio's then-vs-now across the clients that have a baseline.
 * The baseline is weighted by each client's current outcomes (the shows
 * the first-month rate would have given now); extra shows and the estimate
 * add up the clients that improved, so one client slipping never cancels
 * another's gain. */
export function portfolioShowRate(results: ClientResults[]): (ShowRateThenNow & { clients: number }) | null {
  const withBaseline = results.filter((r): r is ClientResults & { showRate: ShowRateThenNow } => r.showRate !== null);
  if (withBaseline.length === 0) return null;
  let outcomes = 0;
  let showed = 0;
  let expected = 0;
  let extraShows = 0;
  let value = 0;
  let priced = false;
  for (const r of withBaseline) {
    const n = r.current.showed + r.current.noShow;
    outcomes += n;
    showed += r.current.showed;
    expected += r.showRate.baseline * n;
    extraShows += r.showRate.extraShows;
    if (r.showRate.estimatedValue !== null) {
      value += r.showRate.estimatedValue;
      priced = true;
    }
  }
  return {
    baseline: expected / outcomes,
    current: showed / outcomes,
    extraShows,
    estimatedValue: priced ? value : null,
    offerPrice: null,
    clients: withBaseline.length,
  };
}
