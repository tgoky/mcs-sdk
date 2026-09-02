"use client";

import {
  CalendarRange,
  MessageSquareQuote,
  Bell,
  Workflow,
  ClockArrowUp,
  NotebookText,
  type LucideIcon,
} from "lucide-react";
import type { RightPanelKey } from "@/components/right-utility-panel";

interface UtilityIconConfig {
  key: RightPanelKey;
  icon: LucideIcon;
  label: string;
  // Well-balanced grayish-lavender palette (pink tones removed)
  fillStyle: string;
}

const ICONS: UtilityIconConfig[] = [
  {
    key: "calendar",
    icon: CalendarRange,
    label: "Calendar",
    fillStyle: "fill-[#c8c2d6] dark:fill-[#5a526b] text-zinc-700 dark:text-zinc-200",
  },
  {
    key: "teammates",
    icon: MessageSquareQuote,
    label: "Teammates",
    fillStyle: "fill-[#cbbecc] dark:fill-[#5f4d6d] text-zinc-700 dark:text-zinc-200",
  },
  {
    key: "notifications",
    icon: Bell,
    label: "Notifications",
    fillStyle: "fill-[#d0b8cc] dark:fill-[#65496d] text-zinc-700 dark:text-zinc-200",
  },
  {
    key: "autopilot",
    icon: Workflow,
    label: "Autopilot",
    fillStyle: "fill-[#c8b2c4] dark:fill-[#614666] text-zinc-700 dark:text-zinc-200",
  },
  {
    key: "upcoming",
    icon: ClockArrowUp,
    label: "Upcoming",
    fillStyle: "fill-[#bfabbd] dark:fill-[#5a435f] text-zinc-700 dark:text-zinc-200",
  },
  {
    key: "plan",
    icon: NotebookText,
    label: "Plan",
    fillStyle: "fill-[#b8a4b6] dark:fill-[#543f57] text-zinc-700 dark:text-zinc-200",
  },
];

export function RightUtilityRail({
  activePanel,
  onSelect,
  unreadCount,
}: {
  activePanel: RightPanelKey | null;
  onSelect: (key: RightPanelKey) => void;
  unreadCount: number;
}) {
  const isAnyActive = activePanel !== null;

  return (
    <div className="flex items-center gap-1.5 p-1 rounded-full bg-zinc-200/40 dark:bg-zinc-900/40 backdrop-blur-md border border-white/20 dark:border-white/5">
      {ICONS.map(({ key, icon: Icon, label, fillStyle }) => {
        const active = activePanel === key;
        const isBell = key === "notifications";

        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            aria-label={label}
            aria-pressed={active}
            title={label}
            className={`group relative flex items-center justify-center w-9 h-9 rounded-full transition-all duration-300 cursor-pointer backdrop-blur-md overflow-hidden ${
              active
                ? "bg-white/90 dark:bg-white/20 border border-white/90 dark:border-white/30 shadow-[0_4px_14px_rgba(0,0,0,0.12),inset_0_1px_1px_rgba(255,255,255,1)] dark:shadow-[0_4px_14px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.4)] opacity-100 scale-105 z-10"
                : isAnyActive
                ? "border border-transparent bg-transparent opacity-45 hover:opacity-100 hover:bg-white/40 dark:hover:bg-white/10 hover:border-white/30"
                : "border border-transparent bg-transparent opacity-85 hover:opacity-100 hover:bg-white/50 dark:hover:bg-white/10 hover:border-white/40 dark:hover:border-white/10"
            }`}
          >
            <div
              className={`transition-all duration-300 ease-out transform flex items-center justify-center ${
                active ? "scale-110" : "scale-100 group-hover:scale-110"
              }`}
            >
              <Icon size={18} className={`stroke-[1.8px] transition-all ${fillStyle}`} />
            </div>

            {isBell && unreadCount > 0 && (
              <span className="absolute top-1 right-1 flex items-center justify-center min-w-[15px] h-3.5 px-1 rounded-full bg-rose-500 text-[9px] font-bold text-white leading-none z-10 shadow-xs">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}