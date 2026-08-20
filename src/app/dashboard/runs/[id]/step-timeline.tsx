"use client";

import {
  Check,
  CircleAlert,
  Loader2,
  Minus,
  Pause,
  SkipForward,
  X,
} from "lucide-react";
import { phaseLabel, RUN_DETAIL_COPY as copy } from "@/lib/copy";
import type { RunStep } from "@/models/schema";

type RunStepStatus = RunStep["status"];

const STATUS_STYLE: Record<string, { icon: React.ReactNode; className: string; label: string }> = {
  success: {
    icon: <Check className="h-3.5 w-3.5" />,
    className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300",
    label: "Complete",
  },
  failed: {
    icon: <X className="h-3.5 w-3.5" />,
    className: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-300",
    label: "Failed",
  },
  running: {
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    className: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-300",
    label: "In progress",
  },
  cancelled: {
    icon: <Pause className="h-3.5 w-3.5" />,
    className: "border-zinc-200 bg-zinc-100 text-zinc-700 dark:text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
    label: "Cancelled",
  },
  skipped: {
    icon: <SkipForward className="h-3.5 w-3.5" />,
    className: "border-zinc-200 bg-zinc-50 text-zinc-500 dark:text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400",
    label: "Skipped",
  },
  pending_review: {
    icon: <CircleAlert className="h-3.5 w-3.5" />,
    className: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300",
    label: "Needs review",
  },
};

function getStepStatus(status: RunStepStatus, interrupted: boolean) {
  if (interrupted) return STATUS_STYLE.cancelled;
  return STATUS_STYLE[status] ?? STATUS_STYLE.running;
}

function formatDuration(ms: number | null): string | null {
  if (ms === null || ms < 0) return null;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function StepMarker({ status, interrupted }: { status: RunStepStatus; interrupted: boolean }) {
  const visual = getStepStatus(status, interrupted);

  return (
    <span
      className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full border ${visual.className}`}
      aria-hidden
    >
      {visual.icon}
    </span>
  );
}

/**
 * A deliberately quiet activity log. The old version wrapped each item in a
 * card, which made a simple serial run look like a dashboard inside a
 * dashboard. This uses one connected list—the hierarchy users need to scan
 * an execution trace quickly.
 */
export function StepTimeline({
  steps,
  isRunning,
  runStatus,
}: {
  steps: RunStep[];
  isRunning: boolean;
  runStatus: string;
}) {
  return (
    <ol className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
      {steps.map((step, index) => {
        const interrupted =
          step.status === "running" && (runStatus === "timed_out" || runStatus === "cancelled");
        const isLast = index === steps.length - 1;
        const visual = getStepStatus(step.status, interrupted);
        const duration =
          step.completedAt && step.startedAt
            ? formatDuration(new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime())
            : null;

        return (
          <li key={`${step.phase}-${index}`} className="grid grid-cols-[24px_minmax(0,1fr)_auto] gap-x-3 py-4 first:pt-0 last:pb-0">
            <div className="relative flex min-h-full flex-col items-center">
              <StepMarker status={step.status} interrupted={interrupted} />
              {!isLast && <span className="mt-1 w-px flex-1 bg-zinc-200 dark:bg-zinc-800" aria-hidden />}
            </div>

            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {phaseLabel(step.phase)}
                </p>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${visual.className}`}>
                  {interrupted ? "Interrupted" : visual.label}
                </span>
              </div>

              {(step.label || step.detail) && (
                <div className="mt-1.5 space-y-1">
                  {step.label && <p className="text-xs font-medium text-zinc-500 dark:text-zinc-500 dark:text-zinc-400">{step.label}</p>}
                  {step.detail && <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-500 dark:text-zinc-400">{step.detail}</p>}
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-start gap-1.5 pt-0.5 text-[11px] text-zinc-600 dark:text-zinc-400 dark:text-zinc-500">
              {duration && <span>{duration}</span>}
              <span>{formatTime(step.startedAt)}</span>
            </div>
          </li>
        );
      })}

      {isRunning && (
        <li className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-3 pt-4">
          <div className="flex justify-center">
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-zinc-300 text-zinc-600 dark:text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
              <Minus className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="pt-1 text-xs text-zinc-600 dark:text-zinc-400 dark:text-zinc-500">{copy.nextStepCompiling}</p>
        </li>
      )}
    </ol>
  );
}
