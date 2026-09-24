// src/features/whop-agent/server/risk-window.ts
//
// Refunds, disputes and dispute alerts over a window, counted from Whop's
// own list endpoints (@whop/sdk: GET /refunds, GET /disputes/summary,
// GET /dispute_alerts, all with created_after/created_before), against the
// window's successful payments from the Stats API. Counting the events
// themselves keeps a rate true to its window: a stats rate comes in
// calendar buckets that a rolling window rarely lines up with.

import type { WhopAgentClient } from "@/lib/whop-agent/client";

export interface RiskWindow {
  from: Date;
  to: Date;
  /** Successful payments, or null when Whop's stats don't offer the count. */
  payments: number | null;
  paymentsKey: string | null;
  refunds: { count: number; more: boolean } | null;
  disputes: number | null;
  disputeAlerts: { count: number; more: boolean } | null;
}

export async function readRiskWindow(client: WhopAgentClient, from: Date, to: Date): Promise<RiskWindow> {
  const accountId = client.accountId ?? "";
  const range = { account_id: accountId, created_after: from.toISOString(), created_before: to.toISOString() };
  const [payments, refunds, disputes, alerts] = await Promise.all([
    client.statsValue("successfulPayments", { from, to, interval: "day" }).catch(() => null),
    // Areas the connect probe doesn't check: a refusal means "can't read
    // this", not a dead key, so these never trip the circuit breaker.
    client.countList("refunds.list", "/v1/refunds", range, 10, { optionalRead: true }).catch(() => null),
    client.request<{ total?: number }>("disputes.summary", "/v1/disputes/summary", { query: range, optionalRead: true }).catch(() => null),
    client.countList("dispute_alerts.list", "/v1/dispute_alerts", range, 10, { optionalRead: true }).catch(() => null),
  ]);
  return {
    from,
    to,
    payments: payments?.value ?? null,
    paymentsKey: payments?.key ?? null,
    refunds,
    disputes: typeof disputes?.total === "number" ? disputes.total : null,
    disputeAlerts: alerts,
  };
}

/** Refund and dispute rates as fractions of payments. Null without a payment count. */
export function riskRates(w: Pick<RiskWindow, "payments" | "refunds" | "disputes">): { refundRate: number | null; disputeRate: number | null } {
  if (!w.payments || w.payments <= 0) return { refundRate: null, disputeRate: null };
  return {
    refundRate: w.refunds ? w.refunds.count / w.payments : null,
    disputeRate: w.disputes != null ? w.disputes / w.payments : null,
  };
}
