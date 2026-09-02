"use client";

import {
  CalendarRange,
  MessageSquareQuote,
  Bell,
  Workflow,
  ListChecks,
  NotebookText,
  type LucideIcon,
} from "lucide-react";
import type { RightPanelKey } from "@/components/right-utility-panel";

interface UtilityIconConfig {
  key: RightPanelKey;
  icon: LucideIcon;
  label: string;
  colorClass: string;
}

const ICONS: UtilityIconConfig[] = [
  {
    key: "calendar",
    icon: CalendarRange,
    label: "Calendar",
    colorClass: "text-sky-500 fill-sky-500/25 dark:text-sky-400 dark:fill-sky-400/25",
  },
  {
    key: "teammates",
    icon: MessageSquareQuote,
    label: "Teammates",
    colorClass: "text-purple-500 fill-purple-500/25 dark:text-purple-400 dark:fill-purple-400/25",
  },
  {
    key: "notifications",
    icon: Bell,
    label: "Notifications",
    colorClass: "text-amber-500 fill-amber-500/25 dark:text-amber-400 dark:fill-amber-400/25",
  },
  {
    key: "autopilot",
    icon: Workflow,
    label: "Autopilot",
    colorClass: "text-emerald-500 fill-emerald-500/25 dark:text-emerald-400 dark:fill-emerald-400/25",
  },
  {
    key: "upcoming",
    icon: ListChecks,
    label: "Upcoming",
    colorClass: "text-teal-500 fill-teal-500/25 dark:text-teal-400 dark:fill-teal-400/25",
  },
  {
    key: "plan",
    icon: NotebookText,
    label: "Plan",
    colorClass: "text-rose-500 fill-rose-500/25 dark:text-rose-400 dark:fill-rose-400/25",
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
      {ICONS.map(({ key, icon: Icon, label, colorClass }) => {
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
              <Icon size={19} className={`transition-colors ${colorClass}`} />
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