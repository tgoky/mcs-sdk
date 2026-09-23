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

export function eventsFor(skills: string[]): string[] {
  return [...new Set(skills.flatMap((s) => SKILL_EVENTS[s] ?? []))].sort();
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
    // Stats percentages may be 0-1 or 0-100.
    churn: churn == null ? null : churn > 1 ? churn / 100 : churn,
  };
}

export const DEFAULT_ALERTS = { rateThreshold: 0.08, alertThreshold: 3, minSample: 10 };
const pctText = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;

/**
 * Alert levels from the client's own last 90 days. The velocity check
 * compares both refund and dispute rate to one threshold, so it starts
 * from the higher of the two: twice the usual rate and at least 3 points
 * above it, between 3% and 25%. Dispute alerts: twice a normal week's
 * count, at least 2. Without the data, Whop Agent's defaults stay.
 */
export function proposeAlerts(s: Snapshot, read: WhopAccountRead): AlertProposal {
  const weeks = 90 / 7;
  const base = Math.max(s.refundRate ?? -1, s.disputeRate ?? -1);
  const weeklyPayments = s.payments90d != null ? s.payments90d / weeks : null;
  let rateThreshold = DEFAULT_ALERTS.rateThreshold;
  let rateWhy = `Whop Agent's default. We couldn't count your payments to work out your usual rates.`;
  if (base >= 0 && s.payments90d && s.payments90d >= 30) {
    rateThreshold = Math.round(Math.min(0.25, Math.max(0.03, base * 2, base + 0.03)) * 100) / 100;
    const which = s.refundRate != null && (s.disputeRate == null || s.refundRate >= s.disputeRate) ? `refund rate of ${pctText(s.refundRate)}` : `dispute rate of ${pctText(s.disputeRate!)}`;
    rateWhy = `Your usual ${which} (${Math.round(s.payments90d)} payments in 90 days), doubled and at least 3 points higher.`;
  } else if (s.payments90d != null && s.payments90d < 30) {
    rateWhy = `Whop Agent's default. ${Math.round(s.payments90d)} payments in 90 days is too few to set it from your own rate.`;
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

  return { rateThreshold, alertThreshold, minSample: DEFAULT_ALERTS.minSample, why: { rate: rateWhy, alerts: alertWhy, sample: sampleWhy }, fromData: rateThreshold !== DEFAULT_ALERTS.rateThreshold || alertThreshold !== DEFAULT_ALERTS.alertThreshold };
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
