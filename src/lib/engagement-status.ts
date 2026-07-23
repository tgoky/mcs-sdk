// src/lib/engagement-status.ts
//
// One place to answer "should this engagement be skipped by a recurring
// cron right now?" so nightly-briefs, leak-map-schedule, lost-deal-sweep,
// weekly-metrics, booking-poll, dynamic-brief, and credential-health can't
// drift out of sync on what "paused" means. Every one of those crons pulls
// a full `engagements` row already (they need `stack` for their own
// eligibility checks) — this just reads the same row's `pausedAt` column.
//
// Deliberately NOT a SQL WHERE clause: several of these crons build their
// eligible set with `.filter()` over an in-memory `db.select().from(engagements)`
// result rather than a query-level predicate (see nightlyBriefsCron), so a
// plain function that takes the row is what actually composes with the
// existing code, not a query fragment nothing calls.

export function isEngagementPaused(engagement: { pausedAt: Date | string | null }): boolean {
  return engagement.pausedAt !== null && engagement.pausedAt !== undefined;
}
