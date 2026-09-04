import { db } from "@/lib/db";
import { repEngineFindings, repTrustpilotReviews, repRedditMentions } from "@/models/schema";
import { inArray } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace, isPackageInstalledInWorkspace } from "@/lib/workspace";
import { getRepEnrolledEngagementIds } from "@/lib/rep-engagements";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

/**
 * Reputation Manager's Analytics rail destination. Deliberately not a
 * clone of Showtime's /dashboard/analytics (win-back cadences, booking
 * sync, leak-map — none of that applies here) — this rolls up the three
 * watch skills' own tables (rep_engine_findings, rep_trustpilot_reviews,
 * rep_reddit_mentions) across every RM-enrolled client in the workspace,
 * the only cross-client aggregate view RM has right now. Scoped
 * deliberately small: rep-crisis-response and the watch skills are early
 * in their build-out, so this reports what's actually been recorded
 * rather than projecting trends that would be mostly empty series.
 */
export default async function ReputationManagerAnalyticsPage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const activeWorkspace = await getActiveWorkspace(whopUserId);
  if (!(await isPackageInstalledInWorkspace(activeWorkspace.workspaceId, "reputation-manager"))) {
    redirect("/dashboard/library");
  }

  const engagementIds = await getRepEnrolledEngagementIds(whopUserId, activeWorkspace.workspaceId);

  const [findings, reviews, mentions] = engagementIds.length
    ? await Promise.all([
        db.select({ sentiment: repEngineFindings.sentiment, flagged: repEngineFindings.flagged }).from(repEngineFindings).where(inArray(repEngineFindings.engagementId, engagementIds)),
        db.select({ rating: repTrustpilotReviews.rating, sentiment: repTrustpilotReviews.sentiment, flagged: repTrustpilotReviews.flagged }).from(repTrustpilotReviews).where(inArray(repTrustpilotReviews.engagementId, engagementIds)),
        db.select({ sentiment: repRedditMentions.sentiment, flagged: repRedditMentions.flagged }).from(repRedditMentions).where(inArray(repRedditMentions.engagementId, engagementIds)),
      ])
    : [[], [], []];

  const allSignals = [...findings, ...reviews, ...mentions];
  const sentimentCounts = {
    positive: allSignals.filter((s) => s.sentiment === "positive").length,
    neutral: allSignals.filter((s) => s.sentiment === "neutral").length,
    negative: allSignals.filter((s) => s.sentiment === "negative").length,
  };
  const flaggedCount = allSignals.filter((s) => s.flagged).length;
  const avgRating = reviews.length ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1) : "—";

  return (
    <div className="flex flex-col h-full w-full mx-auto tracking-tight antialiased font-sans px-1 text-zinc-600 dark:text-zinc-400 transition-colors duration-200">
      <div className="shrink-0 flex flex-col space-y-0.5 border-b border-zinc-200 dark:border-zinc-800/80 pb-3">
        <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">Analytics</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Every signal recorded across AI-engine checks, Trustpilot, and Reddit for Reputation Manager clients in {activeWorkspace.name}.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="AI engine checks" value={findings.length} />
        <StatCard label="Trustpilot reviews" value={reviews.length} sub={reviews.length ? `avg rating ${avgRating}` : undefined} />
        <StatCard label="Reddit mentions" value={mentions.length} />
        <StatCard label="Flagged signals" value={flaggedCount} />
      </div>

      <div className="mt-6 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900/60">
        <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">Sentiment across every signal</p>
        <SentimentBar {...sentimentCounts} />
      </div>
    </div>
  );
}
