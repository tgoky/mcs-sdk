import { describe, it, expect, vi } from "vitest";

const now = new Date("2026-09-24T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
const rows: Record<string, Record<string, unknown>[]> = {};
vi.mock("@/lib/db", () => ({
  db: { select: () => ({ from: (t: { __t: string }) => ({ where: async () => rows[t.__t] ?? [] }) }) },
}));
vi.mock("@/models/schema", () => {
  const table = (name: string) => new Proxy({ __t: name }, { get: (o, k) => (k in o ? (o as Record<string, unknown>)[k as string] : { table: name, col: k }) });
  return Object.fromEntries(
    ["bookingRoster", "briefOutcomeLog", "coldOpenLeads", "coldOpenReplies", "pendingActions", "pileOnSendLog", "repIncidents", "repRedditMentions", "repTrustpilotReviews", "repTwitterMentions", "repWebFindings", "whopChangeLedger", "reminderHoldouts", "reviewRequests", "whopPayments", "winBackEnrollments"].map((n) => [n, table(n)])
  );
});
vi.mock("drizzle-orm", () => ({ and: () => ({}), eq: () => ({}), gte: () => ({}), lt: () => ({}), inArray: () => ({}) }));

import { getClientResults, offerPriceValue, productResults, emptyCounts, addCounts, portfolioShowRate, type ClientResults } from "@/features/reports/server/client-results";

describe("client results", () => {
  it("counts each window separately and works out rates from the counts", async () => {
    rows.bookingRoster = [
      { engagementId: "e1", at: daysAgo(3) },
      { engagementId: "e1", at: daysAgo(10) },
      { engagementId: "e1", at: daysAgo(40) },
    ];
    // First month (days 90-61): 12 outcomes, 6 showed = 50% baseline. Last 30 days: 8 of 10 showed.
    rows.briefOutcomeLog = [
      ...Array.from({ length: 12 }, (_, i) => ({ engagementId: "e1", at: daysAgo(90 - i), outcome: i < 6 ? "showed" : "no_show" })),
      ...Array.from({ length: 10 }, (_, i) => ({ engagementId: "e1", at: daysAgo(20 - i), outcome: i < 8 ? "showed" : "no_show" })),
    ];
    rows.coldOpenLeads = [...Array.from({ length: 20 }, () => ({ engagementId: "e1", at: daysAgo(5), status: "pushed" })), { engagementId: "e1", at: daysAgo(5), status: "dry_run" }];
    rows.coldOpenReplies = [
      { engagementId: "e1", at: daysAgo(4), disposition: "interested" },
      { engagementId: "e1", at: daysAgo(4), disposition: "not_now" },
      { engagementId: "e1", at: daysAgo(4), disposition: "auto_reply" },
    ];
    rows.repWebFindings = [
      { engagementId: "e1", at: daysAgo(2), source: "google_reviews", rating: 1, ownerAnswered: true, sentiment: "negative" },
      { engagementId: "e1", at: daysAgo(2), source: "google_reviews", rating: 5, ownerAnswered: false, sentiment: "positive" },
      { engagementId: "e1", at: daysAgo(2), source: "news", rating: null, ownerAnswered: null, sentiment: "neutral" },
      { engagementId: "e1", at: daysAgo(1), source: "google_reviews", rating: 5, ownerAnswered: false, sentiment: "positive", author: "Sam  Lee", publishedAt: daysAgo(3) },
    ];
    rows.reviewRequests = [
      { engagementId: "e1", at: daysAgo(8), name: "sam lee" },
      { engagementId: "e1", at: daysAgo(6), name: "Jo Park" },
    ];
    rows.pendingActions = [
      { engagementId: "e1", at: daysAgo(6), actionType: "whop_cancellation_offer_create", status: "approved" },
      { engagementId: "e1", at: daysAgo(6), actionType: "whop_cancellation_offer_create", status: "pending" },
    ];
    rows.whopChangeLedger = [
      { engagementId: "e1", at: daysAgo(5), eventType: "membership.cancel_at_period_end_changed", changedFields: { cancel_at_period_end: { previous: true, current: false } } },
      { engagementId: "e1", at: daysAgo(5), eventType: "membership.cancel_at_period_end_changed", changedFields: { cancel_at_period_end: { previous: false, current: true } } },
    ];
    rows.pileOnSendLog = [{ engagementId: "e1", at: daysAgo(1), latencyMs: 40_000, error: null }];
    rows.whopPayments = [{ engagementId: "e1", at: daysAgo(2) }, { engagementId: "e1", at: daysAgo(45) }];

    const [r] = await getClientResults([{ engagementId: "e1", buyer: "Mudd", offerPrice: "$1,500" }], now);
    const metric = (product: string, key: string) => r.products.find((p) => p.product === product)!.metrics.find((m) => m.key === key)!;

    expect(metric("showtime", "booked")).toMatchObject({ current: 2, previous: 1 });
    expect(metric("showtime", "showRate").current).toBeCloseTo(0.8);
    expect(metric("showtime", "firstText").current).toBe(40_000);
    // Dry runs aren't contact, and auto-replies aren't replies.
    expect(metric("cold-open", "contacted").current).toBe(20);
    expect(metric("cold-open", "replyRate").current).toBeCloseTo(2 / 20);
    expect(metric("cold-open", "interested").current).toBe(1);
    expect(metric("reputation", "newReviews").current).toBe(3);
    expect(metric("reputation", "reviewAsks").current).toBe(2);
    // Sam was asked 8 days ago and reviewed 3 days ago; Jo hasn't reviewed.
    expect(metric("reputation", "reviewsAfterAsking").current).toBe(1);
    expect(metric("reputation", "avgRating").current).toBeCloseTo(11 / 3);
    expect(metric("reputation", "badAnswered").current).toBe(1);
    expect(metric("reputation", "mentions").current).toBe(1);
    // Only approved offers were sent; only a cancellation turned off counts as staying.
    expect(metric("whop", "saveOffers").current).toBe(1);
    expect(metric("whop", "stayed").current).toBe(1);
    expect(metric("whop", "recovered")).toMatchObject({ current: 1, previous: 1 });

    // Then vs now: 50% in the first month, 80% now, over 10 outcomes = 3 extra shows at $1,500.
    expect(r.showRate).toMatchObject({ baseline: 0.5, current: 0.8, extraShows: 3, estimatedValue: 4500, offerPrice: "$1,500" });
  });

  it("gives no baseline without enough of a first month", async () => {
    for (const k of Object.keys(rows)) delete rows[k];
    rows.briefOutcomeLog = Array.from({ length: 5 }, (_, i) => ({ engagementId: "e1", at: daysAgo(5 + i), outcome: "showed" }));
    const [r] = await getClientResults([{ engagementId: "e1", buyer: "Mudd", offerPrice: null }], now);
    expect(r.showRate).toBeNull();
  });

  it("shows only products with activity, and sums rates across clients properly", () => {
    expect(productResults(emptyCounts(), emptyCounts())).toEqual([]);
    const a = { ...emptyCounts(), showed: 9, noShow: 1 };
    const b = { ...emptyCounts(), showed: 1, noShow: 9 };
    const total = addCounts(a, b);
    const rate = productResults(total, emptyCounts())[0].metrics.find((m) => m.key === "showRate")!;
    expect(rate.current).toBe(0.5);
  });

  it("reads an offer price only when it's a plain amount", () => {
    expect(offerPriceValue("$2,000")).toBe(2000);
    expect(offerPriceValue("1.5k")).toBe(1500);
    expect(offerPriceValue("Free")).toBeNull();
    expect(offerPriceValue(null)).toBeNull();
  });
  it("adds up the portfolio's then-vs-now without one client cancelling another", () => {
    const client = (showed: number, noShow: number, baseline: number, extraShows: number, estimatedValue: number | null): ClientResults => ({
      engagementId: "e",
      buyer: "b",
      current: { ...emptyCounts(), showed, noShow },
      previous: emptyCounts(),
      products: [],
      showRate: { baseline, current: showed / (showed + noShow), extraShows, estimatedValue, offerPrice: null },
      holdout: null,
    });
    const none: ClientResults = { ...client(1, 0, 0, 0, null), showRate: null };
    expect(portfolioShowRate([none])).toBeNull();
    const out = portfolioShowRate([client(8, 2, 0.5, 3, 4500), client(3, 7, 0.5, 0, null), none])!;
    expect(out.clients).toBe(2);
    expect(out.baseline).toBeCloseTo(0.5);
    expect(out.current).toBeCloseTo(11 / 20);
    expect(out.extraShows).toBe(3);
    expect(out.estimatedValue).toBe(4500);
  });
});
