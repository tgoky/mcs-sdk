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
      <div className="h-32 border border-dashed border-zinc-900 rounded-lg flex flex-col items-center justify-center space-y-1">
        <p className="text-xs font-normal text-zinc-500">
          No runtime activity recorded yet.
        </p>
        <p className="text-[10px] font-mono text-zinc-600">
          Logs appear automatically as operational modules execute.
        </p>
      </div>
    );
  }

  const dotColors: Record<string, string> = {
    success: "bg-emerald-500",
    failed: "bg-rose-500",
    running: "bg-amber-500 animate-pulse",
  };

  const textColors: Record<string, string> = {
    success: "text-zinc-300",
    failed: "text-rose-400/90",
    running: "text-amber-400/90",
  };

  return (
    <div className="space-y-3">
      {/* Polling Header Bar */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center space-x-2">
          <span className={`h-1 w-1 rounded-full ${polling ? "bg-emerald-500 animate-pulse" : "bg-zinc-600"}`} />
          <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">
            {polling ? "Streaming live" : "Feed Paused"} · Refreshed{" "}
            {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
          </span>
        </div>
        <button
          onClick={() => setPolling((p) => !p)}
          className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors uppercase tracking-wider"
        >
          {polling ? "[ Pause ]" : "[ Resume ]"}
        </button>
      </div>

      {/* Flat Minimal Table Frame */}
      <div className="w-full overflow-hidden border border-zinc-900 rounded-lg bg-zinc-950/20">
        <table className="w-full text-left border-collapse text-xs font-sans tracking-tight">
          <thead>
            <tr className="border-b border-zinc-900 bg-zinc-900/20 text-zinc-500 font-mono text-[10px] uppercase tracking-widest">
              <th className="p-3 font-normal">Module Engine</th>
              <th className="p-3 font-normal">Active Phase</th>
              <th className="p-3 font-normal">Execution Status</th>
              <th className="p-3 font-normal text-right">Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900/60 font-normal text-zinc-400">
            {runs.map((run) => (
              <tr key={run.id} className="hover:bg-zinc-900/10 transition-colors duration-150">
                <td className="p-3 font-mono text-zinc-200 text-xs">
                  {run.skillName}
                </td>
                <td className="p-3 text-zinc-400 font-mono text-[11px]">
                  {run.phase ? run.phase.replace(/_/g, " ") : "initialization"}
                </td>
                <td className="p-3">
                  <div className="flex items-center space-x-2">
                    <span className={`h-1 w-1 rounded-full ${dotColors[run.status] ?? "bg-zinc-600"}`} />
                    <span className={`font-mono text-[11px] uppercase tracking-wide ${textColors[run.status] ?? "text-zinc-500"}`}>
                      {run.status}
                    </span>
                  </div>
                </td>
                {/* REMOVED: Cost column. ADDED: Clean localized execution clock stamp */}
                <td className="p-3 font-mono text-right text-zinc-500 text-[11px]">
                  {new Date(run.startedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: false,
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}