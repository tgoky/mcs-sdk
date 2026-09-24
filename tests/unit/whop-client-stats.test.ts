import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

const breakerTrips = vi.fn();
const connection = {
  engagementId: "e1",
  whopAccountId: "biz_1",
  pinnedVersionDate: "2026-09-15",
  circuitBreakerState: "closed",
  circuitBreakerReason: null,
};

vi.mock("@/lib/db", () => {
  const chain = { from: () => chain, where: () => chain, limit: async () => [connection] };
  return {
    db: {
      select: () => chain,
      update: () => ({ set: (v: unknown) => ({ where: async () => breakerTrips(v) }) }),
    },
  };
});
vi.mock("@/lib/credentials", () => ({ resolveCredential: async () => "apik_test" }));

import { WhopAgentClient } from "@/lib/whop-agent/client";
import { readRiskWindow } from "@/features/whop-agent/server/risk-window";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let urls: URL[] = [];

beforeEach(() => {
  urls = [];
  breakerTrips.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("WhopAgentClient stats", () => {
  it("finds the metric in the catalog and queries it for this account under /api/v1", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        const u = new URL(input);
        urls.push(u);
        if (u.pathname === "/api/v1/stats") return json({ data: [{ key: "net_revenue", name: "Net revenue", unit: "currency", properties: [] }] });
        if (u.pathname === "/api/v1/stats/net_revenue") return json({ data: { currency: "usd", points: [{ timestamp: 1, value: 100.5 }, { timestamp: 2, value: 50 }] } });
        return json({}, 404);
      })
    );
    const client = await WhopAgentClient.forEngagement("e1");
    const from = new Date("2026-09-14T00:00:00Z");
    const to = new Date("2026-09-20T23:59:59Z");
    const v = await client.statsValue("netRevenue", { from, to, interval: "week" });
    expect(v).toEqual({ id: "netRevenue", key: "net_revenue", name: "Net revenue", unit: "currency", value: 150.5, currency: "usd", points: 2 });
    const q = urls[1].searchParams;
    expect([q.get("account_id"), q.get("from"), q.get("to"), q.get("interval")]).toEqual(["biz_1", from.toISOString(), to.toISOString(), "week"]);
    expect(q.get("company_id")).toBeNull();

    // A metric the catalog doesn't have is null, and the catalog is read once.
    expect(await client.statsValue("arr", { from, to })).toBeNull();
    expect(urls.filter((u) => u.pathname === "/api/v1/stats")).toHaveLength(1);
  });

  it("counts risk events from Whop's lists, and a refused refunds read doesn't pause Whop Agent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        const u = new URL(input);
        urls.push(u);
        if (u.pathname === "/api/v1/stats") return json({ data: [{ key: "successful_payments", name: "Successful payments", unit: "count", properties: [] }] });
        if (u.pathname === "/api/v1/stats/successful_payments") return json({ data: { points: [{ timestamp: 1, value: 60 }, { timestamp: 2, value: 40 }] } });
        if (u.pathname === "/api/v1/refunds") return json({ message: "Forbidden" }, 403);
        if (u.pathname === "/api/v1/disputes/summary") return json({ total: 2, groups: {} });
        if (u.pathname === "/api/v1/dispute_alerts") {
          return u.searchParams.get("after") ? json({ data: [{}], page_info: { has_next_page: false } }) : json({ data: [{}, {}], page_info: { has_next_page: true, end_cursor: "c1" } });
        }
        return json({}, 404);
      })
    );
    const client = await WhopAgentClient.forEngagement("e1");
    const risk = await readRiskWindow(client, new Date("2026-09-17T00:00:00Z"), new Date("2026-09-24T00:00:00Z"));
    expect(risk).toMatchObject({ payments: 100, paymentsKey: "successful_payments", refunds: null, disputes: 2, disputeAlerts: { count: 3, more: false } });
    expect(breakerTrips).not.toHaveBeenCalled();
    const summary = urls.find((u) => u.pathname === "/api/v1/disputes/summary")!.searchParams;
    expect([summary.get("account_id"), summary.get("created_after")]).toEqual(["biz_1", "2026-09-17T00:00:00.000Z"]);
  });
});
