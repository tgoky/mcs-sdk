"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2, AlertCircle, Hash, ArrowRight, Clock, Ban } from "lucide-react";
import { skillName, phaseLabel, SKILL_INFO, type SkillName } from "@/lib/copy";

interface SkillRun {
  id: string;
  skillName: string;
  status: string;
  phase: string | null;
  startedAt: string;
  completedAt?: string | null;
  engagementId?: string | null;
  buyerName?: string | null;
  errorMessage?: string | null;
  stepCount?: number;
  /** e.g. "Sarah Jenkins <sarah@acme.com>" — the prospect this run is about, when known. */
  subjectLabel?: string | null;
}

interface LiveExecutionFeedProps {
  initialRuns: SkillRun[];
}

function actionSummary(run: SkillRun): string {
  const s = run.status.toLowerCase();
  const skill = run.skillName as SkillName;

  if (s === "running") return phaseLabel(run.phase);
  if (s === "failed") {
    if (run.errorMessage && run.errorMessage.length < 80) return run.errorMessage;
    return "Failed — click to view run telemetry";
  }
  if (s === "timed_out") return "Timed out — exceeded max runtime, click to view";
  if (s === "cancelled") return "Cancelled by user request";

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
  if (s === "success" || s === "completed") return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  if (s === "failed" || s === "error") return <XCircle className="w-4 h-4 text-rose-500" />;
  if (s === "timed_out") return <Clock className="w-4 h-4 text-amber-500" />;
  if (s === "cancelled") return <Ban className="w-4 h-4 text-amber-500" />;
  if (s === "running" || s === "in_progress") return <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />;
  return <AlertCircle className="w-4 h-4 text-zinc-600" />;
}

function StatusLabel({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === "success" || s === "completed") return <span className="text-xs font-normal text-emerald-500">Done</span>;
  if (s === "failed" || s === "error") return <span className="text-xs font-normal text-rose-400">Failed</span>;
  if (s === "timed_out") return <span className="text-xs font-normal text-amber-400">Timed out</span>;
  if (s === "cancelled") return <span className="text-xs font-normal text-amber-400">Cancelled</span>;
  if (s === "running" || s === "in_progress") return <span className="text-xs font-normal text-zinc-400 italic">Running</span>;
  return <span className="text-xs font-normal text-zinc-600">Pending</span>;
}

function ClientCell({ run }: { run: SkillRun }) {
  const displayName = run.buyerName ?? run.engagementId ?? "Unknown client";
  const showHashIcon = !run.buyerName && !!run.engagementId;

  return (
    <div className="flex items-center gap-2 min-w-0" title={displayName}>
      {showHashIcon && <Hash size={12} className="text-zinc-600 shrink-0" />}
      <span className="text-sm font-medium text-zinc-200 truncate">
        {displayName}
      </span>
    </div>
  );
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
    <span className="text-xs font-mono text-zinc-600 tabular-nums">{label}</span>
  );
}

export function LiveExecutionFeed({ initialRuns }: LiveExecutionFeedProps) {
  const router = useRouter();
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
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 bg-zinc-950/50">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
            Live Executions
          </h3>
          <span className="text-xs font-mono text-zinc-600">{runs.length}</span>
        </div>
        <button
          onClick={() => setPolling((p) => !p)}
          className="text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {polling ? "Pause live" : "Resume live"}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px]">
          <thead>
            <tr className="border-b border-zinc-800/50 select-none">
              <th className="text-left px-4 py-2 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider w-[180px]">Client</th>
              <th className="text-left px-4 py-2 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Module</th>
              <th className="text-left px-4 py-2 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Action</th>
              <th className="text-left px-4 py-2 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider w-24">Status</th>
              <th className="text-right px-4 py-2 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider w-12">Age</th>
              <th className="w-8 px-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/30">
            {runs.map((run) => {
              const isRunning = run.status.toLowerCase() === "running";
              const isFailed = run.status.toLowerCase() === "failed" || run.status.toLowerCase() === "timed_out";

              return (
                <tr
                  key={run.id}
                  className={`group hover:bg-zinc-900/40 transition-colors cursor-pointer ${isRunning ? "bg-zinc-900/20" : ""}`}
                  onClick={() => { router.push(`/dashboard/runs/${run.id}`); }}
                >
                  <td className="px-4 py-2.5 max-w-[180px]" onClick={(e) => { if (run.engagementId && run.buyerName) e.stopPropagation(); }}>
                    {run.buyerName && run.engagementId ? (
                      <Link href={`/dashboard/engagements/${run.engagementId}`} onClick={(e) => e.stopPropagation()} className="hover:text-white transition-colors">
                        <ClientCell run={run} />
                      </Link>
                    ) : (
                      <ClientCell run={run} />
                    )}
                  </td>

                  <td className="px-4 py-2.5">
                    <span className="text-sm text-zinc-400 whitespace-nowrap">
                      {skillName(run.skillName)}
                    </span>
                    {(run.stepCount ?? 0) > 0 && (
                      <span className="ml-2 text-[10px] font-mono text-zinc-700">
                        {run.stepCount} step{run.stepCount === 1 ? "" : "s"}
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-2.5 max-w-[280px]">
                    <span
                      className={`text-sm truncate block ${isFailed ? "text-rose-400/80" : isRunning ? "text-zinc-300" : "text-zinc-500"}`}
                      title={actionSummary(run)}
                    >
                      {actionSummary(run)}
                    </span>
                    {run.subjectLabel && (
                      <span className="text-[11px] text-zinc-600 truncate block" title={run.subjectLabel}>
                        {run.subjectLabel}
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <RunStatusIcon status={run.status} />
                      <StatusLabel status={run.status} />
                    </div>
                  </td>

                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <RelativeTime isoString={run.startedAt} />
                  </td>

                  <td className="pr-3 text-right">
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-[-2px] group-hover:translate-x-0 transition-all duration-150" />
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