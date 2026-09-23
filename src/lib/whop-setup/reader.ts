// src/lib/whop-setup/reader.ts
//
// Reads a client's Whop business in depth for Whop Agent's setup: every
// plan and product, members set to cancel and why, new members, disputes,
// dispute alerts and refunds over 90 days, promo codes, affiliates,
// reviews, existing webhooks, and revenue metrics from the stats API.
// Read-only GETs.
//
// Endpoints, parameters and fields are taken from Whop's official SDK
// (@whop/sdk 1.1.5, and whop_sdk for Python): base https://api.whop.com/api/v1,
// cursor paging with first/after and page_info { end_cursor, has_next_page },
// list payloads under `data`.
//   GET /plans?account_id                 prices, billing_period, member_count, cancel discount
//   GET /products?account_id              title, member_count, average_review_rating
//   GET /memberships?status=canceling     cancel_at_period_end, cancellation_reason
//   GET /memberships?created_after        new members
//   GET /disputes/summary?created_after   total and by status
//   GET /dispute_alerts?created_after     count
//   GET /refunds?created_after            count
//   GET /promo_codes?account_id&status    code, uses, amount_off, promo_type
//   GET /affiliates?account_id            referrals, revenue
//   GET /reviews?product_id               stars, title, description
//   GET /webhooks?account_id              url, events, api_version_date, failures
//   GET /stats                            the metric catalog (key, name, unit)
//   GET /stats/{metric}?account_id&from&to  data.points / data.totals

import { AccountReader, type Raw } from "@/lib/account-intel/reader";
import { whopApiUrl } from "@/lib/whop-agent/url";
import type { WhopAccountRead, WhopMetric } from "./types";

const PAGE = 100;
const DAY = 86_400_000;

function qs(query: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Every page of a cursor-paged list, up to maxPages. `more` is true when
 * the list goes on past what was read. */
async function listAll(r: AccountReader, part: string, path: string, query: Record<string, string | number | undefined>, maxPages: number): Promise<{ items: Raw[]; more: boolean } | null> {
  const items: Raw[] = [];
  let after: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const body = await r.json<Raw>(part, whopApiUrl(`/v1${path}${qs({ ...query, first: PAGE, after })}`));
    if (!body) return page === 0 ? null : { items, more: true };
    items.push(...(Array.isArray(body.data) ? body.data : []));
    const info = body.page_info;
    if (!info?.has_next_page || !info.end_cursor) return { items, more: false };
    after = info.end_cursor;
  }
  return { items, more: true };
}

// Which catalog metric answers each question, by key or name.
const METRIC_MATCH: { id: WhopMetric["id"]; test: RegExp; unit?: string }[] = [
  { id: "mrr", test: /\bmrr\b|monthly[ _]recurring/i, unit: "currency" },
  { id: "churn", test: /churn/i, unit: "percent" },
  { id: "payments", test: /successful[ _]payments|payments[ _]count|^payments$/i, unit: "count" },
];

async function readMetrics(r: AccountReader, accountId: string, now: number): Promise<WhopMetric[]> {
  const catalog = await r.json<Raw>("revenue stats", whopApiUrl(`/v1/stats`));
  const list: Raw[] = Array.isArray(catalog?.data) ? catalog.data : [];
  const out: WhopMetric[] = [];
  for (const m of METRIC_MATCH) {
    const hit = list.find((x) => (m.unit ? x.unit === m.unit : true) && (m.test.test(String(x.key ?? "")) || m.test.test(String(x.name ?? ""))));
    if (!hit?.key) continue;
    const days = m.id === "payments" ? 90 : 30;
    const body = await r.json<Raw>(
      "revenue stats",
      whopApiUrl(`/v1/stats/${encodeURIComponent(hit.key)}${qs({ account_id: accountId, from: new Date(now - days * DAY).toISOString(), to: new Date(now).toISOString(), interval: days === 90 ? "week" : "day" })}`)
    );
    const points: Raw[] = Array.isArray(body?.data?.points) ? body.data.points : [];
    const values = points.map((p) => p?.value).filter((v): v is number => typeof v === "number");
    if (values.length === 0) continue;
    // A count adds up over the window; a level (MRR, a rate) is its latest value.
    const value = m.unit === "count" ? values.reduce((a, b) => a + b, 0) : values[values.length - 1];
    out.push({ id: m.id, key: String(hit.key), name: String(hit.name ?? hit.key), unit: hit.unit, value, days, currency: body?.data?.currency ?? null });
  }
  return out;
}

export async function readWhopAccount(apiKey: string, accountId: string, now = Date.now()): Promise<WhopAccountRead> {
  const r = new AccountReader({ Authorization: `Bearer ${apiKey}` });
  const since90 = new Date(now - 90 * DAY).toISOString();
  const since30 = new Date(now - 30 * DAY).toISOString();

  const [plans, products, canceling, joined, disputes, alerts, refunds, promos, affiliates, webhooks, metrics] = await Promise.all([
    listAll(r, "plans", "/plans", { account_id: accountId }, 5),
    listAll(r, "products", "/products", { account_id: accountId }, 3),
    listAll(r, "members cancelling", "/memberships", { account_id: accountId, status: "canceling" }, 5),
    listAll(r, "new members", "/memberships", { account_id: accountId, created_after: since30 }, 10),
    r.json<Raw>("disputes", whopApiUrl(`/v1/disputes/summary${qs({ account_id: accountId, created_after: since90, groups: "status" })}`)),
    listAll(r, "dispute alerts", "/dispute_alerts", { account_id: accountId, created_after: since90 }, 5),
    listAll(r, "refunds", "/refunds", { account_id: accountId, created_after: since90 }, 10),
    listAll(r, "promo codes", "/promo_codes", { account_id: accountId, status: "active" }, 3),
    listAll(r, "affiliates", "/affiliates", { account_id: accountId }, 2),
    listAll(r, "webhooks", "/webhooks", { account_id: accountId }, 2),
    readMetrics(r, accountId, now),
  ]);

  // Reviews are per product: the five with the most members.
  const topProducts = [...(products?.items ?? [])].sort((a, b) => (b.member_count ?? 0) - (a.member_count ?? 0)).slice(0, 5);
  const reviewLists = await Promise.all(topProducts.map((p) => listAll(r, "reviews", "/reviews", { product_id: p.id }, 1).then((l) => ({ product: p, l }))));

  const counted = (l: { items: Raw[]; more: boolean } | null) => (l ? { count: l.items.length, more: l.more } : null);
  const disputeStatus = disputes?.groups?.status ?? null;

  return {
    accountId,
    readAt: new Date(now).toISOString(),
    plans: (plans?.items ?? []).map((p) => ({
      id: String(p.id),
      title: p.title ?? null,
      productTitle: p.product?.title ?? p.product?.name ?? null,
      planType: p.plan_type ?? null,
      visibility: p.visibility ?? null,
      currency: p.currency ?? null,
      initialPrice: typeof p.initial_price === "number" ? p.initial_price : null,
      renewalPrice: typeof p.renewal_price === "number" ? p.renewal_price : null,
      formattedPrice: p.formatted_price ?? null,
      billingPeriodDays: typeof p.billing_period === "number" ? p.billing_period : null,
      trialDays: typeof p.trial_period_days === "number" ? p.trial_period_days : null,
      memberCount: typeof p.member_count === "number" ? p.member_count : null,
      cancelDiscount: p.offer_cancel_discount && typeof p.cancel_discount_percentage === "number" ? { percentage: p.cancel_discount_percentage, intervals: p.cancel_discount_intervals ?? null } : null,
    })),
    products: (products?.items ?? []).map((p) => ({
      id: String(p.id),
      title: String(p.title ?? p.id),
      memberCount: typeof p.member_count === "number" ? p.member_count : null,
      rating: typeof p.average_review_rating === "number" && p.published_reviews_count ? p.average_review_rating : null,
      reviews: typeof p.published_reviews_count === "number" ? p.published_reviews_count : null,
    })),
    canceling: canceling
      ? {
          count: canceling.items.length,
          more: canceling.more,
          reasons: canceling.items.map((m) => (typeof m.cancellation_reason === "string" ? m.cancellation_reason.trim() : "")).filter(Boolean).slice(0, 50),
          periodEnds: canceling.items.map((m) => m.renewal_period_end).filter((d): d is string => typeof d === "string"),
        }
      : null,
    newMembers30d: counted(joined),
    disputes90d: disputes && typeof disputes.total === "number" ? { total: disputes.total, byStatus: disputeStatus } : null,
    disputeAlerts90d: counted(alerts),
    refunds90d: counted(refunds),
    promoCodes: promos
      ? promos.items
          .map((c) => ({ code: c.code ?? null, uses: typeof c.uses === "number" ? c.uses : 0, amountOff: typeof c.amount_off === "number" ? c.amount_off : null, promoType: c.promo_type ?? null, churnedOnly: Boolean(c.churned_users_only) }))
          .sort((a, b) => b.uses - a.uses)
      : null,
    affiliates: affiliates
      ? affiliates.items
          .map((a) => ({ name: a.user?.name ?? a.user?.username ?? null, referrals: Number(a.total_referrals_count) || 0, revenueUsd: Number(a.total_revenue_usd) || 0 }))
          .sort((a, b) => b.revenueUsd - a.revenueUsd)
      : null,
    reviews: reviewLists.flatMap(({ product, l }) =>
      (l?.items ?? []).map((v) => ({ product: String(product.title ?? product.id), stars: Number(v.stars) || 0, title: v.title ?? null, text: v.description ?? null, at: v.published_at ?? v.created_at ?? null }))
    ),
    webhooks: webhooks
      ? webhooks.items.map((w) => ({
          id: String(w.id),
          url: String(w.url ?? ""),
          events: Array.isArray(w.events) ? w.events.map(String) : [],
          enabled: w.enabled !== false,
          apiVersionDate: w.api_version_date ?? null,
          failures: Number(w.consecutive_failures) || 0,
          disabledReason: w.disabled_reason ?? null,
        }))
      : null,
    metrics,
    coverage: r.coverage(),
  };
}
