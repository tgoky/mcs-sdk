// src/lib/worker-report-blocks.ts
//
// The dynamic replacement for client-report-card.tsx / rep-client-report-
// card.tsx's hardcoded metric sets. Instead of two components each frozen
// to whatever skills existed when they were written (Bookings/Show rate/
// Win-Back/Approvals; mentions/flagged/incidents), every worker owns its
// own resolver here — given an engagement and a period window, return
// whatever real block(s) it contributed, or nothing at all for a one-time
// setup skill. Reports (dashboard/reports, engagements/[id]) call
// getReportBlocksForEngagement with whichever workers are actually
// enabled and render whatever comes back — a newly added skill starts
// appearing the day its resolver is written here, with no report-page
// markup to touch.
//
// Reputation Manager's four watch skills used to be merged into one
// "mentions" blob in rep-report-service.ts (computeRepClientReport) —
// each one actually has its own ingestion table
// (repEngineFindings/repTrustpilotReviews/repRedditMentions/
// repTwitterMentions), so splitting them into one resolver per skill
// below is a real per-worker breakdown, not a relabeling.

import { db } from "@/lib/db";
import {
  skillRuns,
  briefOutcomeLog,
  winBackEnrollments,
  repEngineFindings,
  repTrustpilotReviews,
  repRedditMentions,
  repTwitterMentions,
  repIncidents,
} from "@/models/schema";
import { and, eq, gte } from "drizzle-orm";
import type { WorkerId } from "@/lib/worker-registry";

export interface WorkerReportBlock {
  workerId: WorkerId;
  label: string;
  /** Raw number for trend math (client_metric_snapshots comparisons) —
   * null when there's no baseline yet this period, so the UI can show
   * "—" instead of a misleading 0%. */
  value: number | null;
  displayValue: string;
  tone?: "positive" | "warning" | "negative" | "neutral";
}

export interface ReportPeriodWindow {
  /** null = all_time, no lower bound. */
  start: Date | null;
}

type ReportBlockResolver = (engagementId: string, window: ReportPeriodWindow) => Promise<WorkerReportBlock[]>;

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function rateTone(rate: number | null): WorkerReportBlock["tone"] {
  if (rate === null) return "neutral";
  return rate >= 0.8 ? "positive" : rate >= 0.5 ? "warning" : "negative";
}

// ── Showtime ────────────────────────────────────────────────────────────

// pin-down (Show Rate Setup): one-time onboarding, nothing ongoing to
// report per period — same honest-omission convention worker-registry.ts
// already uses for a worker with genuinely nothing to show, not a gap.
const pinDownBlocks: ReportBlockResolver = async () => [];

const pileOnBlocks: ReportBlockResolver = async (engagementId, { start }) => {
  const rows = await db
    .select({ id: skillRuns.id })
    .from(skillRuns)
    .where(
      and(
        eq(skillRuns.engagementId, engagementId),
        eq(skillRuns.skillName, "pile-on"),
        eq(skillRuns.status, "success"),
        start ? gte(skillRuns.startedAt, start) : undefined
      )
    );
  return [{ workerId: "pile-on", label: "Bookings", value: rows.length, displayValue: String(rows.length), tone: "neutral" }];
};

const preCallReadBlocks: ReportBlockResolver = async (engagementId, { start }) => {
  const rows = await db
    .select({ outcome: briefOutcomeLog.outcome })
    .from(briefOutcomeLog)
    .where(and(eq(briefOutcomeLog.engagementId, engagementId), start ? gte(briefOutcomeLog.loggedAt, start) : undefined));
  const showed = rows.filter((r) => r.outcome === "showed").length;
  const noShow = rows.filter((r) => r.outcome === "no_show").length;
  const base = showed + noShow;
  const rate = base > 0 ? showed / base : null;
  return [
    {
      workerId: "pre-call-read",
      label: "Show rate",
      value: rate,
      displayValue: rate !== null ? pct(rate) : "—",
      tone: rateTone(rate),
    },
  ];
};

const winBackBlocks: ReportBlockResolver = async (engagementId, { start }) => {
  const rows = await db
    .select({ status: winBackEnrollments.status })
    .from(winBackEnrollments)
    .where(and(eq(winBackEnrollments.engagementId, engagementId), start ? gte(winBackEnrollments.enrolledAt, start) : undefined));
  const rebooked = rows.filter((r) => r.status === "rebooked").length;
  const lost = rows.filter((r) => r.status === "lost").length;
  const base = rebooked + lost;
  const rate = base > 0 ? rebooked / base : null;
  return [
    {
      workerId: "win-back",
      label: "Win-Back recovery",
      value: rate,
      displayValue: rate !== null ? pct(rate) : "—",
      tone: rateTone(rate),
    },
  ];
};

// leak-map (Funnel Audit): its real output is a bottleneck report and a
// benchmark comparison (leak-map-benchmarks.ts), not a single trend-able
// number today — returning [] here is honest about that gap rather than
// inventing a score nothing backs. Revisit once leak-map has one clear
// headline metric worth persisting into the snapshot history.
const leakMapBlocks: ReportBlockResolver = async () => [];

// ── Reputation Manager ──────────────────────────────────────────────────

const repOnboardingBlocks: ReportBlockResolver = async () => [];

function mentionBlock(
  workerId: WorkerId,
  label: string,
  rows: { sentiment: string | null; flagged: boolean | null }[]
): WorkerReportBlock {
  const negative = rows.filter((r) => r.sentiment === "negative").length;
  const negPct = rows.length > 0 ? negative / rows.length : null;
  return {
    workerId,
    label,
    value: rows.length,
    displayValue: String(rows.length),
    tone: negPct === null ? "neutral" : negPct >= 0.3 ? "negative" : negPct >= 0.1 ? "warning" : "positive",
  };
}

const repEnginePanelBlocks: ReportBlockResolver = async (engagementId, { start }) => {
  const rows = await db
    .select({ sentiment: repEngineFindings.sentiment, flagged: repEngineFindings.flagged })
    .from(repEngineFindings)
    .where(and(eq(repEngineFindings.engagementId, engagementId), start ? gte(repEngineFindings.runAt, start) : undefined));
  return [mentionBlock("rep-engine-panel", "AI engine mentions", rows)];
};

const repTrustpilotWatchBlocks: ReportBlockResolver = async (engagementId, { start }) => {
  const rows = await db
    .select({ sentiment: repTrustpilotReviews.sentiment, flagged: repTrustpilotReviews.flagged })
    .from(repTrustpilotReviews)
    .where(and(eq(repTrustpilotReviews.engagementId, engagementId), start ? gte(repTrustpilotReviews.createdAt, start) : undefined));
  return [mentionBlock("rep-trustpilot-watch", "Trustpilot reviews", rows)];
};

const repRedditWatchBlocks: ReportBlockResolver = async (engagementId, { start }) => {
  const rows = await db
    .select({ sentiment: repRedditMentions.sentiment, flagged: repRedditMentions.flagged })
    .from(repRedditMentions)
    .where(and(eq(repRedditMentions.engagementId, engagementId), start ? gte(repRedditMentions.createdAt, start) : undefined));
  return [mentionBlock("rep-reddit-watch", "Reddit mentions", rows)];
};

const repTwitterWatchBlocks: ReportBlockResolver = async (engagementId, { start }) => {
  const rows = await db
    .select({ sentiment: repTwitterMentions.sentiment, flagged: repTwitterMentions.flagged })
    .from(repTwitterMentions)
    .where(and(eq(repTwitterMentions.engagementId, engagementId), start ? gte(repTwitterMentions.createdAt, start) : undefined));
  return [mentionBlock("rep-twitter-watch", "Twitter/X mentions", rows)];
};

const repCrisisResponseBlocks: ReportBlockResolver = async (engagementId, { start }) => {
  const rows = await db
    .select({ id: repIncidents.id })
    .from(repIncidents)
    .where(and(eq(repIncidents.engagementId, engagementId), start ? gte(repIncidents.declaredAt, start) : undefined));
  return [
    {
      workerId: "rep-crisis-response",
      label: "Incidents",
      value: rows.length,
      displayValue: String(rows.length),
      tone: rows.length === 0 ? "positive" : rows.length <= 2 ? "warning" : "negative",
    },
  ];
};

export const WORKER_REPORT_RESOLVERS: Partial<Record<WorkerId, ReportBlockResolver>> = {
  "pin-down": pinDownBlocks,
  "pile-on": pileOnBlocks,
  "pre-call-read": preCallReadBlocks,
  "win-back": winBackBlocks,
  "leak-map": leakMapBlocks,
  "rep-onboarding": repOnboardingBlocks,
  "rep-engine-panel": repEnginePanelBlocks,
  "rep-trustpilot-watch": repTrustpilotWatchBlocks,
  "rep-reddit-watch": repRedditWatchBlocks,
  "rep-twitter-watch": repTwitterWatchBlocks,
  "rep-crisis-response": repCrisisResponseBlocks,
};

export interface ReportBlockWithTrend extends WorkerReportBlock {
  /** "+6pts vs last week" / "+3 vs last week" / null when there's no
   * prior-week snapshot yet (a brand-new engagement, or a skill enabled
   * this week) or the block simply doesn't map to last week's (a new
   * skill's own first appearance). Never fabricated against a missing
   * baseline — see getPriorSnapshot's own doc. */
  trendLabel: string | null;
}

/** Attaches a real week-over-week delta to each current block by
 * matching on (workerId, label) against last week's snapshot — the
 * actual trend layer client_metric_snapshots exists for. A rate-like
 * value (0–1, e.g. show rate) is shown as a point delta; anything else
 * (bookings, mention counts, incidents) as a plain count delta. */
export function attachTrends(current: WorkerReportBlock[], prior: WorkerReportBlock[] | null): ReportBlockWithTrend[] {
  return current.map((block) => {
    const match = prior?.find((p) => p.workerId === block.workerId && p.label === block.label);
    if (!match || block.value === null || match.value === null) {
      return { ...block, trendLabel: null };
    }
    const delta = block.value - match.value;
    const isRateLike = Math.abs(block.value) <= 1 && Math.abs(match.value) <= 1;
    if (Math.abs(delta) < (isRateLike ? 0.005 : 0.5)) {
      return { ...block, trendLabel: "steady vs last week" };
    }
    const sign = delta >= 0 ? "+" : "";
    const formatted = isRateLike ? `${sign}${Math.round(delta * 100)}pts` : `${sign}${Math.round(delta)}`;
    return { ...block, trendLabel: `${formatted} vs last week` };
  });
}

/** Every real block for whichever workers are actually enabled on this
 * engagement — the one call both dashboard/reports and engagements/[id]
 * need instead of two separately-gated, hand-shaped cards. A worker with
 * no resolver entry (shouldn't happen — every WorkerId is listed above)
 * or one that resolves to [] simply contributes nothing, so the render
 * layer never needs to know which product a block came from. */
export async function getReportBlocksForEngagement(
  engagementId: string,
  enabledWorkerIds: string[],
  window: ReportPeriodWindow
): Promise<WorkerReportBlock[]> {
  const resolvers = enabledWorkerIds
    .map((id) => WORKER_REPORT_RESOLVERS[id as WorkerId])
    .filter((r): r is ReportBlockResolver => Boolean(r));
  const results = await Promise.all(resolvers.map((resolve) => resolve(engagementId, window)));
  return results.flat();
}
