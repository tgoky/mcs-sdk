"use client";

// src/components/product-setup/activation-steps.tsx
//
// What Activate shows while it works, kept to one compact panel instead of
// a line per step: a headline that changes with the stage, a four-part bar
// (site, what it says, tools, lists), and what was found collecting as
// small chips. Every chip is a step the server reported as finished
// (activate/route.ts streams them), so nothing here is staged for show.

import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Check, Loader2, RotateCcw } from "lucide-react";
import type { ActivationStep } from "@/lib/showtime-setup/types";
import { cn } from "@/lib/utils";

const STAGES = [
  { key: "site", label: "Reading the site" },
  { key: "found", label: "Understanding the offer" },
  { key: "account", label: "Checking your tools" },
  { key: "pick", label: "Choosing lists and pages" },
] as const;

function stageOf(step: ActivationStep): number {
  if (step.id.startsWith("found-")) return 1;
  if (step.id.startsWith("account-")) return 2;
  if (step.id.startsWith("pick-")) return 3;
  return 0;
}

export function ActivationProgress({
  steps,
  working,
  host,
  error,
  onRetry,
}: {
  steps: ActivationStep[];
  working: boolean;
  host: string;
  error: string | null;
  onRetry: () => void;
}) {
  const stage = steps.length === 0 ? 0 : Math.min(3, Math.max(...steps.map(stageOf)) + (working ? 0 : 1));
  const done = !working && !error;
  const headline = error
    ? "Setup stopped partway"
    : done
      ? "Done. Here's what we set up."
      : steps.length === 0
        ? `Reading ${host || "your tools"}…`
        : `${STAGES[Math.min(stage, 3)].label}…`;
  const chips = steps.filter((s) => s.id !== "site");
  const siteStep = steps.find((s) => s.id === "site");

  return (
    <div className="space-y-4 rounded-2xl border bg-[var(--surface)] p-5 dark:bg-[var(--surface)]/60" aria-live="polite">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-dim)]">
          {error ? (
            <AlertTriangle className="h-4 w-4 text-[var(--error)]" />
          ) : done ? (
            <motion.span initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 600, damping: 18 }}>
              <Check className="h-4 w-4 text-[var(--text-primary)]" strokeWidth={3} />
            </motion.span>
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-[var(--text-secondary)]" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={headline}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="text-[15px] font-medium text-[var(--text-primary)]"
            >
              {headline}
            </motion.p>
          </AnimatePresence>
          {siteStep && (
            <p className={cn("mt-0.5 text-xs", siteStep.status === "failed" ? "text-[var(--error)]" : "text-[var(--text-muted)]")}>
              {siteStep.status === "reused" ? `${siteStep.label}, reusing what we found` : siteStep.status === "failed" ? `${siteStep.label}. ${siteStep.detail ?? ""}` : siteStep.label}
            </p>
          )}
        </div>
        {error && (
          <button type="button" onClick={onRetry} className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-[var(--text-primary)] cursor-pointer">
            <RotateCcw className="h-3.5 w-3.5" /> Try again
          </button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-1.5" aria-hidden="true">
        {STAGES.map((s, i) => (
          <div key={s.key} className="h-1 overflow-hidden rounded-full bg-[var(--accent-dim)]">
            <motion.div
              className="h-full rounded-full bg-[var(--ink)]"
              initial={{ width: 0 }}
              animate={{ width: i < stage || done ? "100%" : i === stage && working ? "55%" : "0%" }}
              transition={{ duration: i === stage && working ? 1.6 : 0.35, ease: "easeOut" }}
            />
          </div>
        ))}
      </div>

      {chips.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          <AnimatePresence initial={false}>
            {chips.map((s) => (
              <motion.li
                key={s.id}
                layout
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                title={s.detail}
                className={cn(
                  "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                  s.status === "failed"
                    ? "border-[color-mix(in_oklch,var(--error)_35%,transparent)] text-[var(--error)]"
                    : s.status === "skipped"
                      ? "border-dashed text-[var(--text-muted)]"
                      : "bg-background text-[var(--text-secondary)]"
                )}
              >
                {s.status === "failed" ? <AlertTriangle className="h-3 w-3 shrink-0" /> : s.status === "skipped" ? null : <Check className="h-3 w-3 shrink-0" strokeWidth={3} />}
                <span className="truncate">{s.label}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
