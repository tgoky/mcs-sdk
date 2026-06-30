"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  SkipForward,
  ChevronDown,
  ChevronUp,
  Cpu,
  Terminal,
  Coins,
  ChevronLeft
} from "lucide-react";
import {
  skillName,
  phaseLabel,
  runStatusLabel,
} from "@/lib/copy";
import type { RunStep, RunSummary } from "@/models/schema";

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

function StepCenterIcon({ status }: { status: RunStep["status"] }) {
  if (status === "success") return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />;
  if (status === "failed") return <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />;
  if (status === "skipped") return <SkipForward className="w-4 h-4 text-zinc-600 shrink-0 mt-0.5" />;
  return <Loader2 className="w-4 h-4 text-zinc-400 animate-spin shrink-0 mt-0.5" />;
}

export default function RunDetailPage() {
  const params = useParams();
  const runId = params?.id as string;

  const [run, setRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(true);

  // Mutable ref captures execution status transitions without re-triggering effects
  const statusRef = useRef<string | null>(null);

  // Sync the ref with the latest status state on every render pass cleanly
  useEffect(() => {
    statusRef.current = run?.status ?? null;
  });

  const fetchRun = useCallback(async () => {
    try {
      const res = await fetch(`/api/skill-runs/${runId}`, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to load run data");
        return;
      }
      const data = await res.json();
      setRun(data.run);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [runId]);

  // Unified data pipeline hook: handles initial mount and isolated polling loops
  useEffect(() => {
    if (!runId) return;

    // Execute the initial data ingestion pass safely on mount
    fetchRun();

    // Poll every 3 seconds ONLY if the mutable reference matches "running"
    const intervalId = setInterval(() => {
      if (statusRef.current === "running") {
        fetchRun();
      }
    }, 3000);

    return () => clearInterval(intervalId);
  }, [runId, fetchRun]);

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
        <Link href="/dashboard" className="inline-flex items-center text-sm text-zinc-500 hover:text-zinc-200 transition-colors">
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
  const isRunning = run.status === "running";
  const summary = run.summary;

  const summaryFields: { key: keyof RunSummary; label: string; color: string }[] = [
    { key: "whatWasAttempted", label: "1. What Was Attempted", color: "text-zinc-400 font-mono" },
    { key: "whatWorked",       label: "2. What Worked",        color: "text-emerald-400 font-mono" },
    { key: "whatFailed",       label: "3. What Failed",        color: "text-rose-400 font-mono"    },
    { key: "openItems",        label: "4. Open Items",         color: "text-amber-400 font-mono"   },
    { key: "decisionsMade",    label: "5. Decisions Made",     color: "text-sky-400 font-mono"     },
  ];

  return (
    <div className="space-y-6 w-full mx-auto tracking-tight antialiased px-1 text-zinc-400">

      {/* Top Header Breadcrumbs */}
      <div className="space-y-3 border-b border-zinc-900 pb-4">
        <Link
          href={`/dashboard/engagements/${run.engagementId}`}
          className="inline-flex items-center text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors gap-0.5"
        >
          <ChevronLeft size={14} />
          Back to {run.buyerName ?? "Client Workspace"}
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 w-full pt-1">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-zinc-100 tracking-tight">
              {skillName(run.skillName)} — Telemetry Audit
            </h1>
            <p className="text-[11px] font-mono text-zinc-600">Run ID: {run.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${
              run.status.toLowerCase() === 'success' ? 'text-emerald-400 border-emerald-900/50 bg-emerald-950/30' :
              run.status.toLowerCase() === 'failed' ? 'text-rose-400 border-rose-900/50 bg-rose-950/30' :
              'text-zinc-400 border-zinc-800 bg-zinc-950/30'
            }`}>
              {run.status.toLowerCase() === 'success' ? <CheckCircle2 className="w-3.5 h-3.5" /> :
               run.status.toLowerCase() === 'failed' ? <XCircle className="w-3.5 h-3.5" /> :
               <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {runStatusLabel(run.status)}
            </span>
          </div>
        </div>
      </div>

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
          <p className="text-xs text-zinc-200 font-mono">{isRunning ? "In progress…" : formatDuration(run.durationMs)}</p>
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

      {/* 5-Field Summary Matrix */}
      {summary ? (
        <div className="border border-zinc-900 rounded-xl overflow-hidden bg-zinc-950/40">
          <button
            onClick={() => setSummaryOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-3 border-b border-zinc-900 bg-zinc-950/60 hover:bg-zinc-900/20 transition-colors text-left"
          >
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Phase Log Compaction Summary
            </span>
            {summaryOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {summaryOpen && (
            <div className="divide-y divide-zinc-900/60 text-xs font-sans">
              {summaryFields.map(({ key, label, color }) => {
                const items = summary[key] ?? [];
                if (items.length === 0 && key !== "whatFailed") return null;

                return (
                  <div key={key} className="p-4 space-y-1.5">
                    <p className={`text-[11px] font-semibold uppercase tracking-wider ${color}`}>{label}</p>
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
      ) : !isRunning && (
        <div className="border border-dashed border-zinc-900 rounded-lg p-4 text-center">
          <p className="text-xs text-zinc-600">No operational compaction summary recorded for this historical run.</p>
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
          <div className="border border-dashed border-zinc-900 rounded-lg p-6 text-center">
            <p className="text-xs text-zinc-600">Awaiting runtime diagnostics pipeline steps...</p>
          </div>
        ) : (
          <div className="border border-zinc-900 bg-zinc-950/20 rounded-xl p-5 space-y-1">
            {steps.map((step, i) => {
              const stepDurationMs =
                step.completedAt && step.startedAt
                  ? new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime()
                  : null;

              return (
                <div key={`${step.phase}-${i}`} className="flex gap-3 group">
                  <div className="flex flex-col items-center">
                    <StepCenterIcon status={step.status} />
                    <div className="w-px flex-1 mt-1 bg-zinc-900 group-last:hidden" />
                  </div>

                  <div className="pb-4 min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <span className="text-sm font-medium text-zinc-200">{phaseLabel(step.phase)}</span>
                        {step.label && <span className="ml-2 text-xs text-zinc-500 font-mono">[{step.label}]</span>}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-zinc-600 shrink-0 font-mono">
                        {stepDurationMs !== null && <span>{formatDuration(stepDurationMs)}</span>}
                        <span>{formatTime(step.startedAt)}</span>
                      </div>
                    </div>
                    {step.detail && <p className="mt-1 text-xs text-zinc-500 leading-relaxed font-light">{step.detail}</p>}
                  </div>
                </div>
              );
            })}

            {isRunning && (
              <div className="flex gap-3 mt-1">
                <Loader2 className="w-4 h-4 text-zinc-600 animate-spin shrink-0 mt-0.5" />
                <span className="text-xs text-zinc-600 italic font-light">Next automated task compiling…</span>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}