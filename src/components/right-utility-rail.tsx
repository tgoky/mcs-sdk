"use client";

import { CalendarDays, Users, Bell, Bot, ListChecks, Workflow, type LucideIcon } from "lucide-react";
import type { RightPanelKey } from "@/components/right-utility-panel";

const ICONS: { key: RightPanelKey; icon: LucideIcon; iconSrc?: string; label: string }[] = [
  { key: "calendar", icon: CalendarDays, iconSrc: "/images/cal.png", label: "Calendar" },
  { key: "teammates", icon: Users, iconSrc: "/images/teammates.png", label: "Teammates" },
  { key: "notifications", icon: Bell, label: "Notifications" },
  { key: "autopilot", icon: Bot, iconSrc: "/images/pilot.png", label: "Autopilot" },
  { key: "upcoming", icon: ListChecks, iconSrc: "/images/upcoming.png", label: "Upcoming" },
  { key: "plan", icon: Workflow, iconSrc: "/images/plan.png", label: "Plan" },
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
      {ICONS.map(({ key, icon: Icon, iconSrc, label }) => {
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
            className={`group relative flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-300 cursor-pointer overflow-hidden ${
              active
                ? "text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 shadow-xs"
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            }`}
          >
            <div
              className={`transition-all duration-300 ease-out transform flex items-center justify-center ${
                active
                  ? "scale-110"
                  : "scale-100 group-hover:scale-110"
              }`}
            >
              {iconSrc ? (
                <img src={iconSrc} alt="" className="w-6 h-6 object-contain" />
              ) : (
                <Icon size={21} />
              )}
            </div>
            {isBell && unreadCount > 0 && (
              <span className="absolute top-1 right-1 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-[10px] font-bold text-white leading-none z-10">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}