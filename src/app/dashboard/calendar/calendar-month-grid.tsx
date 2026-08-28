"use client";

// src/app/dashboard/calendar/calendar-month-grid.tsx
//
// Cross-client month grid for /dashboard/calendar — the same visual
// language as the per-engagement master-roster-calendar.tsx's Month view
// (7-col grid, SquishySkillBadge summaries per cell), adapted for many
// clients at once: each cell shows a skill-badge+count per event type
// present that day, plus a couple of client-name chips (small font, per
// the "reduce font of client names so it fits" direction) with a +N
// overflow instead of the single-engagement version's per-skill count text.

import { getDaysInMonthGrid, dateKey } from "@/app/dashboard/runs/[id]/_shared/calendar-grid";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/calendar-events";

const KIND_TO_SKILL: Record<CalendarEvent["kind"], string> = {
  call: "pre-call-read",
  win_back_touch: "win-back",
  leak_map_audit: "leak-map",
};

const MAX_CLIENT_CHIPS = 2;

function eventTime(event: CalendarEvent): string {
  return event.kind === "call" ? event.callTime : event.scheduledAt;
}

export function CalendarMonthGrid({
  events,
  year,
  month,
  selectedDay,
  onDayClick,
}: {
  events: CalendarEvent[];
  year: number;
  /** 1-indexed, matching the page's own year/month state. */
  month: number;
  selectedDay?: string | null;
  onDayClick: (key: string) => void;
}) {
  const gridDays = getDaysInMonthGrid(year, month - 1);

  const byDay = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = dateKey(eventTime(event));
    const list = byDay.get(key) ?? [];
    list.push(event);
    byDay.set(key, list);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="overflow-hidden rounded-2xl border shadow-xl font-sans" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="grid grid-cols-7 border-b text-center text-[10px] font-bold uppercase tracking-wider" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="border-r py-2 last:border-r-0" style={{ borderColor: "var(--border)" }}>
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 auto-rows-fr">
        {gridDays.map(({ date, isCurrentMonth }, idx) => {
          const key = dateKey(date);
          const dayEvents = byDay.get(key) ?? [];

          const cellDate = new Date(date);
          cellDate.setHours(0, 0, 0, 0);
          const isToday = cellDate.getTime() === today.getTime();
          const isPast = cellDate < today;

          const countsByKind = { call: 0, win_back_touch: 0, leak_map_audit: 0 } as Record<CalendarEvent["kind"], number>;
          const buyersSeen: string[] = [];
          for (const e of dayEvents) {
            countsByKind[e.kind] += 1;
            if (!buyersSeen.includes(e.buyer)) buyersSeen.push(e.buyer);
          }

          return (
            <button
              key={idx}
              type="button"
              onClick={() => onDayClick(key)}
              className={cn(
                "group relative flex min-h-[92px] flex-col gap-1 border-b border-r p-1.5 text-left transition-all cursor-pointer",
                !isCurrentMonth && "opacity-40",
                key === selectedDay && "ring-2 ring-inset ring-emerald-500"
              )}
              style={{
                borderColor: "var(--border)",
                background: isPast && isCurrentMonth ? "var(--surface-2)" : "var(--surface)",
              }}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn("flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px] font-semibold shrink-0", isToday && "bg-emerald-500 text-zinc-950 font-bold")}
                  style={!isToday ? { color: isPast ? "var(--text-muted)" : "var(--text-secondary)" } : undefined}
                >
                  {date.getDate()}
                </span>
                {dayEvents.length > 0 && (
                  <div className="flex items-center gap-0.5">
                    {(["call", "win_back_touch", "leak_map_audit"] as const).map(
                      (kind) =>
                        countsByKind[kind] > 0 && (
                          <div key={kind} className="relative">
                            <SquishySkillBadge skill={KIND_TO_SKILL[kind]} size={14} enabled />
                            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-700 text-[6.5px] font-bold text-zinc-800 dark:text-white font-mono">
                              {countsByKind[kind]}
                            </span>
                          </div>
                        )
                    )}
                  </div>
                )}
              </div>

              {buyersSeen.length > 0 && (
                <div className="flex flex-col gap-0.5 mt-auto">
                  {buyersSeen.slice(0, MAX_CLIENT_CHIPS).map((buyer) => (
                    <span
                      key={buyer}
                      className="truncate text-[9px] font-semibold leading-tight px-1 py-0.5 rounded"
                      style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}
                    >
                      {buyer}
                    </span>
                  ))}
                  {buyersSeen.length > MAX_CLIENT_CHIPS && (
                    <span className="text-[9px] font-mono font-bold" style={{ color: "var(--text-muted)" }}>
                      +{buyersSeen.length - MAX_CLIENT_CHIPS} more
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
