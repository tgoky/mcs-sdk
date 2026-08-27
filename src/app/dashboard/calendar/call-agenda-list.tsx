"use client";

// src/app/dashboard/calendar/call-agenda-list.tsx
//
// Upcoming's "next appointments" section only now — Calendar itself moved
// to calendar-agenda.tsx's merged multi-skill view (2026-08-26), but this
// stays day-grouped and calls-only on purpose since a specific call
// genuinely has a specific day/time, unlike Win-Back/Leak-Map's "due
// soon" framing elsewhere on the Upcoming page. Restyled to the shared
// SquishySkillBadge/StatusPill row language everything else on this page
// now uses.

import Link from "next/link";
import { dateKey, timeStr } from "@/app/dashboard/runs/[id]/_shared/calendar-grid";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import { StatusPill } from "@/app/dashboard/runs/[id]/_shared/status-pill";
import type { CalendarCallEntry } from "@/lib/calendar-roster";

const STATUS_TONE: Record<CalendarCallEntry["status"], "success" | "danger" | "neutral" | "info"> = {
  scheduled: "info",
  brief_delivered: "success",
  brief_failed: "danger",
  cancelled: "neutral",
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
      <div className="text-center py-8 text-xs font-mono font-medium text-zinc-400 dark:text-zinc-600">
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
    <div className="rounded-2xl border overflow-hidden shadow-xl divide-y" style={{ borderColor: "var(--border)" }}>
      {sortedDays.map((day) => (
        <div key={day}>
          <div
            className="sticky top-0 z-10 flex items-center justify-between backdrop-blur-xs px-3 py-1.5 border-b text-[10.5px] font-mono font-bold uppercase tracking-wider"
            style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-muted)" }}
          >
            <span>{formatDayHeading(day)}</span>
            <span className="font-normal" style={{ color: "var(--text-secondary)" }}>
              {byDay.get(day)!.length} call{byDay.get(day)!.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {byDay.get(day)!.map((call) => {
              const row = (
                <div className="flex items-center gap-3 px-3 py-2.5 transition-colors">
                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 w-14 text-center" style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}>
                    {timeStr(call.callTime)}
                  </span>
                  <SquishySkillBadge skill="pre-call-read" size={16} enabled />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold truncate" style={{ color: "var(--text-primary)" }}>
                      {call.prospectName ?? "Unnamed prospect"}
                    </p>
                    <p className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
                      {call.buyer}
                    </p>
                  </div>
                  <StatusPill tone={STATUS_TONE[call.status]}>{call.status.replace(/_/g, " ")}</StatusPill>
                </div>
              );
              return call.runId ? (
                <Link key={call.id} href={`/dashboard/runs/${call.runId}`} className="block hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                  {row}
                </Link>
              ) : (
                <div key={call.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                  {row}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
