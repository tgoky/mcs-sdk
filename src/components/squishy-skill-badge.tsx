"use client";

import { MapPin, Layers, FileText, RotateCcw, Filter } from "lucide-react";

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
  count,
}: {
  skill: string;
  size?: number;
  enabled?: boolean;
  /** Optional small overlay in the corner — e.g. "3 Pin-Down runs" at a glance on the Executions page. Omitted (no badge rendered) when undefined or 0. */
  count?: number;
}) {
  const config = SKILL_SQUISHY_CONFIG[skill];
  if (!config) return null;

  const Icon = config.icon;
  const iconSize = Math.round(size * 0.54);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className={`flex items-center justify-center rounded-full transition-all duration-200 select-none w-full h-full ${
          enabled
            ? `${config.bgClass} shadow-xs`
            : "bg-zinc-200 dark:bg-zinc-800 opacity-40 grayscale"
        }`}
      >
        <Icon
          size={iconSize}
          className={`${
            enabled
              ? "text-zinc-950 fill-white"
              : "text-zinc-500 dark:text-zinc-400 fill-transparent"
          } stroke-[2.3px]`}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </div>
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