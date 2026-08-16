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
  /** Restrict which modes render as buttons — e.g. Win-Back and Leak-Map
   * drop "board" entirely rather than ship a broken/redundant third view.
   * Defaults to all three for every other call site. */
  modes?: RunViewMode[];
}) {
  const visibleModes = modes ? MODES.filter((m) => modes.includes(m.key)) : MODES;
  return (
    <div className={cn("inline-flex items-center gap-0.5 rounded-lg border border-zinc-800 bg-zinc-900/80 p-0.5", className)}>
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
              active ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
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
