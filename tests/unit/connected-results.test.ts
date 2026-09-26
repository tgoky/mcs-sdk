import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
import { computeConnectedResults, type ConnectedInputs } from "@/features/reports/server/connected-results";
import { funnelSteps } from "@/components/analytics/connected-results-card";
import type { TimelineProduct } from "@/lib/prospect-timeline";

const now = new Date("2026-09-26T00:00:00Z");
const windowStart = new Date("2026-08-27T00:00:00Z");
const d = (day: string) => new Date(`2026-09-${day}T12:00:00Z`);

const input: ConnectedInputs = {
  leads: [
    { email: "a@x.com", campaignId: "B", pushedAt: d("02"), status: "pushed" },
    { email: "b@x.com", campaignId: "B", pushedAt: d("02"), status: "pushed" },
    { email: "c@x.com", campaignId: "A", pushedAt: d("03"), status: "pushed" },
    // Emailed before the window, booked inside it: still counts as from cold email.
    { email: "old@x.com", campaignId: "A", pushedAt: new Date("2026-07-01T00:00:00Z"), status: "pushed" },
    { email: "dry@x.com", campaignId: "A", pushedAt: d("03"), status: "dry_run" },
  ],
  replies: [
    { email: "A@x.com", at: d("04"), disposition: "interested" },
    { email: "c@x.com", at: d("04"), disposition: "auto_reply" },
  ],
  bookings: [
    { bookingId: "k1", email: "a@x.com", createdAt: d("05") },
    { bookingId: "k2", email: "old@x.com", createdAt: d("06") },
    { bookingId: "k3", email: "walkin@y.com", createdAt: d("07") },
  ],
  outcomes: [
    { bookingId: "k1", outcome: "no_show", at: d("08") },
    { bookingId: "k1", outcome: "showed", at: d("09") }, // corrected later: showed
    { bookingId: "k2", outcome: "showed", at: d("09") },
    { bookingId: "k3", outcome: "showed", at: d("10") },
  ],
  payments: [
    { email: "a@x.com", outcome: "paid", amount: 3000, refundedAmount: null, currency: "usd", at: d("11") },
    { email: "walkin@y.com", outcome: "refunded", amount: 1000, refundedAmount: 1000, currency: "usd", at: d("12") },
    { email: "eur@y.com", outcome: "paid", amount: 50, refundedAmount: null, currency: "eur", at: d("12") },
    { email: "fail@y.com", outcome: "failed", amount: 500, refundedAmount: null, currency: "usd", at: d("12") },
  ],
};

describe("what the products did together", () => {
  it("carries people from cold email to money when all three are on", () => {
    const r = computeConnectedResults(input, new Set<TimelineProduct>(["cold-open", "showtime", "whop-agent"]), windowStart, now)!;
    expect(r.funnel).toEqual({ emailed: 3, replied: 1, booked: 3, showed: 3, paid: 2 });
    expect(r.money).toEqual({ collected: 4000, refunded: 1000, kept: 3000, currency: "usd", payments: 2 });
    expect(r.fromColdOpen).toEqual({ booked: 2, showed: 2, paid: 1, value: 3000 });
    expect(r.paidAfterCall).toEqual({ buyers: 2, value: 4000 });
    expect(r.campaigns).toEqual([
      { campaignId: "B", emailed: 2, booked: 1, showed: 1, paid: 1, value: 3000 },
      { campaignId: "A", emailed: 1, booked: 1, showed: 1, paid: 0, value: 0 },
    ]);
    expect(funnelSteps(r.funnel)).toEqual(["3 emailed", "1 replied", "3 booked", "3 showed", "2 paid"]);
  });

  it("shows only what the products on can see", () => {
    const r = computeConnectedResults(input, new Set<TimelineProduct>(["showtime", "whop-agent"]), windowStart, now)!;
    expect(r.funnel).toEqual({ booked: 3, showed: 3, paid: 2 });
    expect(r.fromColdOpen).toBeNull();
    expect(r.campaigns).toEqual([]);
    expect(r.paidAfterCall).toEqual({ buyers: 2, value: 4000 });

    const noMoney = computeConnectedResults(input, new Set<TimelineProduct>(["cold-open", "showtime"]), windowStart, now)!;
    expect(noMoney.money).toBeNull();
    expect(noMoney.fromColdOpen).toEqual({ booked: 2, showed: 2, paid: 0, value: null });
    expect(noMoney.campaigns[0].value).toBeNull();
  });

  it("isn't shown with a single product", () => {
    expect(computeConnectedResults(input, new Set<TimelineProduct>(["showtime"]), windowStart, now)).toBeNull();
    expect(computeConnectedResults(input, new Set<TimelineProduct>(["whop-agent", "reputation-manager"]), windowStart, now)).toBeNull();
  });
});
