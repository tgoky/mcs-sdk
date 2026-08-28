"use client";

// src/app/dashboard/calendar/calendar-view.tsx
//
// Client wrapper owning the Month/List toggle. Month mode is a real
// left/right split — the grid on the left stays visible, and clicking a
// day fills a read-only inspector on the right with that day's events
// (2026-08-28: previously a day click replaced the whole grid with a
// List view filtered to that day, which is why it read as "clicking does
// nothing" — the grid just vanished with no indication anything happened).
// This borrows the master-roster-calendar.tsx spirit of showing a day's
// detail alongside the calendar rather than instead of it, but stays
// read-only and lighter-weight (no hourly timeline, no action buttons) —
// most things on a cross-client calendar are in the future, so there's
// nothing to log an outcome against here; the inspector's job is just
// "what is this and where do I go to act on it."
//
// List mode is unchanged: a flat, day-grouped agenda for the whole month.
// The page itself stays a server component for data fetching and month
// navigation (plain ?month= links); this just owns view-mode + selected-day
// state on top of the events it's handed.

import { useState } from "react";
import { CalendarDays, CalendarIcon, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { CalendarMonthGrid } from "./calendar-month-grid";
import { CalendarAgenda } from "./calendar-agenda";
import type { CalendarEvent } from "@/lib/calendar-events";

type ViewMode = "month" | "list";

function DayInspector({ events, day, onClear }: { events: CalendarEvent[]; day: string | null; onClear: () => void }) {
  if (!day) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 min-h-[200px] h-full rounded-2xl border border-dashed p-6 text-center"
        style={{ borderColor: "var(--border)" }}
      >
        <CalendarDays size={18} style={{ color: "var(--text-muted)" }} />
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Click a day to see what&apos;s on it.
        </p>
      </div>
    );
  }
  return <CalendarAgenda events={events} focusDate={day} onClearFocus={onClear} />;
}

export function CalendarView({ events, year, month }: { events: CalendarEvent[]; year: number; month: number }) {
  const [mode, setMode] = useState<ViewMode>("month");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
          <div className="lg:col-span-8">
            <CalendarMonthGrid events={events} year={year} month={month} selectedDay={selectedDay} onDayClick={setSelectedDay} />
          </div>
          <div className="lg:col-span-4">
            <DayInspector events={events} day={selectedDay} onClear={() => setSelectedDay(null)} />
          </div>
        </div>
      ) : (
        <CalendarAgenda events={events} focusDate={selectedDay} onClearFocus={() => setSelectedDay(null)} />
      )}
    </div>
  );
}
