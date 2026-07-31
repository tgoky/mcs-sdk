"use client";

// The "×5" badge + chevron that appears on a row only when it's standing in
// for more than one occurrence of the same thing. Self-hides at count <= 1
// so a singleton "group" (the common case) renders with zero visual diff
// from before this feature existed.

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function GroupCountToggle({
  count,
  expanded,
  onToggle,
  className,
}: {
  count: number;
  expanded: boolean;
  onToggle: () => void;
  className?: string;
}) {
  if (count <= 1) return null;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-expanded={expanded}
      aria-label={`${expanded ? "Collapse" : "Expand"} ${count} occurrences of this`}
      title={`Happened ${count} times — click to ${expanded ? "collapse" : "see each occurrence"}`}
      className={cn(
        "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-[10px] font-mono font-bold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors cursor-pointer shrink-0 tabular-nums",
        className
      )}
    >
      <ChevronRight size={10} className={cn("transition-transform", expanded && "rotate-90")} />
      ×{count}
    </button>
  );
}
