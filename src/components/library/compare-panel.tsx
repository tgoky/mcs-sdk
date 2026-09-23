"use client";

// The Compare flyout's actual result — deliberately not a spreadsheet.
// A real verdict up top (the LLM narrative — which skill is pulling its
// weight, why, and what to do about it, grounded only in the numbers
// below it), a bar chart for the at-a-glance read, and a compact per-
// skill stat strip for the specifics. Same on-demand-LLM-synthesis
// pattern as account-advisor-panel.tsx, narrowed to the skills someone
// actually picked instead of every enabled worker.

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Lightbulb, AlertTriangle, Loader2, X } from "lucide-react";
import { AnySkillBadge } from "@/components/any-skill-badge";
import type { WorkerId } from "@/lib/worker-registry";

interface CompareSkillStat {
  workerId: WorkerId;
  name: string;
  runsInWindow: number;
  successRate: number | null;
  needsAttention: boolean;
  outcomeLabel: string | null;
  outcomeValue: string | null;
}

interface SkillComparison {
  id: string;
  skills: CompareSkillStat[];
  narrative: string;
  generatedAt: string;
}

const BAR_COLORS = ["#f59e0b", "#6366f1", "#0ea5e9", "#f43f5e", "#10b981", "#a855f7"];

export function ComparePanel({
  engagementId,
  workerIds,
  onClose,
}: {
  engagementId: string;
  workerIds: WorkerId[];
  onClose: () => void;
}) {
  const [comparison, setComparison] = useState<SkillComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/skill-compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't generate a comparison.");
      setComparison(data.comparison);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't generate a comparison.");
    } finally {
      setLoading(false);
    }
  }

  // Fires once, the moment this panel mounts (opening it from the menu
  // already means "yes, compare these") — no separate "Generate" click
  // needed for something the user just explicitly asked for.
  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chartData =
    comparison?.skills.map((s) => ({
      name: s.name,
      runs: s.runsInWindow,
      success: s.successRate ?? 0,
    })) ?? [];

  return (
    <div className="mt-2 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/10 p-4 space-y-4 font-sans antialiased motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-200">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
          Comparing {workerIds.length} skills · last 30 days
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close comparison"
          className="text-zinc-400 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors cursor-pointer p-0.5 -m-0.5 rounded"
        >
          <X size={14} />
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 py-6 justify-center">
          <Loader2 size={14} className="animate-spin" /> Reading the numbers and writing a real comparison…
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

      {comparison && !loading && (
        <>
          {/* The verdict — the actual point of this feature, not an
              afterthought under the numbers. */}
          <div className="flex items-start gap-3 rounded-lg bg-white dark:bg-zinc-900/70 border border-amber-200/70 dark:border-amber-900/40 p-3.5 shadow-sm">
            <div className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 shrink-0">
              <Lightbulb size={14} />
            </div>
            <p className="text-[13px] leading-relaxed text-zinc-800 dark:text-zinc-200">{comparison.narrative}</p>
          </div>

          {/* At-a-glance chart */}
          <div className="h-40 -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-zinc-200 dark:text-zinc-800" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fontFamily: "var(--font-sans)" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fontFamily: "var(--font-sans)" }} tickLine={false} axisLine={false} width={28} />
                <Tooltip
                  contentStyle={{ fontFamily: "var(--font-sans)", fontSize: 11, borderRadius: 8 }}
                  formatter={(value, key) => [key === "success" ? `${value}%` : String(value ?? "No data"), key === "success" ? "Success rate" : "Runs/30d"]}
                />
                <Bar dataKey="runs" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Per-skill specifics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {comparison.skills.map((s) => (
              <div
                key={s.workerId}
                className="flex flex-col gap-1.5 rounded-lg bg-white dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 p-2.5"
              >
                <div className="flex items-center gap-1.5">
                  <AnySkillBadge skill={s.workerId} size={16} />
                  <span className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200 truncate">{s.name}</span>
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-zinc-500 dark:text-zinc-400">{s.runsInWindow} runs</span>
                  <span className={s.successRate !== null && s.successRate < 50 ? "text-rose-600 dark:text-rose-400" : "text-zinc-500 dark:text-zinc-400"}>
                    {s.successRate !== null ? `${s.successRate}%` : "No data"}
                  </span>
                </div>
                {s.outcomeLabel && (
                  <div className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 truncate">
                    {s.outcomeLabel}: <span className="text-zinc-700 dark:text-zinc-300 font-semibold">{s.outcomeValue}</span>
                  </div>
                )}
                {s.needsAttention && (
                  <div className="flex items-center gap-1 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                    <AlertTriangle size={10} /> failing
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
