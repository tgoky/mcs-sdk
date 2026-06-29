"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2, AlertCircle, Hash } from "lucide-react";
import { skillName, phaseLabel, SKILL_INFO, type SkillName } from "@/lib/copy";

interface SkillRun {
  id: string;
  skillName: string;
  status: string;
  phase: string | null;
  startedAt: string;
  engagementId?: string | null;
  buyerName?: string | null;
}

interface LiveExecutionFeedProps {
  initialRuns: SkillRun[];
}

function actionSummary(run: SkillRun): string {
  const s = run.status.toLowerCase();
  const skill = run.skillName as SkillName;

  if (s === "running") {
    return phaseLabel(run.phase);
  }

  if (s === "failed") {
    return "Stopped — check credentials or re-trigger";
  }

  const summaries: Partial<Record<SkillName, string>> = {
    "pin-down":      "Client account set up and confirmation page live",
    "pile-on":       "Pre-call sequence queued for this booking",
    "pre-call-read": "Call brief sent to your team",
    "win-back":      "Win-back sequence triggered for no-show",
    "leak-map":      "Funnel health report generated",
  };

  return summaries[skill] ?? SKILL_INFO[skill]?.description ?? "Completed";
}

function RunStatusIcon({ status }: { status: string }) {
  const s = status.toLowerCase();

  if (s === "success" || s === "completed") {
    return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  }
  if (s === "failed" || s === "error") {
    return <XCircle className="w-4 h-4 text-zinc-500" />;
  }
  if (s === "running" || s === "in_progress") {
    return <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />;
  }
  return <AlertCircle className="w-4 h-4 text-zinc-600" />;
}

function StatusLabel({ status }: { status: string }) {
  const s = status.toLowerCase();

  if (s === "success" || s === "completed") {
    return <span className="text-xs font-normal text-zinc-400">Complete</span>;
  }
  if (s === "failed" || s === "error") {
    return <span className="text-xs font-normal text-zinc-500">Failed</span>;
  }
  if (s === "running" || s === "in_progress") {
    return <span className="text-xs font-normal text-zinc-400">Running</span>;
  }
  return <span className="text-xs font-normal text-zinc-600">Pending</span>;
}

function ClientCell({ run }: { run: SkillRun }) {
  const displayName = run.buyerName ?? run.engagementId ?? "Unknown client";
  const showHashIcon = !run.buyerName && !!run.engagementId;
  const isLink = !!run.buyerName && !!run.engagementId;

  const inner = (
    <div className="flex items-center gap-2 min-w-0" title={displayName}>
      {showHashIcon && <Hash size={12} className="text-zinc-600 shrink-0" />}
      <span className="text-sm font-medium text-zinc-200 truncate">
        {displayName}
      </span>
    </div>
  );

  if (isLink) {
    return (
      <Link
        href={`/dashboard/engagements/${run.engagementId}`}
        className="block hover:text-white transition-colors"
      >
        {inner}
      </Link>
    );
  }

  return inner;
}

function RelativeTime({ isoString }: { isoString: string }) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    function compute() {
      const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
      if (diff < 60) return `${diff}s`;
      if (diff < 3600) return `${Math.floor(diff / 60)}m`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
      return `${Math.floor(diff / 86400)}d`;
    }
    setLabel(compute());
    const id = setInterval(() => setLabel(compute()), 1000);
    return () => clearInterval(id);
  }, [isoString]);

  return (
    <span className="text-xs font-mono text-zinc-600 tabular-nums">
      {label}
    </span>
  );
}

export function LiveExecutionFeed({ initialRuns }: LiveExecutionFeedProps) {
  const [runs, setRuns] = useState<SkillRun[]>(initialRuns);
  const [polling, setPolling] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/skill-runs/recent", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setRuns(data.runs ?? []);
    } catch {}
  }, []);

  useEffect(() => {
    if (!polling) return;
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [polling, refresh]);

  if (runs.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center border border-zinc-800 rounded-lg bg-zinc-950/50">
        <div className="text-center space-y-1">
          <p className="text-sm font-medium text-zinc-500">No executions yet</p>
          <p className="text-xs text-zinc-600 max-w-sm">
            Skill runs will appear here once triggered for a client engagement
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-zinc-800 rounded-lg bg-zinc-950/30 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 bg-zinc-950/50">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
            Live Executions
          </h3>
          <span className="text-xs font-mono text-zinc-600">
            {runs.length}
          </span>
        </div>
        <button
          onClick={() => setPolling((p) => !p)}
          className="text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {polling ? "Pause live" : "Resume live"}
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-zinc-800/50">
              <th className="text-left px-4 py-2 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider w-[200px]">
                Client
              </th>
              <th className="text-left px-4 py-2 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">
                Module
              </th>
              <th className="text-left px-4 py-2 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">
                Action
              </th>
              <th className="text-left px-4 py-2 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider w-28">
                Status
              </th>
              <th className="text-right px-4 py-2 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider w-12">
                Age
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/30">
            {runs.map((run) => {
              const isRunning = run.status.toLowerCase() === "running";

              return (
                <tr
                  key={run.id}
                  className={`
                    hover:bg-zinc-900/40 transition-colors
                    ${isRunning ? "bg-zinc-900/20" : ""}
                  `}
                >
                  {/* Client */}
                  <td className="px-4 py-2.5 max-w-[200px]">
                    <ClientCell run={run} />
                  </td>

                  {/* Module */}
                  <td className="px-4 py-2.5">
                    <span className="text-sm text-zinc-400 whitespace-nowrap">
                      {skillName(run.skillName)}
                    </span>
                  </td>

                  {/* Action */}
                  <td className="px-4 py-2.5 max-w-[300px]">
                    <span
                      className={`
                        text-sm truncate block
                        ${isRunning ? "text-zinc-300" : "text-zinc-500"}
                      `}
                      title={actionSummary(run)}
                    >
                      {actionSummary(run)}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <RunStatusIcon status={run.status} />
                      <StatusLabel status={run.status} />
                    </div>
                  </td>

                  {/* Age */}
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <RelativeTime isoString={run.startedAt} />
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