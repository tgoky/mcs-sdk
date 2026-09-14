// src/app/dashboard/analytics/[workerId]/page.tsx
//
// Phase 8's "one per-worker view parameterized by workerId over
// skillRuns" page, rebuilt around real business outcomes instead of a
// StatCard grid + raw run log — the owner's own words: "right now its
// full of cards and gabbage", wanted "more on outcomes, beneficial
// stuff". This is what the Library's "Visit analysis" menu item routes
// to.
//
// The headline is the worker's real business-outcome block
// (worker-report-blocks.ts) for the workspace's primary engagement —
// Show rate, Win-Back recovery, mention counts, etc. — where one exists,
// with its real week-over-week trend. A worker with no resolver (Cold
// Open/Whop Agent workers today) gets an honest "no tracked outcome yet"
// state instead of a fabricated number, same discipline as the Library's
// Inspect Performance panel (skill-inspect.ts, shared by both).
//
// Below that: a real day-by-day trend chart (run-trend-chart.tsx) over
// skillRuns — the one genuinely real, chartable signal that exists for
// every worker regardless of whether it has an outcome resolver — then
// Reputation Manager's sentiment rollup where relevant, then a compact
// recent-activity strip (5-6 entries, not the old unbounded log).

import { notFound } from "next/navigation";
import Link from "next/link";
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";
import { getSession } from "@/lib/session";
import { getActiveWorkspace, getPrimaryEngagementIdForWorkspace } from "@/lib/workspace";
import { isWorkerId } from "@/lib/worker-registry";
import { getWorkerAnalyticsDetail, getWorkerRunTrend } from "@/lib/worker-analytics";
import { getSkillInspectData, type SkillInspectData } from "@/features/reports/server/skill-inspect";
import { RunTrendChart } from "./run-trend-chart";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PRODUCT_LABELS = {
  showtime: "Showtime",
  "reputation-manager": "Reputation Manager",
  "cold-open": "Cold Open",
  "whop-agent": "Whop Agent",
} as const;

const STATUS_STYLES: Record<string, string> = {
  success: "text-emerald-600 dark:text-emerald-400",
  failed: "text-rose-600 dark:text-rose-400",
  timed_out: "text-rose-600 dark:text-rose-400",
  running: "text-amber-600 dark:text-amber-400",
};

const TONE_CLASS: Record<string, string> = {
  positive: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  negative: "text-rose-600 dark:text-rose-400",
  neutral: "text-zinc-800 dark:text-zinc-200",
};

function TrendIcon({ trendLabel }: { trendLabel: string | null }) {
  if (!trendLabel) return <Minus size={13} className="text-zinc-400 dark:text-zinc-600" />;
  if (trendLabel.startsWith("+")) return <TrendingUp size={13} className="text-emerald-600 dark:text-emerald-400" />;
  if (trendLabel.startsWith("-")) return <TrendingDown size={13} className="text-rose-600 dark:text-rose-400" />;
  return <Minus size={13} className="text-zinc-400 dark:text-zinc-600" />;
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-mono uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{label}</span>
      <span className={`text-sm font-bold tabular-nums ${tone ?? "text-zinc-800 dark:text-zinc-200"}`}>{value}</span>
    </div>
  );
}

function SentimentBar({ positive, neutral, negative }: { positive: number; neutral: number; negative: number }) {
  const total = positive + neutral + negative;
  if (total === 0) {
    return <p className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">No scored signals yet.</p>;
  }
  const pct = (n: number) => `${((n / total) * 100).toFixed(0)}%`;
  return (
    <div className="space-y-2">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div className="bg-emerald-400 dark:bg-emerald-500" style={{ width: pct(positive) }} />
        <div className="bg-zinc-300 dark:bg-zinc-600" style={{ width: pct(neutral) }} />
        <div className="bg-rose-400 dark:bg-rose-500" style={{ width: pct(negative) }} />
      </div>
      <div className="flex items-center gap-4 text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400 dark:bg-emerald-500" />Positive {positive}</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-600" />Neutral {neutral}</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-400 dark:bg-rose-500" />Negative {negative}</span>
      </div>
    </div>
  );
}

export default async function WorkerAnalyticsPage({ params }: { params: Promise<{ workerId: string }> }) {
  const { workerId } = await params;
  if (!isWorkerId(workerId)) notFound();

  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const activeWorkspace = await getActiveWorkspace(whopUserId);

  // The real per-client outcome blocks (worker-report-blocks.ts) are
  // scoped to one engagement — the same "workspace = one client" primary
  // engagement the Library page and its per-worker panels already use
  // (see workspace.ts's getPrimaryEngagementIdForWorkspace). Null for a
  // brand-new workspace with no client created yet, in which case the
  // headline honestly falls back rather than pretending an outcome exists.
  const primaryEngagementId = await getPrimaryEngagementIdForWorkspace(activeWorkspace.workspaceId);

  const [detail, trend, inspect] = await Promise.all([
    getWorkerAnalyticsDetail(whopUserId, activeWorkspace.workspaceId, workerId),
    getWorkerRunTrend(whopUserId, activeWorkspace.workspaceId, workerId),
    primaryEngagementId ? getSkillInspectData(primaryEngagementId, workerId) : Promise.resolve(null as SkillInspectData | null),
  ]);

  const weekBlock = inspect?.outcome.week ?? null;
  const monthBlock = inspect?.outcome.month ?? null;
  const hasOutcome = Boolean(weekBlock || monthBlock);
  const recentActivity = detail.recentRuns.slice(0, 6);

  return (
    <div className="flex flex-col h-full w-full mx-auto tracking-tight antialiased font-sans px-1 text-zinc-600 dark:text-zinc-400 transition-colors duration-200">
      <div className="shrink-0 flex flex-col space-y-0.5 border-b border-zinc-200 dark:border-zinc-800/80 pb-3">
        <div className="flex items-center gap-1.5">
          <Link href="/dashboard/analytics" className="text-xs font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors">
            Analytics
          </Link>
          <span className="text-xs text-zinc-300 dark:text-zinc-700">/</span>
          <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">{detail.worker.name}</h1>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {PRODUCT_LABELS[detail.worker.productId]} &middot; {detail.worker.description}
        </p>
      </div>

      {/* Headline — the real business outcome, not one tile among four
          identical ones. */}
      <div className="mt-5">
        {hasOutcome ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {weekBlock && (
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-6">
                <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{weekBlock.label} &middot; this week</p>
                <p className={`text-5xl font-bold mt-1.5 tabular-nums ${TONE_CLASS[weekBlock.tone ?? "neutral"]}`}>{weekBlock.displayValue}</p>
                <div className="flex items-center gap-1.5 mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <TrendIcon trendLabel={weekBlock.trendLabel} />
                  {weekBlock.trendLabel ?? "no baseline yet to compare against"}
                </div>
              </div>
            )}
            {monthBlock && (
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-6">
                <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{monthBlock.label} &middot; this month</p>
                <p className={`text-5xl font-bold mt-1.5 tabular-nums ${TONE_CLASS[monthBlock.tone ?? "neutral"]}`}>{monthBlock.displayValue}</p>
                <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-2">month-to-date</p>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 p-6">
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">No tracked business outcome yet for this skill.</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">
              This worker has no outcome resolver yet, or its client hasn&apos;t produced one. Run volume and success rate below are real, in the meantime.
            </p>
          </div>
        )}
      </div>

      {/* Operational signal — real, but secondary now: a compact row, not
          a grid of same-sized cards competing with the headline above. */}
      <div className="mt-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 px-5 py-3.5 flex flex-wrap items-center gap-x-6 gap-y-2">
        <MiniStat label={`Runs / ${detail.windowDays}d`} value={String(detail.runsInWindow)} />
        <MiniStat
          label="Success rate"
          value={detail.successRate !== null ? `${detail.successRate}%` : "—"}
          tone={detail.successRate !== null && detail.successRate < 50 ? "text-rose-600 dark:text-rose-400" : undefined}
        />
        <MiniStat label="Active clients" value={String(detail.activeClients)} />
        {detail.needsAttention > 0 && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
            <AlertTriangle size={13} /> {detail.needsAttention} failing on most recent run
          </span>
        )}
      </div>

      {/* The real trend chart — day-by-day, not a static number. */}
      <div className="mt-6">
        <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
          Run volume &amp; success rate — last 30 days, every client
        </p>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-4">
          <RunTrendChart data={trend} />
        </div>
      </div>

      {detail.repSignals && (
        <div className="mt-6 space-y-3">
          <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Reputation Manager signals &middot; every enrolled client, last {detail.windowDays}d
          </p>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <MiniStat
                label="AI engine checks"
                value={String(detail.repSignals.engineChecks)}
              />
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-mono uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Trustpilot reviews</span>
                <span className="text-sm font-bold tabular-nums text-zinc-800 dark:text-zinc-200">
                  {detail.repSignals.trustpilotReviews}
                  {detail.repSignals.trustpilotAvgRating && (
                    <span className="ml-1.5 text-[11px] font-normal text-zinc-400 dark:text-zinc-600">avg {detail.repSignals.trustpilotAvgRating}</span>
                  )}
                </span>
              </div>
              <MiniStat label="Reddit mentions" value={String(detail.repSignals.redditMentions)} />
              <MiniStat
                label="Flagged signals"
                value={String(detail.repSignals.flaggedSignals)}
                tone={detail.repSignals.flaggedSignals > 0 ? "text-rose-600 dark:text-rose-400" : undefined}
              />
            </div>
            <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/60">
              <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">Sentiment across every signal</p>
              <SentimentBar {...detail.repSignals.sentiment} />
            </div>
          </div>
        </div>
      )}

      {/* Compact recent-activity strip — not the focus of the page
          anymore, so capped short instead of an unbounded log. */}
      <div className="mt-6 mb-4">
        <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">Recent activity</p>
        {recentActivity.length === 0 ? (
          <p className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">No runs recorded in this window.</p>
        ) : (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
            {recentActivity.map((run) => (
              <Link
                key={run.id}
                href={`/dashboard/runs/${run.id}`}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
              >
                <span className="font-medium text-zinc-700 dark:text-zinc-300 truncate">{run.buyerName}</span>
                <span className={`font-mono shrink-0 ${STATUS_STYLES[run.status] ?? "text-zinc-500"}`}>{run.status}</span>
                <span className="text-zinc-400 dark:text-zinc-500 font-mono shrink-0">{new Date(run.startedAt).toLocaleString()}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
