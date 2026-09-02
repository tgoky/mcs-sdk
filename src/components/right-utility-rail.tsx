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
  // Smooth pastel fill with a subtle, non-stark gray stroke across light & dark themes
  fillStyle: string;
}

const ICONS: UtilityIconConfig[] = [
  {
    key: "calendar",
    icon: CalendarRange,
    label: "Calendar",
    fillStyle: "fill-[#c5bcd3] dark:fill-[#5c4f70] text-zinc-500 dark:text-zinc-400",
  },
  {
    key: "teammates",
    icon: MessageSquareQuote,
    label: "Teammates",
    fillStyle: "fill-[#cfb8e0] dark:fill-[#684b7d] text-zinc-500 dark:text-zinc-400",
  },
  {
    key: "notifications",
    icon: Bell,
    label: "Notifications",
    fillStyle: "fill-[#d8b5eb] dark:fill-[#734b82] text-zinc-500 dark:text-zinc-400",
  },
  {
    key: "autopilot",
    icon: Workflow,
    label: "Autopilot",
    fillStyle: "fill-[#e3b5dd] dark:fill-[#7c4978] text-zinc-500 dark:text-zinc-400",
  },
  {
    key: "upcoming",
    icon: ClockArrowUp,
    label: "Upcoming",
    fillStyle: "fill-[#eab6d2] dark:fill-[#82466d] text-zinc-500 dark:text-zinc-400",
  },
  {
    key: "plan",
    icon: NotebookText,
    label: "Plan",
    fillStyle: "fill-[#f0b8c8] dark:fill-[#87465f] text-zinc-500 dark:text-zinc-400",
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
  return (
    <div className="flex items-center gap-1">
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
            className={`group relative flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-300 cursor-pointer ${
              active
                ? "bg-zinc-200/80 dark:bg-zinc-800/80 shadow-xs"
                : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
            }`}
          >
            <div
              className={`transition-all duration-300 ease-out transform flex items-center justify-center ${
                active ? "scale-115" : "scale-100 group-hover:scale-115"
              }`}
            >
              <Icon size={19} className={`stroke-[1.6px] transition-all ${fillStyle}`} />
            </div>

            {isBell && unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-[10px] font-bold text-white leading-none z-10">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}