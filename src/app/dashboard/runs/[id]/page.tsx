"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
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
  if (status === "success") return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />;
  if (status === "failed") return <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />;
  if (status === "cancelled") return <Ban className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />;
  if (status === "skipped") return <SkipForward className="w-4 h-4 text-zinc-600 shrink-0 mt-0.5" />;
  return <Loader2 className="w-4 h-4 text-zinc-400 animate-spin shrink-0 mt-0.5" />;
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
      {/* Timeline spine */}
      <div className="flex flex-col items-center">
        <StepCenterIcon status={step.status} displayInterrupted={displayInterrupted} />
        <div className="w-px flex-1 mt-1 bg-zinc-900 group-last:hidden" />
      </div>

      {/* Content */}
      <div className="pb-4 min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <span className="text-sm font-medium text-zinc-200">
              {phaseLabel(step.phase)}
            </span>
            {step.label && (
              <span className="ml-2 text-xs text-zinc-500 font-mono">
                [{step.label}]
              </span>
            )}
            {displayInterrupted && (
              <span className="ml-2 text-[10px] text-amber-500 uppercase tracking-wide">
                Interrupted
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-zinc-600 shrink-0 font-mono">
            {stepDurationMs !== null && (
              <span>{formatDuration(stepDurationMs)}</span>
            )}
            <span>{formatTime(step.startedAt)}</span>
          </div>
        </div>

        {step.detail && (
          <p className="mt-1 text-xs text-zinc-500 leading-relaxed font-light">
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
    { key: "whatWasAttempted", label: "1. What Was Attempted", color: "text-zinc-400 font-mono" },
    { key: "whatWorked",       label: "2. What Worked",        color: "text-emerald-400 font-mono" },
    { key: "whatFailed",       label: "3. What Failed",        color: "text-rose-400 font-mono"    },
    { key: "openItems",        label: "4. Open Items",         color: "text-amber-400 font-mono"   },
    { key: "decisionsMade",    label: "5. Decisions Made",     color: "text-sky-400 font-mono"     },
  ];

  const hasContent = fields.some((f) => (summary[f.key]?.length ?? 0) > 0);
  if (!hasContent) return null;

  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950/40">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 border-b border-zinc-900 bg-zinc-950/60 hover:bg-zinc-900/20 transition-colors text-left font-sans"
      >
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          Phase Log Compaction Summary
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-zinc-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-zinc-500" />
        )}
      </button>

      {open && (
        <div className="divide-y divide-zinc-900/60 text-xs font-sans">
          {fields.map(({ key, label, color }) => {
            const items = summary[key] ?? [];
            if (items.length === 0 && key !== "whatFailed") return null;
            return (
              <div key={key} className="p-4 space-y-1.5">
                <p className={`text-[11px] font-semibold uppercase tracking-wider ${color}`}>
                  {label}
                </p>
                {items.length > 0 ? (
                  <ul className="space-y-1">
                    {items.map((item, i) => (
                      <li key={i} className="text-xs text-zinc-400 leading-relaxed flex gap-2 font-light">
                        <span className="text-zinc-700 shrink-0">·</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-zinc-600 italic font-light">No structural errors or processing anomalies detected in this frame slice.</p>
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
    success: { icon: <CheckCircle2 className="w-4 h-4" />, cls: "text-emerald-400 border-emerald-900/50 bg-emerald-950/30" },
    failed:  { icon: <XCircle className="w-4 h-4" />,      cls: "text-rose-400 border-rose-900/50 bg-rose-950/30"         },
    cancelled: { icon: <Ban className="w-4 h-4" />,         cls: "text-amber-400 border-amber-900/50 bg-amber-950/30"        },
    timed_out: { icon: <Clock className="w-4 h-4" />,       cls: "text-amber-400 border-amber-900/50 bg-amber-950/30"        },
    running: { icon: <Loader2 className="w-4 h-4 animate-spin" />, cls: "text-zinc-400 border-zinc-800 bg-zinc-950/30"   },
  }[s] ?? { icon: <AlertCircle className="w-4 h-4" />, cls: "text-zinc-500 border-zinc-800 bg-zinc-950/30" };

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${cfg.cls}`}>
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
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

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

  const handleCancel = useCallback(async () => {
    if (!runId) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await fetch(`/api/skill-runs/${runId}/cancel`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCancelError(body.error ?? "Failed to cancel run.");
        return;
      }
      await fetchRun(); // don't wait for the next 3s poll tick
      setConfirmingCancel(false);
    } catch (e: any) {
      setCancelError(e.message ?? "Failed to cancel run.");
    } finally {
      setCancelling(false);
    }
  }, [runId, fetchRun]);

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
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="space-y-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center text-sm text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          <span className="mr-1">←</span> Dashboard
        </Link>
        <div className="border border-rose-900/40 bg-rose-950/20 rounded-lg p-6 text-center">
          <XCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
          <p className="text-sm text-rose-300">{error ?? "Run trace not found"}</p>
        </div>
      </div>
    );
  }

  const steps = run.steps ?? [];

  return (
    <div className="space-y-6 w-full mx-auto tracking-tight antialiased px-1 text-zinc-400">

      {/* Top Header Breadcrumbs */}
      <div className="flex items-center gap-3 flex-wrap border-b border-zinc-900 pb-4">
        {run.engagementId && (
          <Link
            href={`/dashboard/engagements/${run.engagementId}`}
            className="inline-flex items-center text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors gap-0.5"
          >
            <ChevronLeft size={14} />
            Back to {run.buyerName ?? "Client Workspace"}
          </Link>
        )}
        {!run.engagementId && (
          <Link
            href="/dashboard"
            className="inline-flex items-center text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors gap-0.5"
          >
            <ChevronLeft size={14} />
            Back to Dashboard
          </Link>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 w-full pt-1">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-zinc-100 tracking-tight">
              {skillName(run.skillName)} — Telemetry Audit
            </h1>
            <p className="text-[11px] font-mono text-zinc-600">Run ID: {run.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <RunStatusBadge status={run.status} />
            {isRunning && (
              <span className="text-[10px] text-zinc-600 animate-pulse">Live — refreshing every 3s</span>
            )}
            {isRunning && !confirmingCancel && (
              <button
                onClick={() => setConfirmingCancel(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border border-zinc-800 text-zinc-400 hover:text-rose-400 hover:border-rose-900/50 hover:bg-rose-950/20 transition-colors"
              >
                <Ban size={13} />
                Cancel run
              </button>
            )}
            {isRunning && confirmingCancel && (
              <div className="inline-flex items-center gap-2 text-xs">
                <span className="text-zinc-500">Stop this run?</span>
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="inline-flex items-center gap-1.5 font-medium px-2.5 py-1 rounded-full border border-rose-900/50 text-rose-400 bg-rose-950/20 hover:bg-rose-950/40 transition-colors disabled:opacity-50"
                >
                  {cancelling ? <Loader2 size={13} className="animate-spin" /> : <Ban size={13} />}
                  {cancelling ? "Cancelling…" : "Confirm"}
                </button>
                <button
                  onClick={() => { setConfirmingCancel(false); setCancelError(null); }}
                  disabled={cancelling}
                  className="text-zinc-500 hover:text-zinc-300 px-1.5 py-1 disabled:opacity-50"
                >
                  Back
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cancel error notice */}
      {cancelError && (
        <div className="border border-rose-900/40 bg-rose-950/10 rounded-lg p-3">
          <p className="text-xs text-rose-300">{cancelError}</p>
        </div>
      )}

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-zinc-900 bg-zinc-950/20 p-3.5 space-y-1">
          <div className="flex items-center gap-1.5 text-zinc-600">
            <Cpu size={13} />
            <span className="text-[11px] font-medium uppercase tracking-wider">Pipeline</span>
          </div>
          <p className="text-xs text-zinc-200 font-medium truncate">{phaseLabel(run.phase)}</p>
        </div>

        <div className="rounded-lg border border-zinc-900 bg-zinc-950/20 p-3.5 space-y-1">
          <div className="flex items-center gap-1.5 text-zinc-600">
            <Clock size={13} />
            <span className="text-[11px] font-medium uppercase tracking-wider">Duration</span>
          </div>
          <p className="text-xs text-zinc-200 font-mono">{isRunning ? "In progress…" : isCancelled ? "Cancelled" : isTimedOut ? "Timed out" : formatDuration(run.durationMs)}</p>
        </div>

        <div className="rounded-lg border border-zinc-900 bg-zinc-950/20 p-3.5 space-y-1">
          <div className="flex items-center gap-1.5 text-zinc-600">
            <Terminal size={13} />
        <span className="text-[11px] font-medium uppercase tracking-wider">Context Volume</span>
          </div>
          <p className="text-xs text-zinc-200 font-mono truncate">{formatTokens(run.tokenUsage)}</p>
        </div>

        <div className="rounded-lg border border-zinc-900 bg-zinc-950/20 p-3.5 space-y-1">
          <div className="flex items-center gap-1.5 text-zinc-600">
            <Coins size={13} />
            <span className="text-[11px] font-medium uppercase tracking-wider">Cost</span>
          </div>
          <p className="text-xs text-emerald-400 font-mono">{formatCost(run.costInCents)}</p>
        </div>
      </div>

      {/* Stack Error Trace Window */}
      {run.status === "failed" && run.errorMessage && (
        <div className="border border-rose-900/40 bg-rose-950/10 rounded-lg p-4 space-y-1">
          <p className="text-xs font-semibold text-rose-400 uppercase tracking-wider">Fatal Pipeline Exception</p>
          <p className="text-xs text-rose-300 font-mono leading-relaxed">{run.errorMessage}</p>
        </div>
      )}

      {/* Cancellation notice */}
      {isCancelled && (
        <div className="border border-amber-900/40 bg-amber-950/10 rounded-lg p-4 space-y-1">
          <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Run Cancelled</p>
          <p className="text-xs text-amber-300 font-light leading-relaxed">
            This run was cancelled by user request. Any steps that were in progress at the time have been marked as cancelled.
          </p>
        </div>
      )}

      {/* Timeout notice — closed automatically by the stale-run reaper, not by the user */}
      {isTimedOut && (
        <div className="border border-amber-900/40 bg-amber-950/10 rounded-lg p-4 space-y-1">
          <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Run Timed Out</p>
          <p className="text-xs text-amber-300 font-light leading-relaxed">
            This run sat in progress longer than its allowed runtime and was closed automatically. If this keeps happening for the same module, check the step where it stalled — that's usually an upstream API call hanging.
          </p>
        </div>
      )}

      {/* Timeline Tracking Tree */}
      <div className="space-y-2">
        <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
          Task Execution History Tree
          <span className="ml-2 font-mono text-[10px] text-zinc-700 font-normal lowercase">
            ({steps.length} step{steps.length !== 1 ? "s" : ""})
          </span>
        </h2>

        {steps.length === 0 ? (
          <div className="border border-dashed border-zinc-800 rounded-lg p-6 text-center">
            <p className="text-xs text-zinc-600">
              {isRunning ? "Awaiting first active micro-step register…" : "No step log was recorded for this run."}
            </p>
          </div>
        ) : (
          <div className="border border-zinc-800 rounded-lg bg-zinc-950/20 p-4 space-y-1">
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
              <div className="flex gap-3 mt-1">
                <Loader2 className="w-4 h-4 text-zinc-600 animate-spin shrink-0 mt-0.5" />
                <span className="text-xs text-zinc-600 italic font-light">Next automated task compiling…</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5-Field Summary Matrix */}
      {run.summary && (
        <SummarySection summary={run.summary} defaultOpen={run.status !== "running"} />
      )}

      {/* Empty summary notice for terminal runs without one */}
      {!run.summary && run.status !== "running" && (
        <div className="border border-dashed border-zinc-800 rounded-lg p-4">
          <p className="text-xs text-zinc-600">
            No structured summary was recorded for this run. Re-triggering the module will produce a full five-field summary going forward.
          </p>
        </div>
      )}
    </div>
  );
}