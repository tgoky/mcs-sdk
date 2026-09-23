"use client";

// src/components/product-setup/activation-steps.tsx
//
// The list that fills in while Activate runs. Each line is a step the
// server reported as finished (activate/route.ts streams them), so the
// list only ever shows work that actually happened; the last line is what
// it's doing now.

import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Check, Loader2, Minus, RotateCcw } from "lucide-react";
import type { ActivationStep } from "@/lib/showtime-setup/types";
import { cn } from "@/lib/utils";

export function ActivationSteps({ steps, working, workingLabel }: { steps: ActivationStep[]; working: boolean; workingLabel: string }) {
  return (
    <ol className="space-y-2.5" aria-live="polite">
      <AnimatePresence initial={false}>
        {steps.map((s) => (
          <motion.li
            key={s.id}
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="flex items-start gap-3"
          >
            <StepIcon status={s.status} />
            <span className="min-w-0">
              <span className={cn("block text-sm", s.status === "failed" ? "text-[var(--error)]" : "text-[var(--text-primary)]")}>{s.label}</span>
              {s.detail && s.status !== "reused" && <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{s.detail}</span>}
            </span>
          </motion.li>
        ))}
        {working && (
          <motion.li key="working" layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--text-muted)]" />
            </span>
            <span className="text-sm text-[var(--text-muted)]">{workingLabel}</span>
          </motion.li>
        )}
      </AnimatePresence>
    </ol>
  );
}

function StepIcon({ status }: { status: ActivationStep["status"] }) {
  const base = "flex h-5 w-5 shrink-0 items-center justify-center rounded-full";
  if (status === "failed")
    return (
      <span className={cn(base, "bg-[color-mix(in_oklch,var(--error)_14%,transparent)] text-[var(--error)]")}>
        <AlertTriangle className="h-3 w-3" strokeWidth={2.5} />
      </span>
    );
  if (status === "skipped")
    return (
      <span className={cn(base, "bg-[var(--accent-dim)] text-[var(--text-muted)]")}>
        <Minus className="h-3 w-3" strokeWidth={3} />
      </span>
    );
  if (status === "reused")
    return (
      <span className={cn(base, "bg-[var(--surface-prefill)] text-[var(--text-prefill-accent)]")}>
        <RotateCcw className="h-3 w-3" strokeWidth={2.5} />
      </span>
    );
  return (
    <motion.span
      initial={{ scale: 0.4 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 600, damping: 18 }}
      className={cn(base, "bg-[var(--ink)] text-[var(--ink-foreground)]")}
    >
      <Check className="h-3 w-3" strokeWidth={3.5} />
    </motion.span>
  );
}
