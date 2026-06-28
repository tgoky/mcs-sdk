"use client";

import { useState, useEffect, useCallback } from "react";

interface SkillRun {
  id: string;
  skillName: string;
  status: string;
  phase: string | null;
  startedAt: Date;
}

interface LiveExecutionFeedProps {
  initialRuns: SkillRun[];
}

export function LiveExecutionFeed({ initialRuns }: LiveExecutionFeedProps) {
  const [runs, setRuns] = useState<SkillRun[]>(initialRuns);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [polling, setPolling] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/skill-runs/recent", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setRuns(data.runs ?? []);
      setLastRefresh(new Date());
    } catch {}
  }, []);

  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [polling, refresh]);

  if (runs.length === 0) {
    return (
      <div className="h-36 border border-dashed border-zinc-900 rounded-lg flex flex-col items-center justify-center space-y-1.5">
        <p className="text-sm font-normal text-zinc-500">
          No runtime activity recorded yet.
        </p>
        <p className="text-xs font-mono text-zinc-600 uppercase tracking-wider">
          Waiting for active loop operations...
        </p>
      </div>
    );
  }

  // MINIMALIST COMPOSITION: Complete removal of color highlight code tags and blinking indicator dots
  const statusLabels: Record<string, string> = {
    success: "complete",
    failed: "degraded",
    running: "executing",
  };

  const statusStyles: Record<string, string> = {
    success: "text-zinc-300 font-medium",
    failed: "text-zinc-500 line-through tracking-normal opacity-60",
    running: "text-zinc-400 font-normal tracking-wide italic select-none",
  };

  return (
    <div className="space-y-4">
      {/* Polling Header Tracker Info */}
      <div className="flex items-center justify-between px-1 text-xs">
        <div className="flex items-center space-x-2">
          <span className="font-mono text-zinc-600 uppercase tracking-widest">
            {polling ? "Stream: streaming live" : "Stream: feed paused"} · Refresh window:{" "}
            {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
          </span>
        </div>
        <button
          onClick={() => setPolling((p) => !p)}
          className="text-xs font-mono text-zinc-500 hover:text-zinc-200 transition-colors uppercase tracking-wider bg-zinc-900/30 border border-zinc-900 px-2 py-0.5 rounded cursor-pointer"
        >
          {polling ? "[ Pause Stream ]" : "[ Resume Stream ]"}
        </button>
      </div>

      {/* Flat Monochrome Table Frame */}
      <div className="w-full overflow-hidden border border-zinc-900 rounded-lg bg-zinc-950/10">
        <table className="w-full text-left border-collapse text-xs sm:text-sm font-sans tracking-tight">
          <thead>
            <tr className="border-b border-zinc-900 bg-zinc-900/20 text-zinc-500 font-mono text-[10px] uppercase tracking-widest">
              <th className="p-3.5 font-normal">Module Engine</th>
              <th className="p-3.5 font-normal">Active Pipeline Phase</th>
              <th className="p-3.5 font-normal">Status Status</th>
              <th className="p-3.5 font-normal text-right">Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900/50 font-normal text-zinc-400">
            {runs.map((run) => {
              const currentStatus = run.status?.toLowerCase() ?? "running";
              return (
                <tr key={run.id} className="hover:bg-zinc-900/10 transition-colors duration-150">
                  <td className="p-3.5 font-mono text-zinc-200 text-xs sm:text-sm">
                    {run.skillName}
                  </td>
                  <td className="p-3.5 text-zinc-400 font-mono text-xs opacity-85">
                    {run.phase ? run.phase.replace(/_/g, " ") : "initialization"}
                  </td>
                  <td className="p-3.5">
                    <span className={`font-mono text-xs uppercase ${statusStyles[currentStatus] || "text-zinc-400"}`}>
                      [{statusLabels[currentStatus] || "executing"}]
                    </span>
                  </td>
                  <td className="p-3.5 font-mono text-right text-zinc-500 text-xs sm:text-sm">
                    {new Date(run.startedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: false,
                    })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}