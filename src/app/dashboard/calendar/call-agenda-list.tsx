"use client";

// src/app/dashboard/calendar/call-agenda-list.tsx
//
// Shared presentational list for the cross-client Calendar — used by both
// the full /dashboard/calendar page and the compact right-utility-panel
// tab (calendar-panel-content.tsx), same as AutopilotTable is shared by
// Autopilot's page and panel. Groups CalendarCallEntry rows by local day
// using the same dateKey/timeStr helpers the per-engagement master roster
// calendar already uses, so a given call's displayed day/time matches
// what that client's own roster page would show for the same booking.

import Link from "next/link";
import { Phone, PhoneOff, FileWarning, Clock } from "lucide-react";
import { dateKey, timeStr } from "@/app/dashboard/runs/[id]/_shared/calendar-grid";
import type { CalendarCallEntry } from "@/lib/calendar-roster";

const STATUS_META: Record<CalendarCallEntry["status"], { label: string; className: string; icon: typeof Phone }> = {
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
  cancelled: {
    label: "Cancelled",
    className: "text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900",
    icon: PhoneOff,
  },
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

export function CallAgendaList({ calls }: { calls: CalendarCallEntry[] }) {
  if (calls.length === 0) {
    return (
      <div className="text-center py-12 text-xs font-mono font-medium text-zinc-400 dark:text-zinc-600">
        No calls booked in this range across any client.
      </div>
    );
  }

  const byDay = new Map<string, CalendarCallEntry[]>();
  for (const call of calls) {
    const key = dateKey(call.callTime);
    const list = byDay.get(key) ?? [];
    list.push(call);
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
            {byDay.get(day)!.map((call) => {
              const meta = STATUS_META[call.status];
              const StatusIcon = meta.icon;
              const row = (
                <div
                  className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                >
                  <span className="text-[11px] font-mono font-bold shrink-0 w-12" style={{ color: "var(--text-secondary)" }}>
                    {timeStr(call.callTime)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold truncate" style={{ color: "var(--text-primary)" }}>
                      {call.prospectName ?? "Unnamed prospect"}
                    </p>
                    <p className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
                      {call.buyer}
                    </p>
                  </div>
                  <span
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${meta.className}`}
                  >
                    <StatusIcon size={11} />
                    {meta.label}
                  </span>
                </div>
              );
              return call.runId ? (
                <Link key={call.id} href={`/dashboard/runs/${call.runId}`} className="block hover:opacity-80 transition-opacity">
                  {row}
                </Link>
              ) : (
                <div key={call.id}>{row}</div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
