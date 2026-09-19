"use client";

// Phase 3's "Progressive, narrated flow" (see the "Worker Onboarding &
// Gating: Plan" doc's Worker Dossier section): "one real judgment call at
// a time, not a wall of fields... spotlight one focus block at a time
// while building a glanceable summary card on the side as each decision
// is made." Progressive disclosure is the named UX principle behind it
// (see the doc's External Precedents section).
//
// A pure UI/navigation container — it owns which step is showing and
// renders a summary sidebar, nothing else. It never owns form state, never
// validates a field, and never calls a save endpoint itself: the caller
// passes each step's already-built content (its own inputs, wired to
// whatever state the caller already manages) and an isComplete flag per
// step for the sidebar checklist, plus one onFinish callback that fires
// from the last step's action button. This is deliberate: retrofitting an
// existing, working form's actual field state and save/submit logic into
// a new container is real, separate risk from building the container
// itself — kept as its own later slice rather than doing both at once.

import type { ReactNode } from "react";
import { useState } from "react";
import { Check, ArrowLeft, ArrowRight } from "lucide-react";

export interface ProgressiveFlowStep {
  id: string;
  label: string;
  content: ReactNode;
  /** Drives the sidebar checkmark only — never blocks navigation. A step
   * a user hasn't touched yet just shows unchecked; they can still move
   * forward and back freely (this is a narration aid, not a wizard-style
   * hard gate — real requiredness is the caller's own field validation,
   * enforced the same way it already is before this container existed). */
  isComplete: boolean;
}

export function ProgressiveFlow({
  steps,
  onFinish,
  finishLabel = "Save",
  finishDisabled = false,
  finishing = false,
}: {
  steps: ProgressiveFlowStep[];
  onFinish: () => void;
  finishLabel?: string;
  finishDisabled?: boolean;
  finishing?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const current = steps[index];
  const isLast = index === steps.length - 1;

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_200px]">
      <div className="space-y-4 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
            Step {index + 1} of {steps.length}
          </p>
        </div>
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{current.label}</h3>
        <div>{current.content}</div>

        <div className="flex items-center justify-between pt-4 border-t border-zinc-100 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            <ArrowLeft size={13} /> Back
          </button>
          {isLast ? (
            <button
              type="button"
              onClick={onFinish}
              disabled={finishDisabled || finishing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 text-xs font-bold text-white dark:text-zinc-900 cursor-pointer"
            >
              {finishing ? "Saving…" : finishLabel}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIndex((i) => Math.min(steps.length - 1, i + 1))}
              className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 px-4 py-2 text-xs font-bold text-white dark:text-zinc-900 cursor-pointer"
            >
              Next <ArrowRight size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        {steps.map((step, i) => (
          <button
            key={step.id}
            type="button"
            onClick={() => setIndex(i)}
            className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors cursor-pointer ${
              i === index
                ? "bg-zinc-100 dark:bg-zinc-800 font-semibold text-zinc-900 dark:text-zinc-100"
                : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900"
            }`}
          >
            {step.isComplete ? (
              <Check size={13} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <span className="shrink-0 w-[13px] h-[13px] rounded-full border border-zinc-300 dark:border-zinc-700" />
            )}
            <span className="truncate">{step.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
