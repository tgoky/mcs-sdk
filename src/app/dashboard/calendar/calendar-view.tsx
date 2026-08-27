"use client";

// src/app/dashboard/calendar/calendar-view.tsx
//
// Client wrapper owning the Month/List toggle + the "click a day in Month
// view -> filter List view to that day" interaction — the page itself
// stays a server component for data fetching and month navigation (plain
// ?month= links), this just owns the view-mode state on top of the
// events it's handed.

import { useState } from "react";
import { CalendarIcon, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { CalendarMonthGrid } from "./calendar-month-grid";
import { CalendarAgenda } from "./calendar-agenda";
import type { CalendarEvent } from "@/lib/calendar-events";

type ViewMode = "month" | "list";

export function CalendarView({ events, year, month }: { events: CalendarEvent[]; year: number; month: number }) {
  const [mode, setMode] = useState<ViewMode>("month");
  const [focusDate, setFocusDate] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 bg-zinc-200/60 dark:bg-zinc-900 p-0.5 rounded-lg border w-fit text-[11px]" style={{ borderColor: "var(--border)" }}>
        {(
          [
            ["month", CalendarIcon, "Month"],
            ["list", List, "List"],
          ] as const
        ).map(([key, Icon, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer",
              mode === key ? "bg-white dark:bg-zinc-800 shadow-xs" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
            )}
            style={mode === key ? { color: "var(--text-primary)" } : undefined}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {mode === "month" ? (
        <CalendarMonthGrid
          events={events}
          year={year}
          month={month}
          onDayClick={(key) => {
            setFocusDate(key);
            setMode("list");
          }}
        />
      ) : (
        <CalendarAgenda events={events} focusDate={focusDate} onClearFocus={() => setFocusDate(null)} />
      )}
    </div>
  );
}
