import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { whopApiUrl } from "@/lib/whop-agent/url";
import { readWhopAccount } from "@/lib/whop-setup/reader";
import { eventsFor, existingCancelDiscount, mrrFromPlans, proposeAlerts, snapshotOf, topReasons, webhookProblems } from "@/lib/whop-setup/analyze";
import { buildWhopProposal } from "@/lib/whop-setup/proposal";
import { parseWhopSetup, webhookEventsFor } from "@/lib/whop-setup/save";
import type { WhopAccountRead, WhopPlanRead } from "@/lib/whop-setup/types";

const plan = (over: Partial<WhopPlanRead>): WhopPlanRead => ({
  id: "plan_1",
  title: "Monthly",
  productTitle: "Club",
  planType: "renewal",
  visibility: "visible",
  currency: "usd",
  initialPrice: 0,
  renewalPrice: 50,
  formattedPrice: "$50/mo",
  billingPeriodDays: 30,
  trialDays: null,
  memberCount: 100,
  cancelDiscount: null,
  ...over,
});

const baseRead = (over: Partial<WhopAccountRead> = {}): WhopAccountRead => ({
  accountId: "biz_1",
  readAt: "2026-09-01T00:00:00Z",
  plans: [plan({}), plan({ id: "plan_2", title: "Yearly", renewalPrice: 480, billingPeriodDays: 365, memberCount: 50 })],
  products: [{ id: "prod_1", title: "Club", memberCount: 150, rating: 4.6, reviews: 20 }],
  canceling: { count: 4, more: false, reasons: ["Too expensive", "too expensive ", "Not using it"], periodEnds: [] },
  newMembers30d: { count: 12, more: false },
  disputes90d: { total: 3, byStatus: null },
  disputeAlerts90d: { count: 12, more: false },
  refunds90d: { count: 30, more: false },
  promoCodes: [],
  affiliates: [],
  reviews: [],
  webhooks: [],
  metrics: [{ id: "payments", key: "payments", name: "Payments", unit: "count", value: 1000, days: 90, currency: null }],
  coverage: { read: [], blocked: [], failed: [] },
  ...over,
});

describe("whopApiUrl", () => {
  it("puts v1 under /api/v1, as Whop's official SDKs do, and leaves v2/v5 alone", () => {
    expect(whopApiUrl("/v1/plans")).toBe("https://api.whop.com/api/v1/plans");
    expect(whopApiUrl("/api/v2/memberships")).toBe("https://api.whop.com/api/v2/memberships");
    expect(whopApiUrl("/api/v1/stats/metric")).toBe("https://api.whop.com/api/v1/stats/metric");
  });
});

describe("readWhopAccount", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("pages with first/after under /api/v1 and reads what it can", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        urls.push(url);
        const u = new URL(url);
        const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
        if (u.pathname === "/api/v1/plans") {
          return u.searchParams.get("after")
            ? json({ data: [{ id: "plan_b", plan_type: "renewal", renewal_price: 20, billing_period: 30, member_count: 5, currency: "usd" }], page_info: { has_next_page: false, end_cursor: null } })
            : json({ data: [{ id: "plan_a", plan_type: "renewal", renewal_price: 10, billing_period: 30, member_count: 10, currency: "usd", offer_cancel_discount: true, cancel_discount_percentage: 25, cancel_discount_intervals: 2 }], page_info: { has_next_page: true, end_cursor: "c1" } });
        }
        if (u.pathname === "/api/v1/memberships" && u.searchParams.get("status") === "canceling") return json({ data: [{ cancellation_reason: "Too pricey" }], page_info: { has_next_page: false } });
        if (u.pathname === "/api/v1/disputes/summary") return json({ total: 2, groups: { status: { won: 1, lost: 1 } } });
        if (u.pathname === "/api/v1/refunds") return json({ error: "nope" }, 403);
        if (u.pathname === "/api/v1/stats") return json({ data: [{ key: "mrr", name: "MRR", unit: "currency", properties: [] }] });
        if (u.pathname === "/api/v1/stats/mrr") return json({ data: { currency: "usd", points: [{ timestamp: 1, value: 180 }, { timestamp: 2, value: 200 }] } });
        return json({ data: [], page_info: { has_next_page: false } });
      })
    );
    const read = await readWhopAccount("apik_x", "biz_1", Date.parse("2026-09-01T00:00:00Z"));
    expect(urls.every((u) => u.startsWith("https://api.whop.com/api/v1/"))).toBe(true);
    expect(urls.some((u) => /\/plans\?.*first=100.*after=c1/.test(u))).toBe(true);
    expect(urls.some((u) => /limit=/.test(u))).toBe(false);
    expect(read.plans.map((p) => p.id)).toEqual(["plan_a", "plan_b"]);
    expect(read.plans[0].cancelDiscount).toEqual({ percentage: 25, intervals: 2 });
    expect(read.canceling?.reasons).toEqual(["Too pricey"]);
    expect(read.disputes90d).toEqual({ total: 2, byStatus: { won: 1, lost: 1 } });
    expect(read.refunds90d).toBeNull();
    expect(read.coverage.blocked).toContain("refunds");
    expect(read.metrics).toEqual([{ id: "mrr", key: "mrr", name: "MRR", unit: "currency", value: 200, days: 30, currency: "usd" }]);
  });
});

describe("analysis", () => {
  it("estimates MRR from renewal plans, scaled to 30 days", () => {
    expect(mrrFromPlans(baseRead().plans)).toEqual({ value: 5000 + Math.round((480 * 50 * 30) / 365), currency: "usd" });
    expect(mrrFromPlans([plan({ planType: "one_time" })])).toBeNull();
  });

  it("reads rates against the payment count", () => {
    const s = snapshotOf(baseRead());
    expect(s.refundRate).toBeCloseTo(0.03);
    expect(s.disputeRate).toBeCloseTo(0.003);
    expect(s.members).toBe(150);
    expect(s.mrr?.source).toBe("plans");
    expect(snapshotOf(baseRead({ metrics: [{ id: "churn", key: "churn_rate", name: "Churn", unit: "percent", value: 0.008, days: 30, currency: null }] })).churn).toBe(0.008);
  });

  it("proposes alerts from the client's own rates and explains them", () => {
    const read = baseRead();
    const a = proposeAlerts(snapshotOf(read), read);
    // Refunds: max(3% x 2, 3% + 3 points) = 6%.
    expect(a.refundRate).toBe(0.06);
    expect(a.why.refund).toContain("refund rate is 3.0%");
    // Disputes are separate: 3 on 1,000 payments = 0.3%, doubled = 0.6%, kept under 0.75%.
    expect(a.disputeRate).toBe(0.006);
    expect(a.why.dispute).toContain("0.30%");
    // 12 alerts in 90 days is about 0.9 a week; doubled and rounded up.
    expect(a.alertThreshold).toBe(2);
    expect(a.fromData).toBe(true);
  });

  it("keeps the defaults when payments can't be counted or are too few", () => {
    const noPayments = baseRead({ metrics: [] });
    const none = proposeAlerts(snapshotOf(noPayments), noPayments);
    expect([none.refundRate, none.disputeRate]).toEqual([0.08, 0.0075]);
    const few = baseRead({ metrics: [{ id: "payments", key: "p", name: "P", unit: "count", value: 20, days: 90, currency: null }] });
    const a = proposeAlerts(snapshotOf(few), few);
    expect(a.refundRate).toBe(0.08);
    expect(a.disputeRate).toBe(0.0075);
    expect(a.why.refund).toContain("20 payments in 90 days is too few");
    expect(a.why.sample).toContain("about 2 payments a week");
  });

  it("never lets a low dispute level drift up to the refund level, and warns a client already near 1%", () => {
    const high = baseRead({ disputes90d: { total: 12, byStatus: null } });
    const a = proposeAlerts(snapshotOf(high), high);
    // 12 on 1,000 = 1.2%: alert a quarter higher, 1.5%, with a warning.
    expect(a.disputeRate).toBe(0.015);
    expect(a.why.dispute).toContain("already 1.2%, at or above");
    const zero = baseRead({ disputes90d: { total: 0, byStatus: null } });
    expect(proposeAlerts(snapshotOf(zero), zero).disputeRate).toBe(0.0025);
  });

  it("only reuses a cancel discount when the plans agree, and months only on monthly plans", () => {
    expect(existingCancelDiscount([plan({ cancelDiscount: { percentage: 30, intervals: 2 } })])).toEqual({ percentage: 30, months: 2, plans: ["Monthly"] });
    expect(existingCancelDiscount([plan({ cancelDiscount: { percentage: 30, intervals: 2 }, billingPeriodDays: 365 })])?.months).toBeNull();
    expect(existingCancelDiscount([plan({ cancelDiscount: { percentage: 30, intervals: 1 } }), plan({ id: "p2", cancelDiscount: { percentage: 20, intervals: 1 } })])).toBeNull();
  });

  it("groups cancel reasons", () => {
    expect(topReasons(["Too expensive", "too expensive ", "Not using it"])).toEqual([
      { reason: "Too expensive", count: 2 },
      { reason: "Not using it", count: 1 },
    ]);
  });

  it("finds duplicate, unpinned and failing webhooks", () => {
    const hook = { id: "h1", url: "https://x.io/a", events: ["payment.succeeded"], enabled: true, apiVersionDate: "2026-01-01", failures: 0, disabledReason: null };
    const problems = webhookProblems(baseRead({ webhooks: [hook, { ...hook, id: "h2" }, { ...hook, id: "h3", url: "https://y.io", apiVersionDate: null, failures: 4 }] }), (u, e) => `${u}|${e.join(",")}`);
    expect(problems.map((p) => p.kind).sort()).toEqual(["duplicate", "failing", "unpinned"]);
  });

  it("asks Whop only for the events the chosen workers use", () => {
    expect(eventsFor(["whop-weekly-ops-report"])).toEqual([]);
    expect(eventsFor(["whop-cancellation-save-offer", "whop-dispute-response"])).toEqual(["dispute.created", "dispute_alert.created", "membership.cancel_at_period_end_changed"]);
  });
});

describe("buildWhopProposal", () => {
  const input = { probe: { accounts: { ok: true }, webhooks: { ok: false }, payments: { ok: false } }, agentEvents: null, receiverUrl: "https://app/api/webhooks/whop-agent/e1", ghlConnected: true, groupKey: (u: string, e: string[]) => `${u}|${e.join(",")}` };

  it("pre-fills only the client's own discount, never the message", () => {
    const read = baseRead({ plans: [plan({ cancelDiscount: { percentage: 30, intervals: 2 } })] });
    const p = buildWhopProposal({ ...input, read, stack: {} });
    expect(p.saveOffer).toMatchObject({ discount: 30, months: 2, message: "" });
    expect(p.saveOffer.source).toContain("Monthly");
    expect(p.saveOffer.evidence[0]).toBe("4 members are set to cancel at the end of their period.");
    expect(buildWhopProposal({ ...input, read: baseRead(), stack: {} }).saveOffer.discount).toBeNull();
  });

  it("lets saved settings win", () => {
    const p = buildWhopProposal({ ...input, read: baseRead(), stack: { whop_save_offer_discount_percentage: 10, whop_save_offer_duration_months: 1, whop_save_offer_message: "Stay!", refund_dispute_rate_threshold: 0.12 } });
    expect(p.saveOffer).toMatchObject({ discount: 10, months: 1, message: "Stay!", source: null });
    expect(p.alerts).toMatchObject({ refundRate: 0.12, disputeRate: 0.006, alertThreshold: 2, saved: true });
  });

  it("names locked areas except the ones a standard key never has", () => {
    const p = buildWhopProposal({ ...input, read: null, stack: {} });
    expect(p.locked.map((l) => l.label)).toEqual(["Webhooks"]);
  });

  it("leaves the agent's own webhook out of the problems", () => {
    const own = { id: "h1", url: input.receiverUrl, events: [], enabled: true, apiVersionDate: null, failures: 0, disabledReason: null };
    expect(buildWhopProposal({ ...input, read: baseRead({ webhooks: [own] }), stack: {} }).webhook.problems).toEqual([]);
  });
});

describe("parseWhopSetup", () => {
  const alerts = { refundRate: 0.06, disputeRate: 0.006, alertThreshold: 2, minSample: 10 };

  it("takes a full save offer or none, never a partial one", () => {
    expect(parseWhopSetup({ skills: [], alerts, saveOffer: { discount: "30", months: "2", message: " Stay " } })).toMatchObject({ saveOffer: { discount: 30, months: 2, message: "Stay", minTenureDays: null } });
    expect(parseWhopSetup({ skills: [], alerts, saveOffer: null })).toMatchObject({ saveOffer: null });
    expect(parseWhopSetup({ skills: [], alerts, saveOffer: { discount: 30, months: 2 } })).toEqual({ error: "Write the message members see with the save offer, or clear the discount and length." });
    expect(parseWhopSetup({ skills: [], alerts, saveOffer: { discount: 130, months: 2, message: "x" } })).toHaveProperty("error");
  });

  it("checks the alert levels and keeps only real worker ids", () => {
    expect(parseWhopSetup({ skills: [], alerts: { ...alerts, refundRate: 0.9 } })).toHaveProperty("error");
    expect(parseWhopSetup({ skills: [], alerts: { ...alerts, disputeRate: 0.08 } })).toEqual({ error: "The dispute alert level must be between 0.1% and 5%." });
    const r = parseWhopSetup({ skills: ["whop-dispute-response", "nope"], alerts });
    expect(r).toMatchObject({ skills: ["whop-dispute-response"] });
  });

  it("only subscribes the save offer and bridge when they have something to do", () => {
    const base = { skills: ["whop-cancellation-save-offer", "whop-bridge-manager"], alerts, saveOffer: null, bridgeUrl: "" };
    expect(webhookEventsFor(base)).toEqual([]);
    expect(webhookEventsFor({ ...base, bridgeUrl: "https://hooks.example.com" })).toContain("payment.succeeded");
  });
});
