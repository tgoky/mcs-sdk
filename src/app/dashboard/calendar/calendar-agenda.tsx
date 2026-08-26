"use client";

// src/app/dashboard/calendar/calendar-agenda.tsx
//
// The merged, day-grouped, all-3-event-types agenda for /dashboard/calendar
// — deliberately a different component from call-agenda-list.tsx, which
// Upcoming's "next appointments" section still uses and must stay
// calls-only (see calendar-events.ts's header comment for why these two
// pages intentionally diverge). This one renders whatever mix of calls,
// Win-Back touches, and Leak Map audits fall on each day in the browsed
// range, so Calendar reads as a real "everything, this month" view instead
// of just the booking roster it showed before.

import Link from "next/link";
import { Phone, PhoneOff, FileWarning, Clock, Mail, Radar } from "lucide-react";
import { dateKey, timeStr } from "@/app/dashboard/runs/[id]/_shared/calendar-grid";
import type { CalendarEvent } from "@/lib/calendar-events";

const CALL_STATUS_META: Record<string, { label: string; className: string; icon: typeof Phone }> = {
  scheduled: { label: "Scheduled", className: "text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40", icon: Clock },
  brief_delivered: {
    label: "Brief delivered",
    className: "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40",
    icon: Phone,
  },
  brief_failed: {
    label: "Brief failed",
    className: "text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40",
    icon: FileWarning,
  },
  cancelled: { label: "Cancelled", className: "text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900", icon: PhoneOff },
};

function formatDayHeading(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = dateKey(new Date());
  const tomorrow = dateKey(new Date(Date.now() + 86_400_000));
  if (key === today) return "Today";
  if (key === tomorrow) return "Tomorrow";
  return date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

function eventTime(event: CalendarEvent): string {
  return event.kind === "call" ? event.callTime : event.scheduledAt;
}

function EventRow({ event }: { event: CalendarEvent }) {
  if (event.kind === "call") {
    const meta = CALL_STATUS_META[event.status];
    const StatusIcon = meta.icon;
    const row = (
      <div
        className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <span className="text-[11px] font-mono font-bold shrink-0 w-12" style={{ color: "var(--text-secondary)" }}>
          {timeStr(event.callTime)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold truncate" style={{ color: "var(--text-primary)" }}>
            {event.prospectName ?? "Unnamed prospect"}
          </p>
          <p className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
            {event.buyer}
          </p>
        </div>
        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${meta.className}`}>
          <StatusIcon size={11} />
          {meta.label}
        </span>
      </div>
    );
    return event.runId ? (
      <Link href={`/dashboard/runs/${event.runId}`} className="block hover:opacity-80 transition-opacity">
        {row}
      </Link>
    ) : (
      row
    );
  }

  if (event.kind === "win_back_touch") {
    const row = (
      <div
        className="flex items-center gap-3 rounded-lg px-3 py-2"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <span className="text-[11px] font-mono font-bold shrink-0 w-12" style={{ color: "var(--text-secondary)" }}>
          {timeStr(event.scheduledAt)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold truncate" style={{ color: "var(--text-primary)" }}>
            {event.prospectName ?? "Win-Back touch"}
          </p>
          <p className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
            {event.buyer}
          </p>
        </div>
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/40">
          <Mail size={11} />
          Win-Back touch
        </span>
      </div>
    );
    return event.runId ? (
      <Link href={`/dashboard/runs/${event.runId}`} className="block hover:opacity-80 transition-opacity">
        {row}
      </Link>
    ) : (
      row
    );
  }

  // leak_map_audit
  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <span className="text-[11px] font-mono font-bold shrink-0 w-12" style={{ color: "var(--text-secondary)" }}>
        {timeStr(event.scheduledAt)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold truncate" style={{ color: "var(--text-primary)" }}>
          {event.buyer}
        </p>
      </div>
      <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold capitalize shrink-0 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40">
        <Radar size={11} />
        {event.auditType} Leak Map
      </span>
    </div>
  );
}

export function CalendarAgenda({ events }: { events: CalendarEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-xs font-mono font-medium text-zinc-400 dark:text-zinc-600">
        Nothing on the calendar for this range across any client.
      </div>
    );
  }

  const byDay = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = dateKey(eventTime(event));
    const list = byDay.get(key) ?? [];
    list.push(event);
    byDay.set(key, list);
  }
  const sortedDays = [...byDay.keys()].sort();

  return (
    <div className="space-y-4">
      {sortedDays.map((day) => (
        <div key={day}>
          <p className="text-[11px] font-bold font-mono uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
            {formatDayHeading(day)}
          </p>
          <div className="space-y-1.5">
            {byDay.get(day)!.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
