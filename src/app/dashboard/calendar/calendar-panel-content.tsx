"use client";

// src/app/dashboard/calendar/calendar-panel-content.tsx
//
// The right-utility-panel's compact Calendar tab — the next 14 days across
// every client and every skill, fetched lazily only once this tab is
// opened. Same CalendarAgenda the full page renders.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { CalendarAgenda } from "./calendar-agenda";
import type { CalendarEvent } from "@/lib/calendar-events";

export function CalendarPanelContent() {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/engagements/calendar-summary", { signal: controller.signal, cache: "no-store" });
        if (controller.signal.aborted) return;
        if (!res.ok) {
          setError(true);
          return;
        }
        const data = await res.json();
        if (controller.signal.aborted) return;
        setEvents(data.events ?? []);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    })();
    return () => controller.abort();
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full px-4 text-center">
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Couldn&apos;t load the calendar — try Expand for the full page.
        </p>
      </div>
    );
  }

  if (!events) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={16} className="animate-spin" style={{ color: "var(--text-muted)" }} />
      </div>
    );
  }

  return (
    <div className="p-3 overflow-y-auto h-full">
      <p className="text-[10px] font-mono font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
        Next 14 days
      </p>
      <CalendarAgenda events={events} />
    </div>
  );
}
