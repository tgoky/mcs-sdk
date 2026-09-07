// src/app/dashboard/analytics/[workerId]/page.tsx
//
// Phase 8 — the "one per-worker view parameterized by workerId over
// skillRuns" this app's roadmap named as Phase 8, replacing the old
// per-product routing (worker-card.tsx used to send every Showtime
// worker's Analytics button to /dashboard/analytics and every
// Reputation Manager worker's to a separate, hand-built page with no
// skillRuns data at all) with one destination shape for any worker in
// the unified registry, regardless of product.
//
// For a Reputation Manager worker, the three watch skills' own signal
// tables (rep_engine_findings, rep_trustpilot_reviews, rep_reddit_mentions)
// are folded in below the generic run stats — the exact same rollup the
// old standalone /dashboard/reputation-manager/analytics page rendered,
// now reachable from every RM worker's own page instead of one page
// nothing else in the app linked to directly.

import { notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { isWorkerId } from "@/lib/worker-registry";
import { getWorkerAnalyticsDetail } from "@/lib/worker-analytics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PRODUCT_LABELS = { showtime: "Showtime", "reputation-manager": "Reputation Manager" } as const;

const STATUS_STYLES: Record<string, string> = {
  success: "text-emerald-600 dark:text-emerald-400",
  failed: "text-rose-600 dark:text-rose-400",
  timed_out: "text-rose-600 dark:text-rose-400",
  running: "text-amber-600 dark:text-amber-400",
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900/60">
      <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{label}</p>
      <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">{value}</p>
      {sub && <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{sub}</p>}
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

  const detail = await getWorkerAnalyticsDetail(whopUserId, activeWorkspace.workspaceId, workerId);

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

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label={`Runs (last ${detail.windowDays}d)`} value={detail.runsInWindow} />
        <StatCard label="Success rate" value={detail.successRate !== null ? `${detail.successRate}%` : "—"} />
        <StatCard label="Active clients" value={detail.activeClients} />
        <StatCard
          label="Needs attention"
          value={detail.needsAttention}
          sub={detail.needsAttention > 0 ? "failing on most recent run" : undefined}
        />
      </div>

      {detail.repSignals && (
        <div className="mt-6 space-y-3">
          <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Reputation Manager signals (every enrolled client)
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="AI engine checks" value={detail.repSignals.engineChecks} />
            <StatCard
              label="Trustpilot reviews"
              value={detail.repSignals.trustpilotReviews}
              sub={detail.repSignals.trustpilotAvgRating ? `avg rating ${detail.repSignals.trustpilotAvgRating}` : undefined}
            />
            <StatCard label="Reddit mentions" value={detail.repSignals.redditMentions} />
            <StatCard label="Flagged signals" value={detail.repSignals.flaggedSignals} />
          </div>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900/60">
            <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">Sentiment across every signal</p>
            <SentimentBar {...detail.repSignals.sentiment} />
          </div>
        </div>
      )}

      <div className="mt-6">
        <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
          Recent runs (last {detail.windowDays}d)
        </p>
        {detail.recentRuns.length === 0 ? (
          <p className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">No runs recorded in this window.</p>
        ) : (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900/60 overflow-hidden">
            {detail.recentRuns.map((run) => (
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
