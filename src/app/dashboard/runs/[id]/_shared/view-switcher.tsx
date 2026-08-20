"use client";

import { Calendar, List, Kanban } from "lucide-react";
import { cn } from "@/lib/utils";

export type RunViewMode = "calendar" | "list" | "board";

const MODES: { key: RunViewMode; label: string; icon: typeof Calendar }[] = [
  { key: "calendar", label: "Calendar", icon: Calendar },
  { key: "list", label: "List", icon: List },
  { key: "board", label: "Board", icon: Kanban },
];
export function ViewSwitcher({
  value,
  onChange,
  className,
  modes,
}: {
  value: RunViewMode;
  onChange: (mode: RunViewMode) => void;
  className?: string;
  modes?: RunViewMode[];
}) {
  const visibleModes = modes ? MODES.filter((m) => modes.includes(m.key)) : MODES;
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent dark:bg-zinc-900/80 p-0.5",
        className
      )}
    >
      {visibleModes.map(({ key, label, icon: Icon }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={active}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer",
              active
                ? "bg-white text-zinc-900 shadow-sm border border-zinc-200 dark:border-zinc-700/60 dark:bg-zinc-800 dark:text-white"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            )}
          >
            <Icon size={13} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}