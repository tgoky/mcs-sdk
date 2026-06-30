"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  Clock,
  SkipForward,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  skillName,
  phaseLabel,
  runStatusLabel,
  runStatusColor,
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

function StepIcon({ status }: { status: RunStep["status"] }) {
  if (status === "success")
    return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />;
  if (status === "failed")
    return <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />;
  if (status === "skipped")
    return <SkipForward className="w-4 h-4 text-zinc-600 shrink-0 mt-0.5" />;
  return <Loader2 className="w-4 h-4 text-zinc-400 animate-spin shrink-0 mt-0.5" />;
}

function StepCard({ step, index }: { step: RunStep; index: number }) {
  const stepDurationMs =
    step.completedAt && step.startedAt
      ? new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime()
      : null;

  return (
    <div className="flex gap-3 group">
      {/* Timeline spine */}
      <div className="flex flex-col items-center">
        <StepIcon status={step.status} />
        <div className="w-px flex-1 mt-1 bg-zinc-800/60 group-last:hidden" />
      </div>

      {/* Content */}
      <div className="pb-4 min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <span className="text-sm font-medium text-zinc-200">
              {phaseLabel(step.phase)}
            </span>
            {step.label && (
              <span className="ml-2 text-xs text-zinc-500">
                {step.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-zinc-600 shrink-0">
            {stepDurationMs !== null && (
              <span className="font-mono">{formatDuration(stepDurationMs)}</span>
            )}
            <span>{formatTime(step.startedAt)}</span>
          </div>
        </div>

        {step.detail && (
          <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
            {step.detail}
          </p>
        )}

        {/* Step phase key for debugging */}
        <span className="mt-1 inline-block text-[10px] font-mono text-zinc-700">
          {step.phase}
        </span>
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
    { key: "whatWasAttempted", label: "What was attempted", color: "text-zinc-400" },
    { key: "whatWorked",       label: "What worked",        color: "text-emerald-400" },
    { key: "whatFailed",       label: "What failed",        color: "text-rose-400"    },
    { key: "openItems",        label: "Open items",         color: "text-amber-400"   },
    { key: "decisionsMade",    label: "Decisions made",     color: "text-sky-400"     },
  ];

  const hasContent = fields.some((f) => (summary[f.key]?.length ?? 0) > 0);
  if (!hasContent) return null;

  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-zinc-950/60 hover:bg-zinc-900/40 transition-colors"
      >
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          Five-Field Summary
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-zinc-600" />
        ) : (
          <ChevronDown className="w-4 h-4 text-zinc-600" />
        )}
      </button>

      {open && (
        <div className="divide-y divide-zinc-800/50">
          {fields.map(({ key, label, color }) => {
            const items = summary[key] ?? [];
            if (items.length === 0) return null;
            return (
              <div key={key} className="px-4 py-3 space-y-1.5">
                <p className={`text-[11px] font-semibold uppercase tracking-wider ${color}`}>
                  {label}
                </p>
                <ul className="space-y-1">
                  {items.map((item, i) => (
                    <li key={i} className="text-xs text-zinc-400 leading-relaxed flex gap-2">
                      <span className="text-zinc-700 shrink-0">·</span>
                      {item}
                    </li>
                  ))}
                </ul>
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

  const fetchRun = useCallback(async () => {
    try {
      const res = await fetch(`/api/skill-runs/${runId}`, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to load run");
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

  useEffect(() => {
    fetchRun();
  }, [fetchRun]);

  // Poll while the run is still active
  useEffect(() => {
    if (run?.status !== "running") return;
    const id = setInterval(fetchRun, 3000);
    return () => clearInterval(id);
  }, [run?.status, fetchRun]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-zinc-600 animate-spin" />
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
          <p className="text-sm text-rose-300">{error ?? "Run not found"}</p>
        </div>
      </div>
    );
  }

  const steps = run.steps ?? [];
  const isRunning = run.status === "running";

  return (
    <div className="space-y-6 w-full mx-auto tracking-tight antialiased px-1 text-zinc-400">

      {/* Back navigation */}
      <div className="flex items-center gap-3 flex-wrap border-b border-zinc-900 pb-4">
        {run.engagementId && (
          <Link
            href={`/dashboard/engagements/${run.engagementId}`}
            className="inline-flex items-center text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <span className="mr-1 text-zinc-500">←</span>
            {run.buyerName ?? run.engagementId}
          </Link>
        )}
        {!run.engagementId && (
          <Link
            href="/dashboard"
            className="inline-flex items-center text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <span className="mr-1 text-zinc-500">←</span> Dashboard
          </Link>
        )}
      </div>

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <h1 className="text-lg font-medium text-zinc-100 tracking-tight">
              {skillName(run.skillName)} — Run Detail
            </h1>
            <p className="text-[11px] font-mono text-zinc-600">{run.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <RunStatusBadge status={run.status} />
            {isRunning && (
              <span className="text-[10px] text-zinc-600 animate-pulse">
                Live — refreshing every 3s
              </span>
            )}
          </div>
        </div>

        {/* Meta stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: "Started",
              value: `${formatDate(run.startedAt)} ${formatTime(run.startedAt)}`,
            },
            {
              label: "Duration",
              value: isRunning ? "In progress…" : formatDuration(run.durationMs),
            },
            {
              label: "Token usage",
              value: formatTokens(run.tokenUsage),
            },
            {
              label: "Cost",
              value: formatCost(run.costInCents),
            },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-lg border border-zinc-900 bg-zinc-950/20 p-3 space-y-1"
            >
              <p className="text-[11px] text-zinc-600">{label}</p>
              <p className="text-xs text-zinc-300 leading-snug font-mono">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Error box — only when failed and errorMessage is present */}
      {run.status === "failed" && run.errorMessage && (
        <div className="border border-rose-900/40 bg-rose-950/10 rounded-lg p-4 space-y-1">
          <p className="text-xs font-semibold text-rose-400 uppercase tracking-wider">
            Error
          </p>
          <p className="text-sm text-rose-300 font-mono leading-relaxed">
            {run.errorMessage}
          </p>
        </div>
      )}

      {/* Step timeline */}
      <div className="space-y-2">
        <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
          Execution Timeline
          <span className="ml-2 font-normal text-zinc-700 normal-case">
            {steps.length} step{steps.length !== 1 ? "s" : ""}
          </span>
        </h2>

        {steps.length === 0 ? (
          <div className="border border-dashed border-zinc-800 rounded-lg p-6 text-center">
            <p className="text-sm text-zinc-600">
              {isRunning
                ? "Waiting for the first step to be recorded…"
                : "No step log was recorded for this run. This may be an older run created before step logging was enabled."}
            </p>
          </div>
        ) : (
          <div className="border border-zinc-800 rounded-lg bg-zinc-950/20 p-4">
            {steps.map((step, i) => (
              <StepCard key={`${step.phase}-${i}`} step={step} index={i} />
            ))}

            {/* Live spinner appended at the bottom while running */}
            {isRunning && (
              <div className="flex gap-3 mt-1">
                <Loader2 className="w-4 h-4 text-zinc-600 animate-spin shrink-0 mt-0.5" />
                <span className="text-xs text-zinc-600 italic">Next step incoming…</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Five-field summary */}
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