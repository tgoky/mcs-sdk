"use client";

import { MapPin, Layers, FileText, RotateCcw, Filter, Pause } from "lucide-react";

export const SKILL_SQUISHY_CONFIG: Record<
  string,
  { label: string; bgClass: string; icon: React.ElementType }
> = {
  "pin-down": { label: "PD", bgClass: "bg-[#fcd34d]", icon: MapPin },
  "pile-on": { label: "PO", bgClass: "bg-[#c084fc]", icon: Layers },
  "pre-call-read": { label: "PR", bgClass: "bg-[#f2a8e4]", icon: FileText },
  "win-back": { label: "WB", bgClass: "bg-[#fb7185]", icon: RotateCcw },
  "leak-map": { label: "LM", bgClass: "bg-[#38bdf8]", icon: Filter },
};

export function SquishySkillBadge({
  skill,
  size = 36,
  enabled = true,
  paused = false,
  count,
}: {
  skill: string;
  size?: number;
  enabled?: boolean;
  /**
   * True when this skill is switched ON but the parent engagement is
   * currently paused, so it won't actually run. Deliberately separate from
   * `enabled` — pausing a client must never flip a skill's own stored
   * on/off state, only how it's *displayed*. Ignored when enabled=false,
   * since an off skill has nothing extra to communicate.
   */
  paused?: boolean;
  /** Optional small overlay in the corner — e.g. "3 Pin-Down runs" at a glance on the Executions page. Omitted (no badge rendered) when undefined or 0. */
  count?: number;
}) {
  const config = SKILL_SQUISHY_CONFIG[skill];
  if (!config) return null;

  const Icon = config.icon;
  const iconSize = Math.round(size * 0.54);
  const showPaused = enabled && paused;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className={`flex items-center justify-center rounded-full transition-all duration-200 select-none w-full h-full ${
          showPaused
            ? "bg-amber-100 dark:bg-amber-500/15 shadow-xs ring-1 ring-amber-400/60 dark:ring-amber-500/40"
            : enabled
            ? `${config.bgClass} shadow-xs`
            : "bg-zinc-200 dark:bg-zinc-800 opacity-40 grayscale"
        }`}
      >
        <Icon
          size={iconSize}
          className={`${
            showPaused
              ? "text-amber-600 dark:text-amber-400 fill-transparent"
              : enabled
              ? "text-zinc-950 fill-white"
              : "text-zinc-500 dark:text-zinc-400 fill-transparent"
          } stroke-[2.3px]`}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </div>
      {showPaused && (
        <span
          className="absolute -top-1 -right-1 flex items-center justify-center w-3.5 h-3.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-zinc-950"
          aria-hidden="true"
        >
          <Pause size={7} className="text-white" fill="white" strokeWidth={0} />
        </span>
      )}
      {Boolean(count) && (
        <span
          className="absolute -bottom-1 -right-1 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[10px] font-mono font-bold leading-none ring-2 ring-white dark:ring-zinc-950"
          aria-hidden="true"
        >
          {count! > 99 ? "99+" : count}
        </span>
      )}
    </div>
  );
}