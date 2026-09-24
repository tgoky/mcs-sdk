import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn() }));

import { WHOP_METRICS, findMetric, formatMetricValue, lastFullWeek, statsQuery, summarizePoints, type WhopStatsCatalogEntry } from "@/lib/whop-agent/stats";
import { riskRates } from "@/features/whop-agent/server/risk-window";
import { evaluateVelocity, thresholdsFrom } from "@/features/whop-agent/server/refund-dispute-velocity-service";

const catalog: WhopStatsCatalogEntry[] = [
  { key: "net_revenue", name: "Net revenue", unit: "currency" },
  { key: "mrr", name: "Monthly recurring revenue", unit: "currency", windows: ["1d", "30d"] },
  { key: "churn", name: "Churn rate", unit: "percent" },
  { key: "payments_succeeded", name: "Successful payments", unit: "count" },
  { key: "refunds", name: "Refund rate", unit: "count" },
];

describe("findMetric", () => {
  it("prefers a known key, then a matching name, and never a different unit", () => {
    expect(findMetric(catalog, WHOP_METRICS.netRevenue)?.key).toBe("net_revenue");
    expect(findMetric(catalog, WHOP_METRICS.churnRate)?.key).toBe("churn");
    expect(findMetric(catalog, WHOP_METRICS.successfulPayments)?.key).toBe("payments_succeeded");
    // "Refund rate" here is a count, so it isn't taken for the percent metric.
    expect(findMetric(catalog, WHOP_METRICS.refundRate)).toBeNull();
    expect(findMetric(catalog, WHOP_METRICS.arr)).toBeNull();
  });
});

describe("summarizePoints", () => {
  it("adds counts up, keeps a level's latest value, and reads Whop's percent as a fraction", () => {
    const pts = [{ value: 2 }, { value: null }, { value: 3 }];
    expect(summarizePoints(pts, { aggregate: "sum", unit: "count" })).toBe(5);
    expect(summarizePoints(pts, { aggregate: "latest", unit: "currency" })).toBe(3);
    expect(summarizePoints([{ value: 1.6 }], { aggregate: "latest", unit: "percent" })).toBeCloseTo(0.016);
    expect(summarizePoints([{ value: null }], { aggregate: "sum", unit: "count" })).toBeNull();
  });
});

describe("statsQuery", () => {
  const from = new Date("2026-09-01T00:00:00Z");
  const to = new Date("2026-10-01T00:00:00Z");
  it("scopes every query to the account", () => {
    expect(statsQuery(catalog[0], "biz_1", from, to, "week")).toEqual({ account_id: "biz_1", from: from.toISOString(), to: to.toISOString(), interval: "week" });
  });
  it("reads snapshot metrics by day over a trailing window", () => {
    expect(statsQuery(catalog[1], "biz_1", from, to, "week")).toMatchObject({ interval: "day", snapshot_window: "30d" });
  });
});

describe("lastFullWeek", () => {
  it("is the Monday-to-Sunday week before now, in UTC", () => {
    const { from, to } = lastFullWeek(new Date("2026-09-24T15:00:00Z")); // a Thursday
    expect(from.toISOString()).toBe("2026-09-14T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-09-20T23:59:59.999Z");
    expect(lastFullWeek(new Date("2026-09-21T01:00:00Z")).from.toISOString()).toBe("2026-09-14T00:00:00.000Z");
  });
});

describe("formatMetricValue", () => {
  it("shows money as a decimal amount, not cents", () => {
    expect(formatMetricValue(1234.5, "currency", "usd")).toBe("$1,234.50");
    expect(formatMetricValue(0.016, "percent")).toBe("1.6%");
    expect(formatMetricValue(12.4, "count")).toBe("12");
  });
});

describe("refund and dispute alerts", () => {
  const t = thresholdsFrom(null);

  it("has a dispute level well below the refund level by default", () => {
    expect(t).toEqual({ refundRate: 0.08, disputeRate: 0.0075, disputeAlerts: 3, minSample: 10 });
    expect(thresholdsFrom({ refund_dispute_rate_threshold: 0.1, dispute_rate_threshold: 0.005 })).toMatchObject({ refundRate: 0.1, disputeRate: 0.005 });
  });

  it("flags a 1% dispute rate that the old shared 8% level let through", () => {
    const alerts = evaluateVelocity({ payments: 200, refunds: { count: 4, more: false }, disputes: 2, disputeAlerts: { count: 0, more: false } }, t);
    expect(alerts.map((a) => a.metric)).toEqual(["dispute_rate"]);
    expect(alerts[0].body).toContain("1.00% of payments disputed");
  });

  it("checks each rate against its own level", () => {
    const alerts = evaluateVelocity({ payments: 100, refunds: { count: 9, more: false }, disputes: 0, disputeAlerts: { count: 3, more: false } }, t);
    expect(alerts.map((a) => a.metric)).toEqual(["refund_rate", "dispute_alerts"]);
  });

  it("skips rates below the payment sample, but still counts dispute alerts", () => {
    const alerts = evaluateVelocity({ payments: 4, refunds: { count: 2, more: false }, disputes: 1, disputeAlerts: { count: 5, more: true } }, t);
    expect(alerts.map((a) => a.metric)).toEqual(["dispute_alerts"]);
    expect(alerts[0].body).toContain("5+ dispute alerts");
  });

  it("can't make a rate without payments", () => {
    expect(riskRates({ payments: null, refunds: { count: 3, more: false }, disputes: 1 })).toEqual({ refundRate: null, disputeRate: null });
    expect(evaluateVelocity({ payments: null, refunds: null, disputes: null, disputeAlerts: null }, t)).toEqual([]);
  });
});
