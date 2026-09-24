// src/lib/whop-agent/stats.ts
//
// Whop's Stats API as its official SDK defines it (@whop/sdk 1.1.5,
// whop_sdk for Python; unchanged since 0.0.42 in July 2026):
//   GET /api/v1/stats            the metric catalog: key, name, unit, properties, windows
//   GET /api/v1/stats/{metric}   ?account_id&from&to&interval -> data.points[{timestamp, value}]
// Units: count is an integer, currency is a decimal amount (not cents),
// percent is a number where 1.6 means 1.6%.
//
// It replaced /stats/metric?resource=...&company_id, which was in Whop's
// API definition only from 21 Aug to 14 Sep 2026 (whopio/whopsdk-typescript
// #64 added it, #148 removed it). Whop doesn't publish the metric keys
// beyond net_revenue as an example ("Use GET /stats to see every metric
// key"), so each metric is found in the account's own catalog: by known
// key first, then by name, and only when the unit matches. A metric the
// catalog doesn't have is reported as unavailable, never guessed.
// Pure; the client does the requests.

export interface WhopStatsCatalogEntry {
  key: string;
  name: string;
  description?: string;
  unit: "count" | "currency" | "percent";
  properties?: string[];
  /** Snapshot metrics only: the trailing windows they accept. */
  windows?: string[];
}

export interface WhopMetricWant {
  label: string;
  unit: WhopStatsCatalogEntry["unit"];
  /** Keys to try first, in order. */
  keys: string[];
  /** Then any catalog name or key matching this. */
  match: RegExp;
  /** A count or amount adds up over the window; a level or rate is its latest value. */
  aggregate: "sum" | "latest";
}

export const WHOP_METRICS = {
  netRevenue: { label: "Net revenue", unit: "currency", keys: ["net_revenue"], match: /\bnet[ _]revenue\b/i, aggregate: "sum" },
  grossRevenue: { label: "Gross revenue", unit: "currency", keys: ["gross_revenue", "gross_volume"], match: /\bgross[ _](revenue|volume|sales)\b/i, aggregate: "sum" },
  mrr: { label: "MRR", unit: "currency", keys: ["mrr", "monthly_recurring_revenue"], match: /\bmrr\b|monthly[ _]recurring/i, aggregate: "latest" },
  arr: { label: "ARR", unit: "currency", keys: ["arr", "annual_recurring_revenue"], match: /\barr\b|annual[ _]recurring/i, aggregate: "latest" },
  churnRate: { label: "Churn rate", unit: "percent", keys: ["churn_rate", "churn"], match: /churn/i, aggregate: "latest" },
  newMembers: { label: "New subscribers", unit: "count", keys: ["new_members", "new_users", "new_customers"], match: /\bnew[ _](members|users|customers|subscribers)\b/i, aggregate: "sum" },
  newMemberships: { label: "New memberships", unit: "count", keys: ["new_memberships"], match: /\bnew[ _]memberships\b/i, aggregate: "sum" },
  trialConversion: { label: "Trial conversion rate", unit: "percent", keys: ["trial_conversion_rate", "trial_conversion"], match: /trial[ _]conversion/i, aggregate: "latest" },
  arpu: { label: "Average revenue per user", unit: "currency", keys: ["arpu", "average_revenue_per_user"], match: /\barpu\b|revenue[ _]per[ _](user|member|customer)/i, aggregate: "latest" },
  refundRate: { label: "Refund rate", unit: "percent", keys: ["refund_rate"], match: /\brefund[ _]rate\b/i, aggregate: "latest" },
  disputeRate: { label: "Dispute rate", unit: "percent", keys: ["dispute_rate"], match: /\bdispute[ _]rate\b/i, aggregate: "latest" },
  processingFees: { label: "Processing fees", unit: "currency", keys: ["processing_fees", "fees"], match: /\bprocessing[ _]fees\b/i, aggregate: "sum" },
  successfulPayments: { label: "Successful payments", unit: "count", keys: ["successful_payments", "payments"], match: /\bsuccessful[ _]payments\b|^payments$/i, aggregate: "sum" },
  disputeAlerts: { label: "Dispute alerts", unit: "count", keys: ["dispute_alerts"], match: /\bdispute[ _]alerts\b/i, aggregate: "sum" },
} satisfies Record<string, WhopMetricWant>;

export type WhopMetricId = keyof typeof WHOP_METRICS;

/** The catalog entry for a metric: a known key first, then by name, same unit only. */
export function findMetric(catalog: WhopStatsCatalogEntry[], want: WhopMetricWant): WhopStatsCatalogEntry | null {
  const sameUnit = catalog.filter((m) => m.unit === want.unit);
  for (const key of want.keys) {
    const hit = sameUnit.find((m) => m.key === key);
    if (hit) return hit;
  }
  return sameUnit.find((m) => want.match.test(m.key) || want.match.test(m.name)) ?? null;
}

/** One number from a series, in plain terms: a percent comes back as a
 * fraction (Whop's 1.6 is 0.016), currency as a decimal amount. Null when
 * no point has a value. */
export function summarizePoints(points: { value: number | null }[], want: Pick<WhopMetricWant, "aggregate" | "unit">): number | null {
  const values = points.map((p) => p.value).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (values.length === 0) return null;
  const raw = want.aggregate === "sum" ? values.reduce((a, b) => a + b, 0) : values[values.length - 1];
  return want.unit === "percent" ? raw / 100 : raw;
}

/** The query string for GET /stats/{metric}. Snapshot metrics (those with
 * windows) are day-only and read a trailing window. */
export function statsQuery(entry: WhopStatsCatalogEntry, accountId: string, from: Date, to: Date, interval: "day" | "week" | "month"): Record<string, string> {
  const q: Record<string, string> = { account_id: accountId, from: from.toISOString(), to: to.toISOString() };
  if (entry.windows?.length) {
    q.interval = "day";
    const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000));
    const window = entry.windows.find((w) => w === `${days}d`) ?? entry.windows[0];
    q.snapshot_window = window;
  } else {
    q.interval = interval;
  }
  return q;
}

/** The last full Monday-to-Sunday week before `now`, in UTC. */
export function lastFullWeek(now: Date): { from: Date; to: Date } {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  const to = new Date(d.getTime() - sinceMonday * 86_400_000);
  return { from: new Date(to.getTime() - 7 * 86_400_000), to: new Date(to.getTime() - 1) };
}

/** A metric value for people: money with its currency, a rate as a percent. */
export function formatMetricValue(value: number, unit: WhopStatsCatalogEntry["unit"], currency: string | null = null): string {
  if (unit === "percent") return `${(value * 100).toFixed(1)}%`;
  if (unit === "currency") {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: (currency ?? "usd").toUpperCase(), maximumFractionDigits: 2 }).format(value);
    } catch {
      return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${(currency ?? "").toUpperCase()}`.trim();
    }
  }
  return Math.round(value).toLocaleString();
}
