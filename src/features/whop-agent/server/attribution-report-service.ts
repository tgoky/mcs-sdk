// src/features/whop-agent/server/attribution-report-service.ts
//
// Playbook 5.14 — depends on the undocumented v2 API surface (Section
// 6.7). The stability assumption Section 5.14 itself records applies
// here verbatim: no isolation adapter or shape assertion beyond reporting
// a shape mismatch honestly when the expected fields are missing.
import crypto from "crypto";
import { startRun, logStep, finishRun, failRun } from "@/lib/run-log";
import { WhopAgentClient } from "@/lib/whop-agent/client";
import { formatMetricValue, lastFullWeek } from "@/lib/whop-agent/stats";

interface WhopV2Membership {
  id: string;
  promo_code?: string | null;
  affiliate_username?: string | null;
  checkout_session?: string | null;
  acquisition_data?: unknown;
  // Revenue isn't a documented field on this object in the research this
  // build is grounded in — grouping counts memberships per attribution key
  // and cross-checks the *count*-implied share of gross revenue against
  // the stats engine total, rather than assuming a per-membership revenue
  // field exists on this endpoint. Flagged, not guessed.
}

interface WhopV2MembershipsResponse {
  data?: WhopV2Membership[];
  current_page?: number;
  total_page?: number;
  total_count?: number;
}

export interface AttributionGroup {
  key: string;
  memberCount: number;
}

export interface AttributionReport {
  byPromoCode: AttributionGroup[];
  byAffiliate: AttributionGroup[];
  byCheckoutSession: AttributionGroup[];
  totalMemberships: number;
  acquisitionDataObserved: boolean;
  shapeMismatch: string | null;
  revenueCrossCheck: { statsGrossRevenue: number | null; note: string };
}

const MAX_PAGES = 50; // safety cap against a runaway loop if total_page is ever wrong/missing

function group(memberships: WhopV2Membership[], field: keyof WhopV2Membership): AttributionGroup[] {
  const counts = new Map<string, number>();
  for (const m of memberships) {
    const value = m[field];
    if (typeof value !== "string" || !value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].map(([key, memberCount]) => ({ key, memberCount })).sort((a, b) => b.memberCount - a.memberCount);
}

async function buildAttributionReport(engagementId: string, runId: string): Promise<AttributionReport> {
  try {
    const client = await WhopAgentClient.forEngagement(engagementId);
    const memberships: WhopV2Membership[] = [];
    let page = 1;
    let shapeMismatch: string | null = null;

    await logStep(runId, { phase: "v2_memberships_paginate", status: "running" });
    for (; page <= MAX_PAGES; page++) {
      const response = await client.request<WhopV2MembershipsResponse>("memberships_v2.list", "/api/v2/memberships", { query: { page, per: 100 } });
      if (!response.data) {
        shapeMismatch = "GET /api/v2/memberships returned no `data` array. The undocumented v2 surface may have changed.";
        break;
      }
      memberships.push(...response.data);
      if (!response.total_page || page >= response.total_page) break;
    }
    await logStep(runId, { phase: "v2_memberships_paginate", status: shapeMismatch ? "failed" : "success", detail: shapeMismatch ?? `Pulled ${memberships.length} memberships across ${page} page(s).` });

    const expectedFieldsPresent = memberships.some((m) => "promo_code" in m || "affiliate_username" in m || "checkout_session" in m);
    if (memberships.length > 0 && !expectedFieldsPresent) {
      shapeMismatch = (shapeMismatch ? shapeMismatch + " " : "") + "No membership carried promo_code/affiliate_username/checkout_session. Expected v2 attribution fields may be missing or renamed.";
    }

    const acquisitionDataObserved = memberships.some((m) => m.acquisition_data != null);

    await logStep(runId, { phase: "revenue_cross_check", status: "running" });
    const gross = await client.statsValue("grossRevenue", { ...lastFullWeek(new Date()), interval: "week" }).catch(() => null);
    const statsGrossRevenue = gross?.value ?? null;
    await logStep(runId, {
      phase: "revenue_cross_check",
      status: "success",
      detail: `Gross revenue last week: ${statsGrossRevenue != null ? `${formatMetricValue(statsGrossRevenue, "currency", gross?.currency)} (Whop metric ${gross?.key})` : "unavailable"}. Per-attribution-key revenue isn't exposed on this endpoint, so the cross-check compares presence, not amount. See this file's own note on WhopV2Membership.`,
    });

    const report: AttributionReport = {
      byPromoCode: group(memberships, "promo_code"),
      byAffiliate: group(memberships, "affiliate_username"),
      byCheckoutSession: group(memberships, "checkout_session"),
      totalMemberships: memberships.length,
      acquisitionDataObserved,
      shapeMismatch,
      revenueCrossCheck: { statsGrossRevenue, note: "Per-key revenue not available on this endpoint. Reported as membership counts per attribution key." },
    };

    await finishRun(runId, {
      summary: {
        whatWasAttempted: ["Paginate v2 memberships", "Group by promo code / affiliate / checkout session", "Cross-check against Whop's stats"],
        whatWorked: shapeMismatch ? [] : [`${memberships.length} memberships across ${report.byPromoCode.length} promo codes, ${report.byAffiliate.length} affiliates`],
        whatFailed: shapeMismatch ? [shapeMismatch] : [],
        openItems: [
          acquisitionDataObserved ? "" : "acquisition_data was null on every sampled record. Omitted rather than guessed at.",
          "Per-attribution-key revenue not available on this endpoint, only membership counts are reported per key.",
        ].filter(Boolean),
        decisionsMade: [],
      },
    });

    return report;
  } catch (err) {
    await failRun(runId, err).catch(() => {});
    throw err;
  }
}

/** Matches the generic execute(tenant, runId, step) shape other skills
 * use, for whichever scheduled/manual dispatch path calls it generically —
 * the report itself isn't needed by that caller, only the run record. */
export async function runAttributionReport(tenant: any, runId: string): Promise<void> {
  await buildAttributionReport(tenant.engagementId as string, runId);
}

/**
 * Manual on-demand trigger that also hands the caller the report directly
 * (not just a runId to go look up) — runs synchronously (not through
 * Inngest) since the v2 pagination loop is a handful of GETs, well inside
 * a normal request timeout, same reasoning as the connect flow's own
 * synchronous probe.
 */
export async function dispatchAttributionReportRun(engagementId: string): Promise<{ runId: string; report: AttributionReport }> {
  const runId = crypto.randomUUID();
  await startRun({ id: runId, engagementId, skillName: "whop-attribution-report", phase: "v2_memberships_paginate", label: "Attribution & Affiliate Report" });
  const report = await buildAttributionReport(engagementId, runId);
  return { runId, report };
}
