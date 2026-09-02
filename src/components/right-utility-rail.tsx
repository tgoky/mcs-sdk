"use client";

// src/components/right-utility-rail.tsx
//
// The 6-icon row in the top-nav's right corner: Calendar, Teammates,
// Notifications, Autopilot, Upcoming, Plan — in that order, matching how
// they were spec'd this round. Each opens the same right-utility-panel.tsx
// slot; clicking the already-open one closes it (that's the only way it
// closes — no click-outside dismiss). The bell is sized up from the old
// solo bell (17px) since it's now one of six, not the only icon here.

import { CalendarDays, Users, Bell, Bot, ListChecks, Workflow } from "lucide-react";
import type { RightPanelKey } from "@/components/right-utility-panel";

const ICONS: { key: RightPanelKey; icon: typeof Bell; label: string }[] = [
  { key: "calendar", icon: CalendarDays, label: "Calendar" },
  { key: "teammates", icon: Users, label: "Teammates" },
  { key: "notifications", icon: Bell, label: "Notifications" },
  { key: "autopilot", icon: Bot, label: "Autopilot" },
  { key: "upcoming", icon: ListChecks, label: "Upcoming" },
  { key: "plan", icon: Workflow, label: "Plan" },
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
      {ICONS.map(({ key, icon: Icon, label }) => {
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
            className={`relative flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
              isBell ? "w-9 h-9" : "w-8 h-8"
            } ${
              active
                ? "text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800"
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            }`}
          >
            <Icon size={isBell ? 19 : 16} />
            {isBell && unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-[10px] font-bold text-white leading-none">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
