"use client";

import { useState, useEffect, useCallback } from "react";

interface SkillRun {
  id: string;
  skillName: string;
  status: string;
  phase: string | null;
  costInCents: number | null;
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
    } catch {
      // silent — don't disrupt UI on network hiccup
    }
  }, []);

  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [polling, refresh]);

  if (runs.length === 0) {
    return (
      <div className="h-40 border border-dashed border-zinc-900 rounded flex flex-col items-center justify-center space-y-2">
        <p className="text-xs font-light text-zinc-600">
          Zero active runtime telemetry states found.
        </p>
        <p className="text-[10px] font-mono text-zinc-700">
          Runs will appear here when Pin-Down, Pile-On, or Pre-Call Read execute.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Polling indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span
            className={`h-1 w-1 rounded-full ${
              polling ? "bg-emerald-500 animate-pulse" : "bg-zinc-600"
            }`}
          />
          <span className="text-[10px] font-mono text-zinc-600">
            {polling ? "LIVE" : "PAUSED"} · refreshed{" "}
            {lastRefresh.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            })}
          </span>
        </div>
        <button
          onClick={() => setPolling((p) => !p)}
          className="text-[10px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          {polling ? "PAUSE" : "RESUME"}
        </button>
      </div>

      <div className="w-full overflow-hidden rounded border border-zinc-900 bg-zinc-950/50">
        <table className="w-full text-left border-collapse text-[11px] font-sans tracking-tight">
          <thead>
            <tr className="border-b border-zinc-900 bg-zinc-900/30 text-zinc-500 font-mono text-[10px] uppercase tracking-wider">
              <th className="p-2.5 font-normal">Skill</th>
              <th className="p-2.5 font-normal">Phase</th>
              <th className="p-2.5 font-normal">Status</th>
              <th className="p-2.5 font-normal">Cost</th>
              <th className="p-2.5 font-normal hidden sm:table-cell">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900 font-light text-zinc-400">
            {runs.map((run) => (
              <tr
                key={run.id}
                className="hover:bg-zinc-900/20 transition-colors"
              >
                <td className="p-2.5 font-mono font-normal text-zinc-200">
                  {run.skillName}
                </td>
                <td className="p-2.5">
                  <span className="bg-zinc-900 text-zinc-500 px-1.5 py-0.5 rounded border border-zinc-800 font-mono text-[10px]">
                    {run.phase ?? "init"}
                  </span>
                </td>
                <td className="p-2.5">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border ${
                      run.status === "success"
                        ? "bg-emerald-500/5 text-emerald-400 border-emerald-500/10"
                        : run.status === "failed"
                        ? "bg-rose-500/5 text-rose-400 border-rose-500/10"
                        : "bg-amber-500/5 text-amber-400 border-amber-500/10 animate-pulse"
                    }`}
                  >
                    {/* {run.status.toUpperCase()} */}
                    {(run.status ?? "running").toUpperCase()}
                  </span>
                </td>
                <td className="p-2.5 font-mono text-[10px] text-zinc-300">
                  {run.costInCents
                    ? `$${(run.costInCents / 100).toFixed(4)}`
                    : "$0.00"}
                </td>
                <td className="p-2.5 text-zinc-600 font-mono text-[10px] hidden sm:table-cell">
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
