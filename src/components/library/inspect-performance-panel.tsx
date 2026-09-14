"use client";

// The "Inspect performance" menu item's actual result — the honest,
// real business-outcome view, not a runtime-log list and not a generic
// StatCard grid. No narrative, no model call: everything here is a
// number a query actually produced. Deliberately its own plain visual
// identity (border-border/bg-background, no amber accent, no Lightbulb)
// so it never reads as an AI feature it isn't — see
// src/features/reports/server/skill-inspect.ts for where these numbers
// come from.

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Loader2, X } from "lucide-react";
import type { WorkerId } from "@/lib/worker-registry";

interface InspectBlock {
  label: string;
  displayValue: string;
  tone?: "positive" | "warning" | "negative" | "neutral";
  trendLabel: string | null;
}

interface InspectData {
  outcome: { week: InspectBlock | null; month: InspectBlock | null };
  operational: { runsInWindow: number; successRate: number | null; needsAttention: boolean };
  workerName: string;
}

const TONE_CLASS: Record<string, string> = {
  positive: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  negative: "text-rose-600 dark:text-rose-400",
  neutral: "text-zinc-800 dark:text-zinc-200",
};

function TrendIcon({ trendLabel }: { trendLabel: string | null }) {
  if (!trendLabel) return null;
  if (trendLabel.startsWith("+")) return <TrendingUp size={11} className="text-emerald-600 dark:text-emerald-400" />;
  if (trendLabel.startsWith("-")) return <TrendingDown size={11} className="text-rose-600 dark:text-rose-400" />;
  return <Minus size={11} className="text-zinc-400 dark:text-zinc-600" />;
}

export function InspectPerformancePanel({
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
  const [data, setData] = useState<InspectData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/workers/${workerId}/inspect`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Couldn't load performance data.");
      setData(json);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't load performance data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasOutcome = Boolean(data?.outcome.week || data?.outcome.month);

  return (
    <div className="mt-2 rounded-lg border border-border bg-background p-4 space-y-4 font-sans antialiased motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-200">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {workerName} performance
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close performance view"
          className="text-zinc-400 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors cursor-pointer p-0.5 -m-0.5 rounded"
        >
          <X size={14} />
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 py-6 justify-center">
          <Loader2 size={14} className="animate-spin" /> Loading real performance data…
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

      {data && !loading && (
        <>
          {hasOutcome ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {data.outcome.week && (
                <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 p-4">
                  <p className="text-[10px] font-mono uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    {data.outcome.week.label} · this week
                  </p>
                  <p className={`text-3xl font-bold mt-1 tabular-nums ${TONE_CLASS[data.outcome.week.tone ?? "neutral"]}`}>
                    {data.outcome.week.displayValue}
                  </p>
                  <div className="flex items-center gap-1 mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                    <TrendIcon trendLabel={data.outcome.week.trendLabel} />
                    {data.outcome.week.trendLabel ?? "no baseline yet to compare against"}
                  </div>
                </div>
              )}
              {data.outcome.month && (
                <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 p-4">
                  <p className="text-[10px] font-mono uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    {data.outcome.month.label} · this month
                  </p>
                  <p className={`text-3xl font-bold mt-1 tabular-nums ${TONE_CLASS[data.outcome.month.tone ?? "neutral"]}`}>
                    {data.outcome.month.displayValue}
                  </p>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-600 mt-1">month-to-date</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 px-3 py-3">
              No tracked business outcome yet for this skill.
            </p>
          )}

          {/* Real operational signal — always shown, doubles as the
              fallback for a worker with no outcome resolver at all. */}
          <div className="flex items-center gap-4 text-xs font-mono pt-3 border-t border-zinc-100 dark:border-zinc-800/60">
            <span className="text-zinc-600 dark:text-zinc-400">
              <strong className="text-zinc-900 dark:text-zinc-100 tabular-nums">{data.operational.runsInWindow}</strong> runs/30d
            </span>
            <span
              className={
                data.operational.successRate === null
                  ? "text-zinc-400 dark:text-zinc-600"
                  : data.operational.successRate >= 80
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-orange-600 dark:text-orange-400"
              }
            >
              {data.operational.successRate !== null ? `${data.operational.successRate}% success` : "No runs yet"}
            </span>
            {data.operational.needsAttention && (
              <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400 font-semibold">
                <AlertTriangle size={11} /> failing
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
