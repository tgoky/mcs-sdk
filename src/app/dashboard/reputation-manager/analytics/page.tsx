// src/app/dashboard/reputation-manager/analytics/page.tsx
//
// Phase 8 — this used to be Reputation Manager's own separate analytics
// page: 4 stat cards (AI engine checks, Trustpilot reviews, Reddit
// mentions, flagged signals) plus a sentiment bar, rolled up across
// rep_engine_findings/rep_trustpilot_reviews/rep_reddit_mentions for
// every RM-enrolled client — but with zero skillRuns data, unlike
// Showtime's /dashboard/analytics. That exact same rollup now renders on
// every Reputation Manager worker's own analytics page (see
// getWorkerAnalyticsDetail's repSignals in worker-analytics.ts) — nothing
// here was doing anything the new /dashboard/analytics/[workerId] page
// doesn't already do, with the added benefit of also showing skillRuns
// history, which this page never had.
//
// A permanent redirect, not a deleted route — worker-card.tsx's old
// PRODUCT_ANALYTICS_HREF lookup and any bookmarked/external link to this
// URL still land somewhere real. rep-onboarding is the anchor worker
// every Reputation Manager client has (see Phase 6's identity-graph-form
// verification), so it's the one every RM analytics link redirects into.

import { redirect } from "next/navigation";

export default function ReputationManagerAnalyticsPage() {
  redirect("/dashboard/analytics/rep-onboarding");
}
