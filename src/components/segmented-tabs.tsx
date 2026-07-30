"use client";

// A small, reusable segmented control — same interaction as a "People /
// Companies" style toggle, generalized so any table view (Queue, Live
// Executions, and anything future) can define its own tab keys and labels
// without duplicating the pill/active-state styling each time.
//
// Deliberately dumb: this component owns no filtering logic. The caller
// decides what each tab means and computes its count; this just renders
// the row and reports which key was clicked.

import { cn } from "@/lib/utils";

export interface SegmentedTabOption<T extends string> {
  key: T;
  label: string;
  /** Omit to hide the count badge for this tab. */
  count?: number;
}

export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: SegmentedTabOption<T>[];
  value: T;
  onChange: (key: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/40 shrink-0",
        className
      )}
    >
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <button
            key={opt.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.key)}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer",
              active
                ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-700"
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
            )}
          >
            {opt.label}
            {typeof opt.count === "number" && (
              <span
                className={cn(
                  "text-[10px] font-mono px-1 rounded-sm tabular-nums",
                  active
                    ? "bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
                    : "bg-zinc-200/50 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-500"
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
