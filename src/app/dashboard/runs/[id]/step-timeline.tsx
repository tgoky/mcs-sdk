"use client";

import {
  CheckCircle2,
  XCircle,
  Loader2,
  Ban,
  SkipForward,
  ClipboardCheck,
  ArrowDown,
} from "lucide-react";
import { phaseLabel } from "@/lib/copy";
import type { RunStep } from "@/models/schema";

// ─────────────────────────────────────────────────────────────────────────
// Redesign notes (why this looks the way it does):
//
// The underlying data is a flat, sequential array of steps — Pin-Down,
// Pre-Call Read etc. don't fork into parallel branches, they run one step
// after another and stop the instant one fails. A literal branching tree
// would be fabricating structure that isn't there. What's real here is a
// single connected chain, so that's what this renders: a spine of status
// nodes, each fused to a real card, in the sequence they actually ran.
//
// The one deliberate signature move is the connector between the last
// logged step and "what's next": while a run is live, that one segment
// gets a slow animated dash — current visibly moving through the pipe —
// while every other connector (between two steps that already finished,
// pass or fail) stays a plain, calm line. Everything else — palette,
// type, spacing — reuses the app's existing gold/zinc system rather than
// inventing a new one; this is a redesign of one component in a live
// product, not a fresh brand.
//
// Entrance animation is applied unconditionally to every card, but it only
// ever visually plays once per step: the parent polls every 3s while a run
// is live, and React's own keyed reconciliation reuses the existing DOM
// node for a step it has already rendered rather than recreating it — a
// CSS mount animation only fires when an element is actually inserted into
// the DOM. Only a step appearing in the array for the first time gets a
// new node, so only it actually animates in; nothing needs to track "have
// I shown this before" by hand.
// ─────────────────────────────────────────────────────────────────────────

type RunStepStatus = RunStep["status"];

type NodeVisual = {
  solid: boolean;
  ring: string;
  fill: string;
  iconColor: string;
  dashed?: boolean;
  glow?: boolean;
};

const NODE_VISUALS: Record<string, NodeVisual> = {
  success: { solid: true, ring: "border-gold", fill: "bg-gold", iconColor: "text-gold-foreground" },
  failed: { solid: true, ring: "border-rose-500", fill: "bg-rose-500", iconColor: "text-white" },
  running: { solid: false, ring: "border-gold", fill: "", iconColor: "text-gold-hover dark:text-gold", glow: true },
  cancelled: { solid: false, ring: "border-amber-500", fill: "", iconColor: "text-amber-600 dark:text-amber-400", dashed: true },
  skipped: { solid: false, ring: "border-zinc-300 dark:border-zinc-700", fill: "", iconColor: "text-zinc-400 dark:text-zinc-600" },
  pending_review: { solid: false, ring: "border-gold", fill: "", iconColor: "text-gold-hover dark:text-gold" },
};

function nodeVisual(status: RunStepStatus, displayInterrupted?: boolean): NodeVisual {
  if (displayInterrupted) return NODE_VISUALS.cancelled;
  return NODE_VISUALS[status] ?? NODE_VISUALS.running;
}

function StepIcon({ status, displayInterrupted }: { status: RunStepStatus; displayInterrupted?: boolean }) {
  const cls = "w-3.5 h-3.5";
  if (displayInterrupted) return <Ban className={cls} />;
  if (status === "success") return <CheckCircle2 className={cls} />;
  if (status === "failed") return <XCircle className={cls} />;
  if (status === "cancelled") return <Ban className={cls} />;
  if (status === "skipped") return <SkipForward className={cls} />;
  if (status === "pending_review") return <ClipboardCheck className={cls} />;
  return <Loader2 className={`${cls} animate-spin`} />;
}

/** The circular node fused to the spine — filled means "arrived and done," hollow/dashed means anything short of that. */
function StepNode({ status, displayInterrupted }: { status: RunStepStatus; displayInterrupted?: boolean }) {
  const v = nodeVisual(status, displayInterrupted);
  return (
    <span className="relative inline-flex shrink-0">
      {v.glow && (
        <span className="absolute inset-[-4px] rounded-full bg-gold/20 motion-safe:animate-pulse" aria-hidden />
      )}
      <span
        className={[
          "relative z-10 flex items-center justify-center w-7 h-7 rounded-full border-2 bg-white dark:bg-zinc-950 transition-colors",
          v.ring,
          v.solid ? v.fill : "",
          v.dashed ? "border-dashed" : "",
        ].join(" ")}
      >
        <span className={v.solid ? v.iconColor : v.iconColor}>
          <StepIcon status={status} displayInterrupted={displayInterrupted} />
        </span>
      </span>
    </span>
  );
}

/** The line below a node connecting it to the next one. `flowing` is the one animated, colored segment — reserved for the live edge of a running run. */
function ConnectorSegment({ flowing }: { flowing: boolean }) {
  return (
    <div className="w-7 flex justify-center flex-1 min-h-[1.5rem]">
      <svg width="2" height="100%" className="overflow-visible">
        <line
          x1="1" y1="0" x2="1" y2="100%"
          strokeDasharray={flowing ? "4 4" : undefined}
          className={[
            flowing ? "stroke-gold" : "stroke-zinc-200 dark:stroke-zinc-800",
            flowing ? "step-spine-flow" : "",
          ].join(" ")}
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function StepCard({
  step,
  displayInterrupted,
  delayMs,
}: {
  step: RunStep;
  displayInterrupted?: boolean;
  delayMs: number;
}) {
  const stepDurationMs =
    step.completedAt && step.startedAt
      ? new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime()
      : null;

  return (
    <div
      className={[
        "min-w-0 flex-1 mb-2 rounded-lg border p-3 transition-colors",
        displayInterrupted
          ? "border-amber-200 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/10"
          : step.status === "failed"
          ? "border-rose-200 dark:border-rose-900/40 bg-rose-50/30 dark:bg-rose-950/10"
          : "border-zinc-200 dark:border-zinc-800 bg-white/40 dark:bg-zinc-950/20 hover:border-zinc-300 dark:hover:border-zinc-700",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300 motion-safe:fill-mode-both",
      ].join(" ")}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            {phaseLabel(step.phase)}
          </span>
          {step.label && <span className="ml-2 text-xs text-zinc-500 font-mono">[{step.label}]</span>}
          {displayInterrupted && (
            <span className="ml-2 text-[10px] text-amber-600 dark:text-amber-400 font-mono font-bold uppercase tracking-wide">
              Interrupted
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-zinc-400 dark:text-zinc-600 shrink-0 font-mono">
          {stepDurationMs !== null && <span>{formatDuration(stepDurationMs)}</span>}
          <span>{formatTime(step.startedAt)}</span>
        </div>
      </div>
      {step.detail && (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{step.detail}</p>
      )}
    </div>
  );
}

export function StepTimeline({
  steps,
  isRunning,
  runStatus,
}: {
  steps: RunStep[];
  isRunning: boolean;
  runStatus: string;
}) {
  const STAGGER_MS = 40;
  const MAX_STAGGER_MS = 240; // cap so a 30-step run doesn't queue a silly-long wait

  return (
    <div>
      {steps.map((step, i) => {
        const key = `${step.phase}-${i}`;

        // Render-time-only, never written back to the database. See the
        // comment on timeoutRun() in src/lib/run-log.ts: a stale run's
        // steps array is never rewritten by the reaper (to avoid a
        // lost-update race against logStep()), so a dangling "running"
        // step on a now-timed_out or cancelled run needs to be shown as
        // interrupted here instead of being persisted as such.
        const displayInterrupted = step.status === "running" && (runStatus === "timed_out" || runStatus === "cancelled");
        const isLast = i === steps.length - 1;
        // The only place the animated "flow" segment appears: right after
        // the last logged step, while the run is still actively going.
        const trailingIsLiveEdge = isLast && isRunning;

        return (
          <div key={key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <StepNode status={step.status} displayInterrupted={displayInterrupted} />
              {!isLast && <ConnectorSegment flowing={false} />}
              {trailingIsLiveEdge && <ConnectorSegment flowing />}
            </div>
            <StepCard
              step={step}
              displayInterrupted={displayInterrupted}
              delayMs={Math.min(i, MAX_STAGGER_MS / STAGGER_MS) * STAGGER_MS}
            />
          </div>
        );
      })}

      {isRunning && (
        <div className="flex gap-3 items-center text-zinc-400 dark:text-zinc-600">
          <span className="w-7 h-7 flex items-center justify-center shrink-0">
            <ArrowDown className="w-3.5 h-3.5 motion-safe:animate-bounce" />
          </span>
          <span className="text-xs italic">Next step compiling…</span>
        </div>
      )}
    </div>
  );
}
