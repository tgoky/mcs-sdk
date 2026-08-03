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
}: {
  skill: string;
  size?: number;
  enabled?: boolean;
}) {
  const config = SKILL_SQUISHY_CONFIG[skill];
  if (!config) return null;

  const Icon = config.icon;
  const iconSize = Math.round(size * 0.54);

  return (
    <div
      className={`flex items-center justify-center rounded-full transition-all duration-200 shrink-0 select-none ${
        enabled
          ? `${config.bgClass} shadow-xs`
          : "bg-zinc-200 dark:bg-zinc-800 opacity-40 grayscale"
      }`}
      style={{ width: size, height: size }}
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
  );
}