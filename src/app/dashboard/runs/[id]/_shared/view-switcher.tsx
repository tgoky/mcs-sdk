"use client";

import { Calendar, List, Kanban, type LucideIcon } from "lucide-react";
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
  labels,
}: {
  value: RunViewMode;
  onChange: (mode: RunViewMode) => void;
  className?: string;
  /** Restrict which modes render as buttons — e.g. Win-Back and Leak-Map
   * drop "board" entirely rather than ship a broken/redundant third view.
   * Defaults to all three for every other call site. */
  modes?: RunViewMode[];
  /** Override a mode's displayed label without renaming the mode key
   * itself — e.g. Leak Map's "calendar" mode is really its overview/report
   * screen, not an actual calendar grid, so it shows "Overview" here while
   * every other view that really is a calendar keeps the default label. */
  labels?: Partial<Record<RunViewMode, string>>;
  /** Same idea as `labels`, for the icon — a relabeled mode usually needs
   * a different glyph too (an actual calendar icon next to "Overview"
   * reads just as wrong as the word "Calendar" did). */
  icons?: Partial<Record<RunViewMode, LucideIcon>>;
}) {
  const visibleModes = modes ? MODES.filter((m) => modes.includes(m.key)) : MODES;
  return (
    <div className={cn("inline-flex items-center gap-0.5 p-0.5", className)}>
      {visibleModes.map(({ key, label: defaultLabel, icon: DefaultIcon }) => {
        const label = labels?.[key] ?? defaultLabel;
        const Icon = icons?.[key] ?? DefaultIcon;
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={active}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer hover-lift press-settle",
              active ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-elevation-1" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
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
