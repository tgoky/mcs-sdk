"use client";

// src/components/progressive-flow.tsx
//
// The shared body of the skill config forms (Pre-Call Sequence, Booking
// Recovery, Call Brief, Funnel Audit, Voice Capture, Daily Send, Source and
// Send Connect, Save Offer, Bridge Manager). It used to be a "Step 1 of 2,
// Next →" wizard with a checklist column beside it; in the narrow panels
// these forms open in, that squeezed each step into a sliver and hid half
// the settings behind Next. Now every section is on one page, in order,
// with one save button at the end. Same props as before, so no form had to
// change: each step's content, its label, and whether it's complete.
//
// It still never owns form state or validates anything: the caller passes
// already-built content and its own onFinish.

import type { ReactNode } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ProgressiveFlowStep {
  id: string;
  label: string;
  content: ReactNode;
  /** Marks the section's number as done. Never blocks saving; real
   * requiredness is the caller's own validation (finishDisabled). */
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
  return (
    <div className="@container space-y-6">
      {steps.map((step, i) => (
        <section key={step.id} className={cn("space-y-3", i > 0 && "border-t pt-6")}>
          <h3 className="flex items-center gap-2.5 text-sm font-semibold text-[var(--text-primary)]">
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums",
                step.isComplete ? "bg-[var(--ink)] text-[var(--ink-foreground)]" : "bg-[var(--accent-dim)] text-[var(--text-secondary)]"
              )}
              aria-hidden="true"
            >
              {step.isComplete ? <Check className="h-3 w-3" strokeWidth={3.5} /> : i + 1}
            </span>
            {step.label}
          </h3>
          <div className="min-w-0">{step.content}</div>
        </section>
      ))}
      <div className="flex justify-end border-t pt-4">
        <Button onClick={onFinish} disabled={finishDisabled || finishing}>
          {finishing ? <Loader2 className="animate-spin" /> : null}
          {finishing ? "Saving…" : finishLabel}
        </Button>
      </div>
    </div>
  );
}
