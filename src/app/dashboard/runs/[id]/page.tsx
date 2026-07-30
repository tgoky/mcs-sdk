"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  Ban,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Coins,
  Cpu,
  FileText,
  Loader2,
  Terminal,
  XCircle,
} from "lucide-react";
import { PinDownResultCard } from "../../pin-down-result-card";
import { CancelRunButton } from "../../cancel-run-button";
import { StepTimeline } from "./step-timeline";
import { skillName, phaseLabel, runStatusLabel, RUN_DETAIL_COPY as copy } from "@/lib/copy";
import { BackLink } from "@/components/back-link";
import { SetBreadcrumbLabel } from "@/components/breadcrumbs/breadcrumb-context";
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
  if (ms === null || ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function formatTokens(usage: RunDetail["tokenUsage"]): string {
  if (!usage) return "—";
  return `${(usage.input_tokens + usage.output_tokens).toLocaleString()}`;
}

function formatCost(cents: number | null): string {
  if (cents === null) return "—";
  return `$${(cents / 100).toFixed(4)}`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function RunStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const config = {
    success: {
      icon: <CheckCircle2 className="h-4 w-4" />,
      className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300",
    },
    completed: {
      icon: <CheckCircle2 className="h-4 w-4" />,
      className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300",
    },
    failed: {
      icon: <XCircle className="h-4 w-4" />,
      className: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-300",
    },
    cancelled: {
      icon: <Ban className="h-4 w-4" />,
      className: "border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
    },
    timed_out: {
      icon: <Clock3 className="h-4 w-4" />,
      className: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300",
    },
    running: {
      icon: <Loader2 className="h-4 w-4 animate-spin" />,
      className: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-300",
    },
  }[normalized] ?? {
    icon: <AlertCircle className="h-4 w-4" />,
    className: "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300",
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${config.className}`}>
      {config.icon}
      {runStatusLabel(status)}
    </span>
  );
}

function Metric({
  icon,
  label,
  value,
  detail,
  className = "",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail?: string;
  className?: string;
}) {
  return (
    <div className="min-w-0 px-4 py-4 sm:px-5">
      <div className="flex items-center gap-1.5 text-zinc-400 dark:text-zinc-500">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">{label}</span>
      </div>
      <p className={`mt-2 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100 ${className}`}>{value}</p>
      {detail && <p className="mt-0.5 truncate text-[11px] text-zinc-400 dark:text-zinc-500">{detail}</p>}
    </div>
  );
}

function SummarySection({ summary }: { summary: RunSummary }) {
  const fields: { key: keyof RunSummary; label: string; emptyText?: string; tone: string }[] = [
    { key: "whatWasAttempted", label: "What ran", tone: "text-zinc-500 dark:text-zinc-400" },
    { key: "whatWorked", label: "What worked", tone: "text-emerald-700 dark:text-emerald-400" },
    { key: "whatFailed", label: "What needs attention", emptyText: copy.noFailuresNote, tone: "text-rose-700 dark:text-rose-400" },
    { key: "openItems", label: "Open items", tone: "text-amber-700 dark:text-amber-400" },
    { key: "decisionsMade", label: "Decisions", tone: "text-sky-700 dark:text-sky-400" },
  ];

  const visibleFields = fields.filter(({ key }) => (summary[key]?.length ?? 0) > 0 || key === "whatFailed");
  if (visibleFields.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950/30">
      <div className="flex items-center gap-2 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800/80">
        <FileText className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{copy.summarySectionTitle}</h2>
      </div>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
        {visibleFields.map(({ key, label, emptyText, tone }) => {
          const items = summary[key] ?? [];
          return (
            <div key={key} className="px-5 py-4">
              <p className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${tone}`}>{label}</p>
              {items.length > 0 ? (
                <ul className="mt-2.5 space-y-2">
                  {items.map((item, index) => (
                    <li key={index} className="flex gap-2 text-sm leading-5 text-zinc-600 dark:text-zinc-400">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-zinc-400 dark:text-zinc-500">{emptyText}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RunMetadata({ run }: { run: RunDetail }) {
  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950/30">
      <div className="border-b border-zinc-100 px-5 py-4 dark:border-zinc-800/80">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Run details</h2>
      </div>
      <dl className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800/80">
        <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 px-5 py-3.5">
          <dt className="text-zinc-400 dark:text-zinc-500">Started</dt>
          <dd className="text-right font-medium text-zinc-700 dark:text-zinc-300">{formatDateTime(run.startedAt)}</dd>
        </div>
        <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 px-5 py-3.5">
          <dt className="text-zinc-400 dark:text-zinc-500">Finished</dt>
          <dd className="text-right font-medium text-zinc-700 dark:text-zinc-300">{formatDateTime(run.completedAt)}</dd>
        </div>
        <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 px-5 py-3.5">
          <dt className="text-zinc-400 dark:text-zinc-500">Run ID</dt>
          <dd className="break-all text-right font-mono text-[11px] text-zinc-500 dark:text-zinc-400">{run.id}</dd>
        </div>
      </dl>
    </section>
  );
}

function Notice({ type, children }: { type: "failed" | "cancelled" | "timed_out"; children: React.ReactNode }) {
  const styles = {
    failed: "border-rose-200 bg-rose-50/70 text-rose-800 dark:border-rose-900/70 dark:bg-rose-950/20 dark:text-rose-200",
    cancelled: "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300",
    timed_out: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/20 dark:text-amber-200",
  }[type];
  const Icon = type === "failed" ? CircleAlert : type === "cancelled" ? Ban : Clock3;

  return (
    <div className={`flex gap-3 rounded-xl border px-4 py-3.5 ${styles}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 text-sm leading-5">{children}</div>
    </div>
  );
}

export default function RunDetailPage() {
  const params = useParams();
  const runId = params?.id as string;
  const [run, setRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRun = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/skill-runs/${runId}`, { cache: "no-store", signal });
      if (!response.ok) return;
      const data = await response.json();
      setRun(data.run);
    } catch {
      // A polling failure should not replace a previously loaded run with an error screen.
    }
  }, [runId]);

  useEffect(() => {
    if (!runId) return;
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch(`/api/skill-runs/${runId}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          setError(body.error ?? "Failed to load run data");
          return;
        }
        const data = await response.json();
        setRun(data.run);
      } catch (cause: unknown) {
        if (cause instanceof Error && cause.name !== "AbortError") setError(cause.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [runId]);

  const isRunning = run?.status === "running";
  useEffect(() => {
    if (!isRunning) return;
    const controller = new AbortController();
    const intervalId = window.setInterval(() => fetchRun(controller.signal), 3000);
    return () => {
      window.clearInterval(intervalId);
      controller.abort();
    };
  }, [fetchRun, isRunning]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="mx-auto max-w-3xl space-y-5 py-3">
        <BackLink href="/dashboard" label="Back to dashboard" />
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-6 py-10 text-center dark:border-rose-900/50 dark:bg-rose-950/20">
          <XCircle className="mx-auto mb-3 h-7 w-7 text-rose-500" />
          <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">{error ?? "Run trace not found"}</p>
        </div>
      </div>
    );
  }

  const steps = run.steps ?? [];
  const isCancelled = run.status === "cancelled";
  const isTimedOut = run.status === "timed_out";
  const runPhase = isRunning ? phaseLabel(run.phase) : run.status === "success" ? "Completed" : phaseLabel(run.phase);

  return (
    <div className="mx-auto w-full max-w-6xl pb-8 text-zinc-600 dark:text-zinc-400">
      <SetBreadcrumbLabel label={`${skillName(run.skillName)} run`} />

      <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <BackLink
          href={run.engagementId ? `/dashboard/engagements/${run.engagementId}` : "/dashboard"}
          label={run.engagementId ? `Back to ${run.buyerName ?? "client"}` : "Back to dashboard"}
        />

        <div className="mt-5 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400 dark:text-zinc-500">Automation run</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white sm:text-3xl">
              {skillName(run.skillName)}
            </h1>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              {run.buyerName ?? "Client workspace"}
              <span className="mx-2 text-zinc-300 dark:text-zinc-700">/</span>
              {runPhase}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <RunStatusBadge status={run.status} />
            {isRunning && <span className="text-xs text-zinc-400 dark:text-zinc-500">Live · refreshes every 3s</span>}
            {isRunning && <CancelRunButton runId={runId} onCancelled={() => fetchRun()} />}
          </div>
        </div>
      </header>

      <section className="mt-5 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-950/30">
        <div className="grid grid-cols-2 divide-x divide-y divide-zinc-200 dark:divide-zinc-800 sm:grid-cols-4 sm:divide-y-0">
          <Metric icon={<Cpu className="h-3.5 w-3.5" />} label="Current phase" value={runPhase} />
          <Metric
            icon={<Clock3 className="h-3.5 w-3.5" />}
            label="Duration"
            value={isRunning ? "In progress" : isCancelled ? "Cancelled" : isTimedOut ? "Timed out" : formatDuration(run.durationMs)}
          />
          <Metric icon={<Terminal className="h-3.5 w-3.5" />} label="Tokens" value={formatTokens(run.tokenUsage)} detail={run.tokenUsage ? "input + output" : undefined} />
          <Metric icon={<Coins className="h-3.5 w-3.5" />} label="Cost" value={formatCost(run.costInCents)} className="tabular-nums" />
        </div>
      </section>

      <div className="mt-5 space-y-3">
        {run.status === "failed" && run.errorMessage && (
          <Notice type="failed">
            <p className="font-semibold">{copy.errorSectionTitle}</p>
            <p className="mt-1 break-words font-mono text-xs leading-5 opacity-90">{run.errorMessage}</p>
          </Notice>
        )}
        {isCancelled && (
          <Notice type="cancelled">
            <p className="font-semibold">Run cancelled</p>
            <p className="mt-1 text-xs">In-progress work was stopped at your request.</p>
          </Notice>
        )}
        {isTimedOut && (
          <Notice type="timed_out">
            <p className="font-semibold">Run timed out</p>
            <p className="mt-1 text-xs">The run exceeded its allowed runtime. Check the last activity below for the point where it stopped progressing.</p>
          </Notice>
        )}
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(290px,0.85fr)]">
        <div className="space-y-6">
          <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950/30">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800/80">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Activity</h2>
                <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">{steps.length} recorded step{steps.length === 1 ? "" : "s"}</p>
              </div>
              {isRunning && <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 dark:text-sky-300"><span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse" />Live</span>}
            </div>

            <div className="max-h-[620px] overflow-y-auto px-5 py-4">
              {steps.length === 0 ? (
                <div className="flex min-h-36 flex-col items-center justify-center text-center">
                  <CalendarClock className="mb-2 h-5 w-5 text-zinc-300 dark:text-zinc-700" />
                  <p className="text-sm text-zinc-400 dark:text-zinc-500">{isRunning ? copy.awaitingFirstStep : copy.noStepsRecorded}</p>
                </div>
              ) : (
                <StepTimeline steps={steps} isRunning={isRunning} runStatus={run.status} />
              )}
            </div>
          </section>

          {run.skillName === "pin-down" && run.status === "success" && <PinDownResultCard engagementId={run.engagementId} />}
        </div>

        <aside className="space-y-6">
          {run.summary ? (
            <SummarySection summary={run.summary} />
          ) : !isRunning ? (
            <section className="rounded-xl border border-dashed border-zinc-200 px-5 py-5 dark:border-zinc-800">
              <FileText className="mb-2 h-4 w-4 text-zinc-300 dark:text-zinc-700" />
              <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">No written outcome</h2>
              <p className="mt-1 text-xs leading-5 text-zinc-400 dark:text-zinc-500">{copy.noSummaryRecorded}</p>
            </section>
          ) : null}
          <RunMetadata run={run} />
        </aside>
      </div>
    </div>
  );
}
