"use client";

// src/app/dashboard/upcoming/upcoming-panel-content.tsx
//
// The right-utility-panel's compact Upcoming tab — all 3 sections the full
// page has (appointments, Win-Back touches, Leak Map), fetched lazily only
// once this tab is opened. Same pattern as autopilot/calendar panel content.

import { useEffect, useState } from "react";
import { Loader2, PhoneCall, RotateCcw, Radar } from "lucide-react";
import { WinBackTouchList } from "./win-back-touch-list";
import { LeakMapAuditList } from "./leak-map-audit-list";
import { CallAgendaList } from "@/app/dashboard/calendar/call-agenda-list";
import type { UpcomingTouch } from "@/lib/upcoming-touches";
import type { CalendarCallEntry } from "@/lib/calendar-roster";
import type { UpcomingLeakMapAudit } from "@/lib/upcoming-leak-map";

interface UpcomingSummary {
  touches: UpcomingTouch[];
  appointments: CalendarCallEntry[];
  leakMapAudits: UpcomingLeakMapAudit[];
}

function MiniHeader({ icon: Icon, label }: { icon: typeof PhoneCall; label: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <Icon size={11} style={{ color: "var(--text-muted)" }} />
      <p className="text-[10px] font-mono font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
    </div>
  );
}

export function UpcomingPanelContent() {
  const [summary, setSummary] = useState<UpcomingSummary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/engagements/upcoming-summary", { signal: controller.signal, cache: "no-store" });
        if (controller.signal.aborted) return;
        if (!res.ok) {
          setError(true);
          return;
        }
        const data = await res.json();
        if (controller.signal.aborted) return;
        setSummary({ touches: data.touches ?? [], appointments: data.appointments ?? [], leakMapAudits: data.leakMapAudits ?? [] });
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
          Couldn&apos;t load Upcoming — try Expand for the full page.
        </p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={16} className="animate-spin" style={{ color: "var(--text-muted)" }} />
      </div>
    );
  }

  return (
    <div className="p-3 overflow-y-auto h-full space-y-5">
      <div>
        <MiniHeader icon={PhoneCall} label="Next appointments" />
        <CallAgendaList calls={summary.appointments} />
      </div>
      <div>
        <MiniHeader icon={RotateCcw} label="Next Win-Back touches" />
        <WinBackTouchList touches={summary.touches} />
      </div>
      <div>
        <MiniHeader icon={Radar} label="Next Leak Map" />
        <LeakMapAuditList audits={summary.leakMapAudits} />
      </div>
    </div>
  );
}
