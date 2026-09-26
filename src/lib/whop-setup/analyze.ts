// src/lib/whop-setup/analyze.ts
//
// Pure reads of a Whop account for setup: the business at a glance, the
// client's normal refund and dispute rates, alert levels proposed from
// them, and which webhook events each worker needs.

import type { AlertProposal, Snapshot, WhopAccountRead, WhopPlanRead } from "./types";

/** The events each webhook-driven worker acts on. Names are Whop's own
 * (WebhookEvent in @whop/sdk). */
export const SKILL_EVENTS: Record<string, string[]> = {
  "whop-cancellation-save-offer": ["membership.cancel_at_period_end_changed"],
  "whop-dispute-response": ["dispute_alert.created", "dispute.created"],
  // The digest records every .updated delta (webhook-envelope-service.ts).
  "whop-daily-change-digest": ["plan.updated", "product.updated", "membership.cancel_at_period_end_changed", "dispute.updated", "refund.updated", "payout.updated"],
  "whop-bridge-manager": ["payment.succeeded", "membership.activated", "membership.deactivated", "membership.cancel_at_period_end_changed", "refund.created", "dispute.created"],
};

/** Payments, refunds and disputes: always on while Whop is connected, so
 * every sale lands on the buyer's timeline (lib/whop-payments.ts) and a
 * failed or past-due payment can be recovered, whichever workers are on. */
export const PAYMENT_EVENTS = ["payment.succeeded", "payment.failed", "refund.created", "dispute.created", "invoice.past_due"];

export function eventsFor(skills: string[]): string[] {
  return [...new Set([...PAYMENT_EVENTS, ...skills.flatMap((s) => SKILL_EVENTS[s] ?? [])])].sort();
}

const mostCommon = (xs: string[]) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

/** Monthly recurring revenue from the plans: each renewal plan's price
 * times its members, scaled to 30 days. In the most common currency. */
export function mrrFromPlans(plans: WhopPlanRead[]): { value: number; currency: string } | null {
  const recurring = plans.filter((p) => p.planType === "renewal" && p.renewalPrice && p.memberCount && p.billingPeriodDays);
  const currency = mostCommon(recurring.map((p) => (p.currency ?? "usd").toLowerCase()));
  if (!currency) return null;
  const value = recurring
    .filter((p) => (p.currency ?? "usd").toLowerCase() === currency)
    .reduce((sum, p) => sum + (p.renewalPrice! * p.memberCount! * 30) / p.billingPeriodDays!, 0);
  return value > 0 ? { value: Math.round(value), currency } : null;
}

export function snapshotOf(read: WhopAccountRead): Snapshot {
  const metric = (id: string) => read.metrics.find((m) => m.id === id) ?? null;
  const statsMrr = metric("mrr");
  const planMrr = mrrFromPlans(read.plans);
  const payments = metric("payments")?.value ?? null;
  const planMembers = read.plans.some((p) => p.memberCount != null) ? read.plans.reduce((a, p) => a + (p.memberCount ?? 0), 0) : null;
  const productMembers = read.products.some((p) => p.memberCount != null) ? read.products.reduce((a, p) => a + (p.memberCount ?? 0), 0) : null;
  const rate = (n: number | undefined) => (payments && payments > 0 && n != null ? n / payments : null);
  const churn = metric("churn")?.value ?? null;
  return {
    mrr: statsMrr ? { value: Math.round(statsMrr.value), currency: (statsMrr.currency ?? "usd").toLowerCase(), source: "stats" } : planMrr ? { ...planMrr, source: "plans" } : null,
    members: planMembers ?? productMembers,
    canceling: read.canceling ? { count: read.canceling.count, more: read.canceling.more } : null,
    newMembers30d: read.newMembers30d,
    refundRate: rate(read.refunds90d?.count),
    disputeRate: rate(read.disputes90d?.total),
    payments90d: payments,
    // Already a fraction: the reader converts Whop's percent (1.6 = 1.6%).
    churn,
  };
}

// Same defaults as the monitor (refund-dispute-velocity-service.ts).
export const DEFAULT_ALERTS = { refundRate: 0.08, disputeRate: 0.0075, alertThreshold: 3, minSample: 10 };
/** Card networks put merchants into monitoring programs at around 1% of payments disputed. */
const NETWORK_WATCH = 0.01;
const pctText = (x: number) => `${(x * 100).toFixed(x < 0.1 ? (x < 0.01 ? 2 : 1) : 0)}%`;
const round4 = (x: number) => Math.round(x * 10000) / 10000;

/**
 * Alert levels from the client's own last 90 days, needing 30 payments to
 * go on. Refunds: twice the usual rate and at least 3 points above it,
 * between 3% and 25%. Disputes, which card networks watch from around 1%:
 * twice the usual rate and at least a quarter point above it, but never
 * above 0.75% while their usual rate is under that; a client already over
 * it is alerted at a quarter above their usual rate, up to 2%, and told
 * why. Dispute alerts: twice a normal week's count, at least 2. Without
 * the data, the monitor's defaults stay.
 */
export function proposeAlerts(s: Snapshot, read: WhopAccountRead): AlertProposal {
  const weeks = 90 / 7;
  const weeklyPayments = s.payments90d != null ? s.payments90d / weeks : null;
  const enough = s.payments90d != null && s.payments90d >= 30;
  const tooFew = s.payments90d != null && !enough ? `${Math.round(s.payments90d)} payments in 90 days is too few to set it from your own rate.` : null;
  const noCount = "We couldn't count your payments to work out your usual rate.";

  let refundRate = DEFAULT_ALERTS.refundRate;
  let refundWhy = `Whop Agent's default. ${tooFew ?? noCount}`;
  if (enough && s.refundRate != null) {
    refundRate = Math.round(Math.min(0.25, Math.max(0.03, s.refundRate * 2, s.refundRate + 0.03)) * 100) / 100;
    refundWhy = `Your usual refund rate is ${pctText(s.refundRate)} (${Math.round(s.payments90d!)} payments in 90 days), doubled and at least 3 points higher.`;
  }

  let disputeRate = DEFAULT_ALERTS.disputeRate;
  let disputeWhy = `Whop Agent's default, below the roughly 1% at which card networks start monitoring merchants. ${tooFew ?? noCount}`;
  if (enough && s.disputeRate != null) {
    const d = s.disputeRate;
    if (d < DEFAULT_ALERTS.disputeRate) {
      disputeRate = round4(Math.min(DEFAULT_ALERTS.disputeRate, Math.max(0.0025, d * 2, d + 0.0025)));
      disputeWhy = `Your usual dispute rate is ${pctText(d)}. This is about double, and stays under 0.75% because card networks start monitoring merchants at around 1%.`;
    } else {
      disputeRate = round4(Math.min(0.02, d * 1.25));
      disputeWhy = `Your usual dispute rate is already ${pctText(d)}, ${d >= NETWORK_WATCH ? "at or above" : "close to"} the roughly 1% at which card networks start monitoring merchants. This alerts when it climbs a quarter higher; bringing it down is worth doing now.`;
    }
  }

  let alertThreshold = DEFAULT_ALERTS.alertThreshold;
  let alertWhy = `Whop Agent's default.`;
  const alerts = read.disputeAlerts90d;
  if (alerts && !alerts.more) {
    const weekly = alerts.count / weeks;
    alertThreshold = Math.max(2, Math.ceil(weekly * 2));
    alertWhy = alerts.count === 0 ? `You had no dispute alerts in 90 days, so 2 in a week stands out.` : `About ${weekly.toFixed(1)} a week over 90 days (${alerts.count} in all), doubled.`;
  }

  const sampleWhy =
    weeklyPayments != null && weeklyPayments < DEFAULT_ALERTS.minSample
      ? `You take about ${Math.round(weeklyPayments)} payments a week, so rate alerts only run in busier weeks. A handful of payments can't show a trend.`
      : `Rates are only checked once a week has at least this many payments.`;

  return {
    refundRate,
    disputeRate,
    alertThreshold,
    minSample: DEFAULT_ALERTS.minSample,
    why: { refund: refundWhy, dispute: disputeWhy, alerts: alertWhy, sample: sampleWhy },
    fromData: refundRate !== DEFAULT_ALERTS.refundRate || disputeRate !== DEFAULT_ALERTS.disputeRate || alertThreshold !== DEFAULT_ALERTS.alertThreshold,
  };
}

/** Whop's own cancel discount, when every plan that offers one agrees.
 * Intervals are billing periods, so they only become months on monthly plans. */
export function existingCancelDiscount(plans: WhopPlanRead[]): { percentage: number; months: number | null; plans: string[] } | null {
  const offering = plans.filter((p) => p.cancelDiscount);
  const values = [...new Set(offering.map((p) => p.cancelDiscount!.percentage))];
  if (values.length !== 1) return null;
  const monthly = offering.every((p) => p.billingPeriodDays != null && p.billingPeriodDays >= 28 && p.billingPeriodDays <= 31);
  const intervals = [...new Set(offering.map((p) => p.cancelDiscount!.intervals))];
  return {
    percentage: values[0],
    months: monthly && intervals.length === 1 && intervals[0] ? intervals[0] : null,
    plans: offering.map((p) => p.title ?? p.productTitle ?? p.id),
  };
}

/** The reasons members give most when cancelling, most common first. */
export function topReasons(reasons: string[], max = 3): { reason: string; count: number }[] {
  const m = new Map<string, { reason: string; count: number }>();
  for (const r of reasons) {
    const key = r.toLowerCase().replace(/\s+/g, " ").trim();
    if (!key) continue;
    const hit = m.get(key) ?? { reason: r.trim(), count: 0 };
    hit.count++;
    m.set(key, hit);
  }
  return [...m.values()].sort((a, b) => b.count - a.count).slice(0, max);
}

/** Webhooks on the account worth fixing: same address and events twice,
 * no pinned API version, or failing to deliver. */
export function webhookProblems(read: WhopAccountRead, groupKey: (url: string, events: string[]) => string) {
  const out: { kind: "duplicate" | "unpinned" | "failing"; detail: string; groupKey?: string; whopWebhookId?: string }[] = [];
  const hooks = read.webhooks ?? [];
  const groups = new Map<string, typeof hooks>();
  for (const h of hooks) {
    const k = groupKey(h.url, h.events);
    groups.set(k, [...(groups.get(k) ?? []), h]);
  }
  for (const [k, list] of groups) {
    if (list.length > 1) out.push({ kind: "duplicate", detail: `${list.length} webhooks send the same events to ${hostOf(list[0].url)}. Each event is delivered ${list.length} times.`, groupKey: k });
  }
  for (const h of hooks) {
    if (!h.apiVersionDate) out.push({ kind: "unpinned", detail: `The webhook to ${hostOf(h.url)} has no pinned API version, so its payloads can change without warning.`, whopWebhookId: h.id });
    if (h.disabledReason || h.failures > 0) out.push({ kind: "failing", detail: h.disabledReason ? `Whop switched off the webhook to ${hostOf(h.url)} (${h.disabledReason.replace(/_/g, " ")}).` : `The webhook to ${hostOf(h.url)} has failed ${h.failures} times in a row.`, whopWebhookId: h.id });
  }
  return out;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
