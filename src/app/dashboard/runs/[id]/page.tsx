"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { PinDownResultCard } from "../../pin-down-result-card";
import { CancelRunButton } from "../../cancel-run-button";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  SkipForward,
  ChevronDown,
  ChevronUp,
  Cpu,
  Terminal,
  Coins,
  ChevronLeft,
  Clock,
  Ban
} from "lucide-react";
import {
  skillName,
  phaseLabel,
  runStatusLabel,
} from "@/lib/copy";
import type { RunStep, RunSummary } from "@/models/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RunDetail {
  id: string;
  skillName: string;
  status: string;
  phase: string | null;
  steps: RunStep[] | null;
  summary: RunSummary | null;
  errorMessage: string | null;
  tokenUsage: { input_tokens: number; output_tokens: number } | null;
  costInCents: number | null;
  startedAt: string;
  completedAt: string | null;
  engagementId: string;
  buyerName: string | null;
  durationMs: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function formatTokens(usage: { input_tokens: number; output_tokens: number } | null): string {
  if (!usage) return "—";
  const total = usage.input_tokens + usage.output_tokens;
  return `${total.toLocaleString()} tokens (${usage.input_tokens.toLocaleString()} in / ${usage.output_tokens.toLocaleString()} out)`;
}

// Keeping precision formatting unaltered
function formatCost(cents: number | null): string {
  if (cents === null) return "—";
  return `$${(cents / 100).toFixed(4)}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepCenterIcon({ status, displayInterrupted }: { status: RunStep["status"]; displayInterrupted?: boolean }) {
  if (displayInterrupted) return <Ban className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />;
  if (status === "success") return <CheckCircle2 className="w-4 h-4 text-gold shrink-0 mt-0.5" />;
  if (status === "failed") return <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />;
  if (status === "cancelled") return <Ban className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />;
  if (status === "skipped") return <SkipForward className="w-4 h-4 text-zinc-400 dark:text-zinc-600 shrink-0 mt-0.5" />;
  return <Loader2 className="w-4 h-4 text-zinc-500 dark:text-zinc-400 animate-spin shrink-0 mt-0.5" />;
}

/**
 * `displayInterrupted` is deliberately a render-time-only flag, never
 * written back to the database. See the comment on timeoutRun() in
 * src/lib/run-log.ts for why: a stale run's steps array is never rewritten
 * by the reaper (to avoid a lost-update race against logStep()), so a
 * dangling "running" step on a now-"timed_out" run needs to be shown as
 * interrupted here instead of being persisted as such.
 */
function StepCard({ step, displayInterrupted }: { step: RunStep; displayInterrupted?: boolean }) {
  const stepDurationMs =
    step.completedAt && step.startedAt
      ? new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime()
      : null;

  return (
    <div className="flex gap-3 group">
      {/* Timeline spine layout channel */}
      <div className="flex flex-col items-center">
        <StepCenterIcon status={step.status} displayInterrupted={displayInterrupted} />
        <div className="w-px flex-1 mt-1 bg-zinc-200 dark:bg-zinc-800 group-last:hidden" />
      </div>

      {/* Content wrapper */}
      <div className="pb-4 min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              {phaseLabel(step.phase)}
            </span>
            {step.label && (
              <span className="ml-2 text-xs text-zinc-500 font-mono">
                [{step.label}]
              </span>
            )}
            {displayInterrupted && (
              <span className="ml-2 text-[10px] text-amber-600 dark:text-amber-400 font-mono font-bold uppercase tracking-wide">
                Interrupted
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-zinc-400 dark:text-zinc-600 shrink-0 font-mono">
            {stepDurationMs !== null && (
              <span>{formatDuration(stepDurationMs)}</span>
            )}
            <span>{formatTime(step.startedAt)}</span>
          </div>
        </div>

        {step.detail && (
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed font-normal">
            {step.detail}
          </p>
        )}
      </div>
    </div>
  );
}

function SummarySection({
  summary,
  defaultOpen = true,
}: {
  summary: RunSummary;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const fields: { key: keyof RunSummary; label: string; color: string }[] = [
    { key: "whatWasAttempted", label: "1. What Was Attempted", color: "text-zinc-600 dark:text-zinc-400 font-mono font-bold" },
    { key: "whatWorked",       label: "2. What Worked",        color: "text-gold-hover dark:text-gold font-mono font-bold" },
    { key: "whatFailed",       label: "3. What Failed",        color: "text-rose-600 dark:text-rose-400 font-mono font-bold"    },
    { key: "openItems",        label: "4. Open Items",         color: "text-amber-600 dark:text-amber-400 font-mono font-bold"   },
    { key: "decisionsMade",    label: "5. Decisions Made",     color: "text-sky-600 dark:text-sky-400 font-mono font-bold"     },
  ];

  const hasContent = fields.some((f) => (summary[f.key]?.length ?? 0) > 0);
  if (!hasContent) return null;

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white/40 dark:bg-zinc-950/40 shadow-sm transition-colors duration-200">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-900 bg-zinc-50 dark:bg-zinc-950/60 hover:bg-zinc-100 dark:hover:bg-zinc-900/20 transition-colors text-left font-sans cursor-pointer"
      >
        <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-mono">
          Phase Log Compaction Summary
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
        )}
      </button>

      {open && (
        <div className="divide-y divide-zinc-200/60 dark:divide-zinc-900/60 text-xs font-sans">
          {fields.map(({ key, label, color }) => {
            const items = summary[key] ?? [];
            if (items.length === 0 && key !== "whatFailed") return null;
            return (
              <div key={key} className="p-4 space-y-1.5">
                <p className={`text-[11px] uppercase tracking-wider ${color}`}>
                  {label}
                </p>
                {items.length > 0 ? (
                  <ul className="space-y-1">
                    {items.map((item, i) => (
                      <li key={i} className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed flex gap-2 font-medium">
                        <span className="text-zinc-300 dark:text-zinc-700 shrink-0">&bull;</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-zinc-400 dark:text-zinc-600 italic font-medium">No structural errors or processing anomalies detected in this frame slice.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const cfg = {
    success: { icon: <CheckCircle2 className="w-4 h-4" />, cls: "text-gold-hover dark:text-gold border-gold/25 bg-gold/10" },
    failed:  { icon: <XCircle className="w-4 h-4" />,      cls: "text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30"         },
    cancelled: { icon: <Ban className="w-4 h-4" />,         cls: "text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30"        },
    timed_out: { icon: <Clock className="w-4 h-4" />,       cls: "text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30"        },
    running: { icon: <Loader2 className="w-4 h-4 animate-spin" />, cls: "text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/30"   },
  }[s] ?? { icon: <AlertCircle className="w-4 h-4" />, cls: "text-zinc-500 border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/30" };

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold font-mono px-2.5 py-1 rounded-full border shadow-xs ${cfg.cls}`}>
      {cfg.icon}
      {runStatusLabel(status)}
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function RunDetailPage() {
  const params = useParams();
  const runId = params?.id as string;

  const [run, setRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reusable background data worker: Only changes data state, never touches loading/error screens
  const fetchRun = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch(`/api/skill-runs/${runId}`, {
        cache: "no-store",
        signal,
      });
      if (!res.ok) return;
      const data = await res.json();
      setRun(data.run);
    } catch (e: any) {
      // Background polling errors are intentionally swallowed to preserve UI stability
    }
  }, [runId]);

  // Hook 1: Initial load (Handles isolated error and component-unmount loading safety)
  useEffect(() => {
    if (!runId) return;

    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(`/api/skill-runs/${runId}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? "Failed to load run data");
          return;
        }
        const data = await res.json();
        setRun(data.run);
      } catch (e: any) {
        if (e.name !== "AbortError") {
          setError(e.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, [runId]);

  // Derived state context
  const isRunning = run?.status === "running";
  const isCancelled = run?.status === "cancelled";
  const isTimedOut = run?.status === "timed_out";

  // Hook 2: Safe Background Polling Subscription
  useEffect(() => {
    if (!isRunning) return;

    const controller = new AbortController();
    
    const intervalId = setInterval(() => {
      fetchRun(controller.signal);
    }, 3000);

    return () => {
      clearInterval(intervalId);
      controller.abort();
    };
  }, [isRunning, fetchRun]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 w-full">
        <Loader2 className="w-5 h-5 text-zinc-400 dark:text-zinc-600 animate-spin" />
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="space-y-4 px-1 py-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center text-sm font-semibold font-mono text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
        >
          <span className="mr-1">←</span> Dashboard
        </Link>
        <div className="border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 rounded-lg p-6 text-center shadow-xs animate-in fade-in-50">
          <XCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
          <p className="text-sm font-mono font-bold text-rose-600 dark:text-rose-300">{error ?? "Run trace not found"}</p>
        </div>
      </div>
    );
  }

  const steps = run.steps ?? [];

  return (
    <div className="space-y-6 w-full mx-auto tracking-tight antialiased px-1 text-zinc-600 dark:text-zinc-400 transition-colors duration-200">

      {/* Top Header Breadcrumbs Panel */}
      <div className="flex items-center gap-3 flex-wrap border-b border-zinc-200 dark:border-zinc-900 pb-4">
        {run.engagementId && (
          <Link
            href={`/dashboard/engagements/${run.engagementId}`}
            className="inline-flex items-center text-xs font-bold font-mono text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors gap-0.5"
          >
            <ChevronLeft size={14} />
            Back to {run.buyerName ?? "Client Workspace"}
          </Link>
        )}
        {!run.engagementId && (
          <Link
            href="/dashboard"
            className="inline-flex items-center text-xs font-bold font-mono text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors gap-0.5"
          >
            <ChevronLeft size={14} />
            Back to Dashboard
          </Link>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 w-full pt-1">
          <div className="space-y-1">
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              {skillName(run.skillName)} — Telemetry Audit
            </h1>
            <p className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600">Run ID: {run.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <RunStatusBadge status={run.status} />
            {isRunning && (
              <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600 animate-pulse">Live — refreshing every 3s</span>
            )}
            {isRunning && (
              <CancelRunButton runId={runId} onCancelled={() => fetchRun()} />
            )}
          </div>
        </div>
      </div>

      {/* Overview Metric Performance Grid Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-950/20 p-3.5 space-y-1 shadow-sm">
          <div className="flex items-center gap-1.5 text-zinc-400 dark:text-zinc-600">
            <Cpu size={13} />
            <span className="text-[11px] font-mono uppercase tracking-wider font-bold">Pipeline</span>
          </div>
          <p className="text-xs text-zinc-800 dark:text-zinc-200 font-semibold truncate">{phaseLabel(run.phase)}</p>
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-950/20 p-3.5 space-y-1 shadow-sm">
          <div className="flex items-center gap-1.5 text-zinc-400 dark:text-zinc-600">
            <Clock size={13} />
            <span className="text-[11px] font-mono uppercase tracking-wider font-bold">Duration</span>
          </div>
          <p className="text-xs text-zinc-800 dark:text-zinc-200 font-mono font-semibold">{isRunning ? "In progress…" : isCancelled ? "Cancelled" : isTimedOut ? "Timed out" : formatDuration(run.durationMs)}</p>
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-950/20 p-3.5 space-y-1 shadow-sm">
          <div className="flex items-center gap-1.5 text-zinc-400 dark:text-zinc-600">
            <Terminal size={13} />
            <span className="text-[11px] font-mono uppercase tracking-wider font-bold">Context Volume</span>
          </div>
          <p className="text-xs text-zinc-800 dark:text-zinc-200 font-mono font-semibold truncate">{formatTokens(run.tokenUsage)}</p>
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-950/20 p-3.5 space-y-1 shadow-sm">
          <div className="flex items-center gap-1.5 text-zinc-400 dark:text-zinc-600">
            <Coins size={13} />
            <span className="text-[11px] font-mono uppercase tracking-wider font-bold">Cost</span>
          </div>
          <p className="text-xs text-gold-hover dark:text-gold font-mono font-bold">{run.costInCents !== null ? formatCost(run.costInCents) : "—"}</p>
        </div>
      </div>

      {/* Stack Error Trace Window */}
      {run.status === "failed" && run.errorMessage && (
        <div className="border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/10 rounded-lg p-4 space-y-1 shadow-sm">
          <p className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider font-mono">Fatal Pipeline Exception</p>
          <p className="text-xs text-rose-600 dark:text-rose-300 font-mono leading-relaxed break-all">{run.errorMessage}</p>
        </div>
      )}

      {/* Cancellation notice message container panel */}
      {isCancelled && (
        <div className="border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/10 rounded-lg p-4 space-y-1 shadow-sm">
          <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider font-mono">Run Cancelled</p>
          <p className="text-xs text-amber-700 dark:text-amber-300 font-medium leading-relaxed">
            This run was cancelled by user request. Any steps that were in progress at the time have been marked as cancelled.
          </p>
        </div>
      )}

      {/* Timeout notice panel */}
      {isTimedOut && (
        <div className="border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/10 rounded-lg p-4 space-y-1 shadow-sm">
          <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider font-mono">Run Timed Out</p>
          <p className="text-xs text-amber-700 dark:text-amber-300 font-medium leading-relaxed">
            This run sat in progress longer than its allowed runtime and was closed automatically. If this keeps happening for the same module, check the step where it stalled — that's usually an upstream API call hanging.
          </p>
        </div>
      )}

      {/* Pin-down onboarding result renderer framework panel connection */}
      {run.skillName === "pin-down" && run.status === "success" && (
        <PinDownResultCard engagementId={run.engagementId} />
      )}

      {/* Timeline Tracking execution Tree layouts list content */}
      <div className="space-y-2">
        <h2 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-mono">
          Task Execution History Tree
          <span className="ml-2 font-mono text-[10px] text-zinc-400 dark:text-zinc-700 font-normal lowercase">
            ({steps.length} step{steps.length !== 1 ? "s" : ""})
          </span>
        </h2>

        {steps.length === 0 ? (
          <div className="border border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg p-6 text-center bg-zinc-50/20 dark:bg-transparent">
            <p className="text-xs text-zinc-400 dark:text-zinc-600 font-mono">
              {isRunning ? "Awaiting first active micro-step register…" : "No step log was recorded for this run."}
            </p>
          </div>
        ) : (
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white/40 dark:bg-zinc-950/20 p-4 space-y-1 shadow-sm">
            {steps.map((step, i) => (
              <StepCard
                key={`${step.phase}-${i}`}
                step={step}
                displayInterrupted={
                  step.status === "running" && (run.status === "timed_out" || run.status === "cancelled")
                }
              />
            ))}

            {isRunning && (
              <div className="flex gap-3 mt-1 items-center">
                <Loader2 className="w-4 h-4 text-zinc-400 dark:text-zinc-600 animate-spin shrink-0 mt-0.5" />
                <span className="text-xs text-zinc-400 dark:text-zinc-600 font-medium italic">Next automated task compiling…</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5-Field Compaction Summary matrix template segment mapping block */}
      {run.summary && (
        <SummarySection summary={run.summary} defaultOpen={run.status !== "running"} />
      )}

      {/* Empty summary backup box layer field */}
      {!run.summary && run.status !== "running" && (
        <div className="border border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg p-4 bg-zinc-50/20 dark:bg-transparent transition-colors">
          <p className="text-xs text-zinc-400 dark:text-zinc-600 font-mono">
            No structured summary was recorded for this run. Re-triggering the module will produce a full five-field summary going forward.
          </p>
        </div>
      )}
    </div>
  );
}