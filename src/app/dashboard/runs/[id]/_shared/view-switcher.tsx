"use client";

import { Calendar, List, Kanban, FileText, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type RunViewMode = "calendar" | "list" | "board" | "report";

const MODES: { key: RunViewMode; label: string; icon: typeof Calendar }[] = [
  { key: "calendar", label: "Calendar", icon: Calendar },
  { key: "list", label: "List", icon: List },
  { key: "board", label: "Board", icon: Kanban },
  { key: "report", label: "Report", icon: FileText },
];

export function ViewSwitcher({
  value,
  onChange,
  className,
  modes,
  labels,
  icons,
  variant,
  containerClassName,
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
  /** "pill" (default) is the original look — each button gets its own
   * background highlight when active, no outer container. "seamless" is
   * for a group of tabs meant to sit directly on the page with no chrome
   * at all (a trading-terminal-style tab row) — active/inactive is just a
   * text color and weight change, nothing else. Two ViewSwitchers sharing
   * one mode/onChange pair (one per variant) is how a single row ends up
   * with a plain tab group on one side and a housed toggle on the other. */
  variant?: "pill" | "seamless";
  /** Extra classes on the outer wrapping div — e.g. a background + border
   * to visually "house" a pill-variant group as its own control, distinct
   * from a seamless group with no chrome of its own on the same row. */
  containerClassName?: string;
}) {
  const visibleModes = modes ? MODES.filter((m) => modes.includes(m.key)) : MODES;
  const seamless = variant === "seamless";
  return (
    <div className={cn("inline-flex items-center", seamless ? "gap-4" : "gap-0.5 p-0.5", containerClassName, className)}>
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
            className={
              seamless
                ? cn(
                    "flex items-center gap-1.5 text-sm transition-colors cursor-pointer",
                    active ? "font-bold text-zinc-900 dark:text-white" : "font-medium text-zinc-500 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                  )
                : cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer hover-lift press-settle",
                    active ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-elevation-1" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                  )
            }
          >
            <Icon size={seamless ? 16 : 13} />
            {/* Seamless tabs always show their label — hiding it below
                `sm` left nothing but a bare 13px icon on mobile, which is
                exactly what read as "too small" there. The pill variant
                keeps the icon-only mobile collapse; those buttons are
                already boxed/sized to work as icon-only targets. */}
            <span className={seamless ? "inline" : "hidden sm:inline"}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
