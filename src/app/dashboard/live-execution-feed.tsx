"use client";

import { useState, useEffect, useCallback } from "react";
import {
  skillName,
  phaseLabel,
  runStatusLabel,
  runStatusColor,
  ACTIVITY_FEED_COPY as copy,
} from "@/lib/copy";

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
          {copy.emptyTitle}
        </p>
        <p className="text-xs text-zinc-600">
          {copy.emptySubtitle}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status row */}
      <div className="flex items-center justify-between px-1 text-xs">
        <div className="flex items-center space-x-2">
          <span className="text-zinc-500">
            {polling ? copy.liveLabel : copy.pausedLabel} · {copy.lastUpdatedPrefix}{" "}
            {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
          </span>
        </div>
        <button
          onClick={() => setPolling((p) => !p)}
          className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors bg-zinc-900/30 border border-zinc-900 px-2 py-0.5 rounded cursor-pointer"
        >
          {polling ? copy.pauseButton : copy.resumeButton}
        </button>
      </div>

      {/* Table */}
      <div className="w-full overflow-hidden border border-zinc-900 rounded-lg bg-zinc-950/10">
        <table className="w-full text-left border-collapse text-xs sm:text-sm font-sans tracking-tight">
          <thead>
            <tr className="border-b border-zinc-900 bg-zinc-900/20 text-zinc-500 text-[11px] uppercase tracking-wide">
              <th className="p-3.5 font-normal">{copy.columnModule}</th>
              <th className="p-3.5 font-normal">{copy.columnStep}</th>
              <th className="p-3.5 font-normal">{copy.columnStatus}</th>
              <th className="p-3.5 font-normal text-right">{copy.columnTime}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900/50 font-normal text-zinc-400">
            {runs.map((run) => (
              <tr key={run.id} className="hover:bg-zinc-900/10 transition-colors duration-150">
                <td className="p-3.5 text-zinc-200 text-xs sm:text-sm font-medium">
                  {skillName(run.skillName)}
                </td>
                <td className="p-3.5 text-zinc-400 text-xs opacity-85">
                  {phaseLabel(run.phase)}
                </td>
                <td className="p-3.5">
                  <span className={`text-xs ${runStatusColor(run.status)}`}>
                    {runStatusLabel(run.status)}
                  </span>
                </td>
                <td className="p-3.5 text-right text-zinc-500 text-xs sm:text-sm">
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