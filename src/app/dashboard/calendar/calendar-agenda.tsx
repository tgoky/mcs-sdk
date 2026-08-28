"use client";

// src/app/dashboard/calendar/calendar-agenda.tsx
//
// The list view for /dashboard/calendar — restyled 2026-08-26 to match the
// per-engagement master-roster-calendar.tsx's actual list view (sticky day
// headers, mono time-badge pills, SquishySkillBadge, StatusPill) instead of
// a bespoke style, per direction to reuse that already-designed UI rather
// than re-invent one. The cross-client addition on top of that visual
// language: each row also shows which client it belongs to, since the
// per-engagement version never needed to.

import Link from "next/link";
import { PhoneCall, Mail, Radar, CalendarX2 } from "lucide-react";
import { dateKey, timeStr } from "@/app/dashboard/runs/[id]/_shared/calendar-grid";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import { StatusPill } from "@/app/dashboard/runs/[id]/_shared/status-pill";
import type { CalendarEvent } from "@/lib/calendar-events";

const CALL_STATUS_TONE: Record<string, "success" | "danger" | "neutral" | "info"> = {
  brief_delivered: "success",
  brief_failed: "danger",
  cancelled: "neutral",
  scheduled: "info",
};

function formatDayHeading(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = dateKey(new Date());
  const tomorrow = dateKey(new Date(Date.now() + 86_400_000));
  if (key === today) return "Today";
  if (key === tomorrow) return "Tomorrow";
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function eventTime(event: CalendarEvent): string {
  return event.kind === "call" ? event.callTime : event.scheduledAt;
}

function EventRow({ event }: { event: CalendarEvent }) {
  const timeBadge = (
    <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-zinc-950 bg-[#ffcfd2] px-1.5 py-0.5 rounded shrink-0">
      <PhoneCall size={9} className="fill-current text-rose-950" />
      {timeStr(eventTime(event))}
    </span>
  );

  const row = (() => {
    if (event.kind === "call") {
      return (
        <div className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {timeBadge}
            <div className="min-w-0 space-y-0.5">
              <span className="truncate text-xs font-bold block" style={{ color: "var(--text-primary)" }}>
                {event.prospectName ?? "Unnamed prospect"}
              </span>
              <span className="text-[10px] truncate block" style={{ color: "var(--text-muted)" }}>
                {event.buyer}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <SquishySkillBadge skill="pre-call-read" size={16} enabled />
            <StatusPill tone={CALL_STATUS_TONE[event.status] ?? "neutral"}>{event.status.replace(/_/g, " ")}</StatusPill>
          </div>
        </div>
      );
    }
    if (event.kind === "win_back_touch") {
      return (
        <div className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {timeBadge}
            <div className="min-w-0 space-y-0.5">
              <span className="truncate text-xs font-bold block" style={{ color: "var(--text-primary)" }}>
                {event.prospectName ?? "Win-Back touch"}
              </span>
              <span className="text-[10px] truncate block" style={{ color: "var(--text-muted)" }}>
                {event.buyer}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <SquishySkillBadge skill="win-back" size={16} enabled />
            <span className="flex items-center gap-1 text-[10px] font-bold" style={{ color: "var(--text-muted)" }}>
              <Mail size={11} />
              Touch
            </span>
          </div>
        </div>
      );
    }
    // leak_map_audit
    return (
      <div className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {timeBadge}
          <span className="truncate text-xs font-bold block" style={{ color: "var(--text-primary)" }}>
            {event.buyer}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <SquishySkillBadge skill="leak-map" size={16} enabled />
          <span className="flex items-center gap-1 text-[10px] font-bold capitalize" style={{ color: "var(--text-muted)" }}>
            <Radar size={11} />
            {event.auditType}
          </span>
        </div>
      </div>
    );
  })();

  const href = event.kind === "leak_map_audit" ? `/dashboard/engagements/${event.engagementId}/skills/leak-map` : event.runId ? `/dashboard/runs/${event.runId}` : null;
  return href ? (
    <Link href={href} className="block hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
      {row}
    </Link>
  ) : (
    <div className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">{row}</div>
  );
}

export function CalendarAgenda({ events, focusDate, onClearFocus }: { events: CalendarEvent[]; focusDate?: string | null; onClearFocus?: () => void }) {
  const visible = focusDate ? events.filter((e) => dateKey(eventTime(e)) === focusDate) : events;

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12" style={{ color: "var(--text-muted)" }}>
        <CalendarX2 size={20} />
        <span className="text-xs">
          {focusDate ? "Nothing on the calendar this day." : "Nothing on the calendar for this range across any client."}
        </span>
        {focusDate && onClearFocus && (
          <button type="button" onClick={onClearFocus} className="text-[11px] font-bold underline cursor-pointer" style={{ color: "var(--text-prefill-accent)" }}>
            Show the whole month
          </button>
        )}
      </div>
    );
  }

  const byDay = new Map<string, CalendarEvent[]>();
  for (const event of visible) {
    const key = dateKey(eventTime(event));
    const list = byDay.get(key) ?? [];
    list.push(event);
    byDay.set(key, list);
  }
  const sortedDays = [...byDay.keys()].sort();

  return (
    <div className="rounded-2xl border overflow-hidden shadow-xl" style={{ borderColor: "var(--border)" }}>
      {focusDate && onClearFocus && (
        <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
          <span className="text-[11px] font-bold" style={{ color: "var(--text-primary)" }}>
            {formatDayHeading(focusDate)} only
          </span>
          <button type="button" onClick={onClearFocus} className="text-[11px] font-bold underline cursor-pointer" style={{ color: "var(--text-prefill-accent)" }}>
            Show whole month
          </button>
        </div>
      )}
      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
        {sortedDays.map((day) => (
          <div key={day}>
            <div
              className="sticky top-0 z-10 flex items-center justify-between backdrop-blur-xs px-3 py-1.5 border-b text-[10.5px] font-mono font-bold uppercase tracking-wider"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-muted)" }}
            >
              <span>{formatDayHeading(day)}</span>
              <span className="font-normal" style={{ color: "var(--text-secondary)" }}>
                {byDay.get(day)!.length} event{byDay.get(day)!.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {byDay.get(day)!.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
