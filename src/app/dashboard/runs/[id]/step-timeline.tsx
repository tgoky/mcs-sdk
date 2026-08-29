"use client";

import { useState } from "react";
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
import { formatDiaryTime, formatReadableDuration } from "@/lib/format-datetime";
import type { RunStep } from "@/models/schema";

type RunStepStatus = RunStep["status"];

const STATUS_STYLE: Record<string, { icon: React.ReactNode; className: string; label: string }> = {
  // Fix: was emerald (green) — lavender-slate, same family as every other
  // "done" state in the app now.
  success: {
    icon: <Check className="h-3.5 w-3.5" />,
    className: "border-[#424d77]/30 bg-[#424d77]/5 text-[#424d77] dark:border-[#c5b7ea]/35 dark:bg-[#c5b7ea]/10 dark:text-[#c5b7ea]",
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

// Fix: raw millisecond counts ("0ms", "43ms") read like a debug log, not
// something a client should have to parse — and formatTime previously left
// hour12 up to the browser's default locale, which is why the same run
// could show "12:00 PM" for one person and unmarked 24-hour "16:30" for
// another. Both now go through the shared diary formatter so every
// timestamp in the app looks the same and is never ambiguous.
const formatDuration = formatReadableDuration;
const formatTime = formatDiaryTime;

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
 * The vertical rule between two markers. `flowing` swaps the static line
 * for the same geometry animated with the .step-spine-flow keyframe
 * (globals.css) — a marching-dash stroke-dashoffset tween, previously
 * defined but never wired to a component. Reused instead of duplicated:
 * darker stroke than the resting line so it reads as "live" through
 * contrast and motion alone, no accent color and no glow.
 */
function Connector({ flowing }: { flowing: boolean }) {
  if (!flowing) {
    return <span className="mt-1 w-px flex-1 bg-zinc-200 dark:bg-zinc-800" aria-hidden />;
  }
  return (
    <svg className="mt-1 w-px min-h-6 flex-1 text-zinc-400 dark:text-zinc-600" viewBox="0 0 2 40" preserveAspectRatio="none" aria-hidden>
      <line x1="1" y1="0" x2="1" y2="40" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" className="step-spine-flow" />
    </svg>
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
  // Exactly one connector "flows" at a time — whichever segment is
  // currently carrying the run forward — so motion reads as a pointer to
  // what's happening next, not ambient decoration on every line. Picks the
  // segment feeding the actively-running step; if no step is running but
  // the run is still going (the gap between one step completing and the
  // next being logged), it flows into the trailing "compiling" indicator
  // instead.
  const activeRunningIndex = steps.findIndex(
    (s) => s.status === "running" && runStatus !== "timed_out" && runStatus !== "cancelled"
  );
  const flowingAfterIndex =
    activeRunningIndex > 0
      ? activeRunningIndex - 1
      : isRunning && activeRunningIndex === -1 && steps.length > 0
        ? steps.length - 1
        : null;

  // This page polls every 3s while a run is live (see the interval in
  // runs/[id]/page.tsx) and `steps` only ever grows/updates in place — it's
  // never reordered or trimmed. So "how many steps existed last render" is
  // enough to tell a brand-new step apart from one that's just re-rendering
  // with a fresh status, without a library or per-step id bookkeeping.
  // Tracked via the "adjust state during render" pattern (React docs: You
  // Might Not Need an Effect), not an effect — an effect-based setState
  // here would fire after commit and cost an extra cascading render on
  // every single poll tick (react-hooks/set-state-in-effect). Starts at
  // the steps length already on the page at first paint, so nothing
  // already visible plays the entrance — only steps appended after.
  const [previousStepCount, setPreviousStepCount] = useState<number | null>(null);
  const [trackedStepCount, setTrackedStepCount] = useState(steps.length);
  if (steps.length !== trackedStepCount) {
    setPreviousStepCount(trackedStepCount);
    setTrackedStepCount(steps.length);
  }

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

        // Only steps that weren't there last render get the entrance —
        // an existing step flipping from "running" to "success" mid-poll
        // must not replay the whole row's fade-in, just its own marker/pill.
        const isNewlyAppeared = previousStepCount !== null && index >= previousStepCount;

        return (
          <li
            key={`${step.phase}-${index}`}
            className={`grid grid-cols-[24px_minmax(0,1fr)_auto] gap-x-3 py-4 first:pt-0 last:pb-0 ${isNewlyAppeared ? "step-enter" : ""}`}
          >
            <div className="relative flex min-h-full flex-col items-center">
              <StepMarker status={step.status} interrupted={interrupted} />
              {(!isLast || isRunning) && <Connector flowing={index === flowingAfterIndex} />}
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
