"use client";

// The "Run analysis" menu item's actual result — a real verdict on ONE
// skill's performance (the LLM narrative, grounded only in the numbers
// below it), plus the real stat strip it was grounded in. Same on-
// demand-LLM-synthesis pattern as compare-panel.tsx, narrowed to one
// skill instead of a picked set — no bar chart here, there's nothing to
// compare against.

import { useEffect, useState } from "react";
import { Lightbulb, AlertTriangle, Loader2, X } from "lucide-react";
import type { WorkerId } from "@/lib/worker-registry";

interface RunAnalysisOutcome {
  label: string;
  displayValue: string;
  tone?: "positive" | "warning" | "negative" | "neutral";
  trendLabel: string | null;
}

interface RunAnalysisStats {
  runsInWindow: number;
  successRate: number | null;
  needsAttention: boolean;
  outcome: RunAnalysisOutcome | null;
}

interface SkillRunAnalysis {
  id: string;
  stats: RunAnalysisStats;
  narrative: string;
  generatedAt: string;
}

const OUTCOME_TONE_CLASS: Record<string, string> = {
  positive: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  negative: "text-rose-600 dark:text-rose-400",
  neutral: "text-zinc-600 dark:text-zinc-400",
};

export function RunAnalysisPanel({
  engagementId,
  workerId,
  workerName,
  onClose,
}: {
  engagementId: string;
  workerId: WorkerId;
  workerName: string;
  onClose: () => void;
}) {
  const [analysis, setAnalysis] = useState<SkillRunAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/workers/${workerId}/run-analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't generate an analysis.");
      setAnalysis(data.analysis);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't generate an analysis.");
    } finally {
      setLoading(false);
    }
  }

  // Fires once, the moment this panel mounts — opening it from the menu
  // already means "yes, analyze this skill", same as ComparePanel.
  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = analysis?.stats;

  return (
    <div className="mt-2 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/10 p-4 space-y-4 font-sans antialiased motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-200">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
          Analyzing {workerName} · last 30 days
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close analysis"
          className="text-zinc-400 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors cursor-pointer p-0.5 -m-0.5 rounded"
        >
          <X size={14} />
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 py-6 justify-center">
          <Loader2 size={14} className="animate-spin" /> Reading the numbers and writing a real analysis…
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400">
          <AlertTriangle size={13} /> {error}
          <button type="button" onClick={run} className="underline hover:no-underline cursor-pointer">
            Try again
          </button>
        </div>
      )}

      {analysis && stats && !loading && (
        <>
          {/* The verdict — the actual point of this feature, not an
              afterthought under the numbers. */}
          <div className="flex items-start gap-3 rounded-lg bg-white dark:bg-zinc-900/70 border border-amber-200/70 dark:border-amber-900/40 p-3.5 shadow-sm">
            <div className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 shrink-0">
              <Lightbulb size={14} />
            </div>
            <p className="text-[13px] leading-relaxed text-zinc-800 dark:text-zinc-200">{analysis.narrative}</p>
          </div>

          {/* The real stats it was grounded in — same per-skill stat-tile
              language as compare-panel.tsx's per-skill cards, just one
              skill's worth. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="flex flex-col gap-1 rounded-lg bg-white dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 p-2.5">
              <span className="text-[10px] font-mono uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Runs / 30d</span>
              <span className="text-base font-bold text-zinc-800 dark:text-zinc-200 tabular-nums">{stats.runsInWindow}</span>
            </div>
            <div className="flex flex-col gap-1 rounded-lg bg-white dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 p-2.5">
              <span className="text-[10px] font-mono uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Success rate</span>
              <span
                className={`text-base font-bold tabular-nums ${
                  stats.successRate !== null && stats.successRate < 50
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-zinc-800 dark:text-zinc-200"
                }`}
              >
                {stats.successRate !== null ? `${stats.successRate}%` : "No data"}
              </span>
              {stats.needsAttention && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                  <AlertTriangle size={10} /> failing
                </span>
              )}
            </div>
            {stats.outcome ? (
              <div className="flex flex-col gap-1 rounded-lg bg-white dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 p-2.5">
                <span className="text-[10px] font-mono uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{stats.outcome.label}</span>
                <span className={`text-base font-bold tabular-nums ${OUTCOME_TONE_CLASS[stats.outcome.tone ?? "neutral"]}`}>
                  {stats.outcome.displayValue}
                </span>
                {stats.outcome.trendLabel && (
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400">{stats.outcome.trendLabel}</span>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1 rounded-lg bg-white dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 p-2.5 justify-center">
                <span className="text-[10px] text-zinc-400 dark:text-zinc-600">No tracked business outcome yet for this skill</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
