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

import { useEffect, useState } from "react";
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

  // Month prev/next stays a real ?month= server navigation (see the file
  // header comment above) — this senses when it happened and which way,
  // then plays a card-flip: the outgoing month rotates away on a Y-axis
  // hinge at the shared edge while the incoming month rotates in from the
  // other side. Both months have to be in the DOM at once for that to
  // read as a flip rather than a glitch — the "outgoing" snapshot below
  // exists for exactly the ~320ms the animation runs, then unmounts.
  //
  // Months aren't a fixed height (getDaysInMonthGrid returns 5 or 6 weeks
  // depending on the actual calendar layout, not a padded-to-6 grid), so
  // this can't size both cards to one shared box the way a fixed-height
  // card flip would. Instead: the incoming grid stays in normal flow (so
  // the container's height is always exactly the new month's real
  // height, no measuring needed) and the outgoing grid is absolutely
  // positioned with only top/left/right set — no `bottom`, so its own
  // height stays intrinsic instead of being stretched or clipped to
  // match a possibly-different-height sibling. Each keeps its own
  // correct shape through the whole rotation.
  const period = year * 12 + month;
  const [tracked, setTracked] = useState({ year, month, events });
  const [outgoing, setOutgoing] = useState<{ year: number; month: number; events: CalendarEvent[]; direction: "forward" | "backward" } | null>(
    null
  );
  const trackedPeriod = tracked.year * 12 + tracked.month;
  if (period !== trackedPeriod) {
    setOutgoing({ ...tracked, direction: period > trackedPeriod ? "forward" : "backward" });
    setTracked({ year, month, events });
    setSelectedDay(null);
  }
  useEffect(() => {
    if (!outgoing) return;
    const timeout = setTimeout(() => setOutgoing(null), 320);
    return () => clearTimeout(timeout);
  }, [outgoing]);

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
            <div className="relative" style={{ perspective: "1400px", transformStyle: "preserve-3d" }}>
              {outgoing && (
                <div
                  key={`${outgoing.year}-${outgoing.month}`}
                  aria-hidden="true"
                  data-direction={outgoing.direction}
                  className="calendar-flip-outgoing absolute top-0 left-0 right-0 pointer-events-none"
                >
                  <CalendarMonthGrid events={outgoing.events} year={outgoing.year} month={outgoing.month} selectedDay={null} onDayClick={() => {}} />
                </div>
              )}
              <div
                key={period}
                className={
                  outgoing
                    ? outgoing.direction === "forward"
                      ? "calendar-flip-incoming-fwd"
                      : "calendar-flip-incoming-back"
                    : undefined
                }
              >
                <CalendarMonthGrid events={events} year={year} month={month} selectedDay={selectedDay} onDayClick={setSelectedDay} />
              </div>
            </div>
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
