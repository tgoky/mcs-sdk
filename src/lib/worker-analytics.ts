// src/lib/worker-analytics.ts
//
// Phase 8 — generalizes package-overview.ts's per-skill rollup (Showtime-
// only, keyed off SKILL_IDS) to the full unified worker registry, across
// both products, and adds the per-worker drill-down package-overview.ts
// never needed: one workerId's own recent-run history and trend. Backs
// the new /dashboard/analytics/[workerId] page — the "one per-worker view
// parameterized by workerId over skillRuns" this app's own roadmap named
// as Phase 8, replacing worker-card.tsx's old per-product analytics
// routing (every Showtime worker to one page, every Reputation Manager
// worker to a different one) with one destination shape for every worker.
//
// Deliberately workspace-scoped (whopUserId + workspaceId), not just
// whopUserId like package-overview.ts — the point of the surrounding
// "one workspace = one client" work is that workspaceId is now the real
// client boundary, so a new file gets that right from the start rather
// than repeating package-overview.ts's older, looser scope.

import { db } from "@/lib/db";
import {
  engagements,
  engagementSkills,
  skillRuns,
  repEngineFindings,
  repTrustpilotReviews,
  repRedditMentions,
} from "@/models/schema";
import { and, eq, gte, inArray, isNull, desc } from "drizzle-orm";
import { WORKER_IDS, WORKER_REGISTRY, type WorkerId } from "@/lib/worker-registry";

const OVERVIEW_WINDOW_DAYS = 7;
const DETAIL_WINDOW_DAYS = 30;
const RECENT_RUNS_LIMIT = 20;
const FAILURE_STATUSES = new Set(["failed", "timed_out"]);

/** Kept out of the query function bodies — react-hooks/purity flags a bare
 * Date.now()/new Date() call inside a component, and getWorkspaceWorkerOverview
 * is called from one, same as package-overview.ts's own daysAgo. */
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export interface WorkerOverviewStat {
  workerId: WorkerId;
  name: string;
  productId: "showtime" | "reputation-manager";
  activeClients: number;
  runsInWindow: number;
  successRate: number | null;
  needsAttention: number;
  disabledClients: number;
}

export interface WorkspaceWorkerOverview {
  totalClients: number;
  workers: WorkerOverviewStat[];
  windowDays: number;
}

/** Every worker in the unified registry, one row each, over a short
 * recent window — the workspace-wide table the new analytics overview
 * and the dashboard's generative worker cards both read from, so neither
 * duplicates this query. */
export async function getWorkspaceWorkerOverview(
  whopUserId: string,
  workspaceId: string
): Promise<WorkspaceWorkerOverview> {
  const since = daysAgo(OVERVIEW_WINDOW_DAYS);

  const allEngagements = await db
    .select({ engagementId: engagements.engagementId })
    .from(engagements)
    .where(
      and(
        eq(engagements.whopUserId, whopUserId),
        eq(engagements.workspaceId, workspaceId),
        isNull(engagements.deletedAt)
      )
    );

  const totalClients = allEngagements.length;
  if (totalClients === 0) {
    return {
      totalClients: 0,
      windowDays: OVERVIEW_WINDOW_DAYS,
      workers: WORKER_IDS.map((id) => ({
        workerId: id,
        name: WORKER_REGISTRY[id].name,
        productId: WORKER_REGISTRY[id].productId,
        activeClients: 0,
        runsInWindow: 0,
        successRate: null,
        needsAttention: 0,
        disabledClients: 0,
      })),
    };
  }

  const engagementIds = allEngagements.map((e) => e.engagementId);

  const [runs, skillOverrides] = await Promise.all([
    db
      .select({
        engagementId: skillRuns.engagementId,
        skillName: skillRuns.skillName,
        status: skillRuns.status,
        startedAt: skillRuns.startedAt,
      })
      .from(skillRuns)
      .where(and(gte(skillRuns.startedAt, since), inArray(skillRuns.engagementId, engagementIds))),
    db
      .select({ engagementId: engagementSkills.engagementId, skillId: engagementSkills.skillId, enabled: engagementSkills.enabled })
      .from(engagementSkills)
      .where(inArray(engagementSkills.engagementId, engagementIds)),
  ]);

  const disabledByWorker = new Map<WorkerId, number>();
  for (const id of WORKER_IDS) disabledByWorker.set(id, 0);
  for (const row of skillOverrides) {
    if (row.enabled) continue;
    if (!(WORKER_IDS as string[]).includes(row.skillId)) continue;
    const id = row.skillId as WorkerId;
    disabledByWorker.set(id, (disabledByWorker.get(id) ?? 0) + 1);
  }

  const perWorker = new Map<
    WorkerId,
    { clients: Set<string>; total: number; success: number; failingClients: Set<string> }
  >();
  for (const id of WORKER_IDS) perWorker.set(id, { clients: new Set(), total: 0, success: 0, failingClients: new Set() });

  // Most-recent-first per (engagement, worker) so a failure streak can be
  // read off the front of each group without a second query — same
  // approach as package-overview.ts.
  const runsByPair = new Map<string, typeof runs>();
  for (const run of runs) {
    if (!(WORKER_IDS as string[]).includes(run.skillName)) continue;
    const key = `${run.engagementId}:${run.skillName}`;
    const list = runsByPair.get(key);
    if (list) list.push(run);
    else runsByPair.set(key, [run]);
  }
  for (const list of runsByPair.values()) {
    list.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }

  for (const [key, list] of runsByPair) {
    const [engagementId, skillName] = key.split(":");
    const workerId = skillName as WorkerId;
    const bucket = perWorker.get(workerId);
    if (!bucket) continue;
    bucket.clients.add(engagementId);
    bucket.total += list.length;
    for (const run of list) {
      if (run.status === "success") bucket.success++;
    }
    if (FAILURE_STATUSES.has(list[0].status)) bucket.failingClients.add(engagementId);
  }

  const workers: WorkerOverviewStat[] = WORKER_IDS.map((id) => {
    const bucket = perWorker.get(id)!;
    return {
      workerId: id,
      name: WORKER_REGISTRY[id].name,
      productId: WORKER_REGISTRY[id].productId,
      activeClients: bucket.clients.size,
      runsInWindow: bucket.total,
      successRate: bucket.total > 0 ? Math.round((bucket.success / bucket.total) * 100) : null,
      needsAttention: bucket.failingClients.size,
      disabledClients: disabledByWorker.get(id) ?? 0,
    };
  });

  return { totalClients, workers, windowDays: OVERVIEW_WINDOW_DAYS };
}

export interface WorkerRunRow {
  id: string;
  engagementId: string;
  buyerName: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
}

/** Reputation Manager's three watch skills' own tables (rep_engine_findings,
 * rep_trustpilot_reviews, rep_reddit_mentions) aren't per-skill in any
 * meaningful sense — the old standalone RM analytics page rolled them up
 * across every RM-enrolled client regardless of which specific skill
 * produced them, and this does the same, attached to every RM worker's
 * own page rather than living on one page nothing else linked to. */
export interface RepSignalSummary {
  engineChecks: number;
  trustpilotReviews: number;
  trustpilotAvgRating: string | null;
  redditMentions: number;
  flaggedSignals: number;
  sentiment: { positive: number; neutral: number; negative: number };
}

export interface WorkerAnalyticsDetail {
  worker: { id: WorkerId; name: string; description: string; productId: "showtime" | "reputation-manager" };
  windowDays: number;
  runsInWindow: number;
  successRate: number | null;
  activeClients: number;
  needsAttention: number;
  recentRuns: WorkerRunRow[];
  repSignals: RepSignalSummary | null;
}

export async function getWorkerAnalyticsDetail(
  whopUserId: string,
  workspaceId: string,
  workerId: WorkerId
): Promise<WorkerAnalyticsDetail> {
  const worker = WORKER_REGISTRY[workerId];
  const since = daysAgo(DETAIL_WINDOW_DAYS);

  const allEngagements = await db
    .select({ engagementId: engagements.engagementId })
    .from(engagements)
    .where(
      and(
        eq(engagements.whopUserId, whopUserId),
        eq(engagements.workspaceId, workspaceId),
        isNull(engagements.deletedAt)
      )
    );
  const engagementIds = allEngagements.map((e) => e.engagementId);

  const emptyRepSignals: RepSignalSummary = {
    engineChecks: 0,
    trustpilotReviews: 0,
    trustpilotAvgRating: null,
    redditMentions: 0,
    flaggedSignals: 0,
    sentiment: { positive: 0, neutral: 0, negative: 0 },
  };

  if (engagementIds.length === 0) {
    return {
      worker: { id: worker.id, name: worker.name, description: worker.description, productId: worker.productId },
      windowDays: DETAIL_WINDOW_DAYS,
      runsInWindow: 0,
      successRate: null,
      activeClients: 0,
      needsAttention: 0,
      recentRuns: [],
      repSignals: worker.productId === "reputation-manager" ? emptyRepSignals : null,
    };
  }

  const [runs, recentRunsRaw, repSignals] = await Promise.all([
    db
      .select({ engagementId: skillRuns.engagementId, status: skillRuns.status, startedAt: skillRuns.startedAt })
      .from(skillRuns)
      .where(and(eq(skillRuns.skillName, workerId), gte(skillRuns.startedAt, since), inArray(skillRuns.engagementId, engagementIds))),
    db
      .select({
        id: skillRuns.id,
        engagementId: skillRuns.engagementId,
        buyerName: engagements.buyer,
        status: skillRuns.status,
        startedAt: skillRuns.startedAt,
        completedAt: skillRuns.completedAt,
      })
      .from(skillRuns)
      .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
      .where(and(eq(skillRuns.skillName, workerId), inArray(skillRuns.engagementId, engagementIds)))
      .orderBy(desc(skillRuns.startedAt))
      .limit(RECENT_RUNS_LIMIT),
    worker.productId === "reputation-manager" ? getRepSignalSummary(engagementIds, since) : Promise.resolve(null),
  ]);

  const activeClientIds = new Set(runs.map((r) => r.engagementId));
  const successCount = runs.filter((r) => r.status === "success").length;

  const byEngagement = new Map<string, typeof runs>();
  for (const run of runs) {
    const list = byEngagement.get(run.engagementId);
    if (list) list.push(run);
    else byEngagement.set(run.engagementId, [run]);
  }
  let needsAttention = 0;
  for (const list of byEngagement.values()) {
    list.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    if (FAILURE_STATUSES.has(list[0].status)) needsAttention++;
  }

  return {
    worker: { id: worker.id, name: worker.name, description: worker.description, productId: worker.productId },
    windowDays: DETAIL_WINDOW_DAYS,
    runsInWindow: runs.length,
    successRate: runs.length > 0 ? Math.round((successCount / runs.length) * 100) : null,
    activeClients: activeClientIds.size,
    needsAttention,
    recentRuns: recentRunsRaw.map((r) => ({
      id: r.id,
      engagementId: r.engagementId,
      buyerName: r.buyerName,
      status: r.status,
      startedAt: r.startedAt.toISOString(),
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    })),
    repSignals,
  };
}

// Perf-audit fix: the old standalone RM analytics page this rollup came
// from queried every signal ever recorded, with no window — tolerable
// when it was one page nothing linked to, not once this same rollup
// renders on every RM worker's own analytics page (6 destinations
// instead of 1). Windowed to the same DETAIL_WINDOW_DAYS every other
// query in this file already uses, so a long-running client's full
// history stops loading into memory on every page view.
async function getRepSignalSummary(engagementIds: string[], since: Date): Promise<RepSignalSummary> {
  const [findings, reviews, mentions] = await Promise.all([
    db
      .select({ sentiment: repEngineFindings.sentiment, flagged: repEngineFindings.flagged })
      .from(repEngineFindings)
      .where(and(inArray(repEngineFindings.engagementId, engagementIds), gte(repEngineFindings.runAt, since))),
    db
      .select({ rating: repTrustpilotReviews.rating, sentiment: repTrustpilotReviews.sentiment, flagged: repTrustpilotReviews.flagged })
      .from(repTrustpilotReviews)
      .where(and(inArray(repTrustpilotReviews.engagementId, engagementIds), gte(repTrustpilotReviews.createdAt, since))),
    db
      .select({ sentiment: repRedditMentions.sentiment, flagged: repRedditMentions.flagged })
      .from(repRedditMentions)
      .where(and(inArray(repRedditMentions.engagementId, engagementIds), gte(repRedditMentions.createdAt, since))),
  ]);

  const allSignals = [...findings, ...reviews, ...mentions];
  return {
    engineChecks: findings.length,
    trustpilotReviews: reviews.length,
    trustpilotAvgRating: reviews.length ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1) : null,
    redditMentions: mentions.length,
    flaggedSignals: allSignals.filter((s) => s.flagged).length,
    sentiment: {
      positive: allSignals.filter((s) => s.sentiment === "positive").length,
      neutral: allSignals.filter((s) => s.sentiment === "neutral").length,
      negative: allSignals.filter((s) => s.sentiment === "negative").length,
    },
  };
}
