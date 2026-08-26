"use client";

// src/app/dashboard/upcoming/win-back-touch-list.tsx
//
// Shared presentational list for /dashboard/upcoming — used by both the
// full page and the compact right-utility-panel tab, same reuse pattern
// as AutopilotTable / CallAgendaList.

import Link from "next/link";
import { Mail, AlertTriangle } from "lucide-react";
import type { UpcomingTouch } from "@/lib/upcoming-touches";

function relativeDay(iso: string): { label: string; overdue: boolean } {
  const target = new Date(iso);
  const now = new Date();
  const msPerDay = 86_400_000;
  const dayDiff = Math.round((Date.UTC(target.getFullYear(), target.getMonth(), target.getDate()) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / msPerDay);
  if (dayDiff < 0) return { label: `Overdue by ${Math.abs(dayDiff)}d`, overdue: true };
  if (dayDiff === 0) return { label: "Due today", overdue: false };
  if (dayDiff === 1) return { label: "Tomorrow", overdue: false };
  return { label: `In ${dayDiff}d`, overdue: false };
}

export function WinBackTouchList({ touches }: { touches: UpcomingTouch[] }) {
  if (touches.length === 0) {
    return (
      <div className="text-center py-12 text-xs font-mono font-medium text-zinc-400 dark:text-zinc-600">
        No Win-Back touches due across any client right now.
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {touches.map((touch) => {
        const { label, overdue } = relativeDay(touch.nextTouchAt);
        const row = (
          <div
            className="flex items-center gap-3 rounded-lg px-3 py-2"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <span
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold shrink-0 w-24 justify-center ${
                overdue
                  ? "text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40"
                  : "text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40"
              }`}
            >
              {overdue && <AlertTriangle size={10} />}
              {label}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold truncate" style={{ color: "var(--text-primary)" }}>
                {touch.prospectName ?? touch.prospectEmail}
              </p>
              <p className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
                {touch.buyer}
              </p>
            </div>
            <span className="flex items-center gap-1 text-[10px] font-mono font-bold shrink-0" style={{ color: "var(--text-muted)" }}>
              <Mail size={11} />
              {touch.touchesSent}/{touch.touchesTotal}
            </span>
          </div>
        );
        return touch.runId ? (
          <Link key={touch.enrollmentId} href={`/dashboard/runs/${touch.runId}`} className="block hover:opacity-80 transition-opacity">
            {row}
          </Link>
        ) : (
          <div key={touch.enrollmentId}>{row}</div>
        );
      })}
    </div>
  );
}
