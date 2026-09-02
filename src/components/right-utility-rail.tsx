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
    <div className="flex items-center gap-0.5">
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
            className={`group relative flex items-center justify-center rounded-lg transition-all duration-300 cursor-pointer overflow-hidden ${
              isBell ? "w-9 h-9" : "w-8 h-8"
            } ${
              active
                ? "text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 shadow-xs"
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            }`}
          >
            <div
              className={`transition-all duration-300 ease-out transform flex items-center justify-center ${
                active
                  ? "scale-[1.3]"
                  : "scale-100 group-hover:scale-[1.3]"
              }`}
            >
              {iconSrc ? (
                <img src={iconSrc} alt="" className="w-4 h-4 object-contain" />
              ) : (
                <Icon size={isBell ? 19 : 16} />
              )}
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