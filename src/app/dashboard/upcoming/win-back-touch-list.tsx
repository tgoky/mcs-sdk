"use client";

// src/app/dashboard/upcoming/win-back-touch-list.tsx
//
// Shared presentational list for /dashboard/upcoming — restyled 2026-08-26
// to the same row language as the master-roster-calendar.tsx list view
// (StatusPill, SquishySkillBadge, bordered/divided container) instead of
// bespoke colored badges — matching visual language, still grouped by
// skill rather than by day, since that's what keeps Upcoming distinct
// from Calendar's day-browsable view (see calendar-agenda.tsx's header).

import Link from "next/link";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import { StatusPill } from "@/app/dashboard/runs/[id]/_shared/status-pill";
import type { UpcomingTouch } from "@/lib/upcoming-touches";

function relativeDay(iso: string): { label: string; tone: "danger" | "warning" | "info" } {
  const target = new Date(iso);
  const now = new Date();
  const msPerDay = 86_400_000;
  const dayDiff = Math.round((Date.UTC(target.getFullYear(), target.getMonth(), target.getDate()) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / msPerDay);
  if (dayDiff < 0) return { label: `Overdue ${Math.abs(dayDiff)}d`, tone: "danger" };
  if (dayDiff === 0) return { label: "Due today", tone: "warning" };
  if (dayDiff === 1) return { label: "Tomorrow", tone: "info" };
  return { label: `In ${dayDiff}d`, tone: "info" };
}

export function WinBackTouchList({ touches }: { touches: UpcomingTouch[] }) {
  if (touches.length === 0) {
    return (
      <div className="text-center py-8 text-xs font-mono font-medium text-zinc-400 dark:text-zinc-600">
        No Win-Back touches due across any client right now.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border overflow-hidden shadow-xl divide-y" style={{ borderColor: "var(--border)" }}>
      {touches.map((touch) => {
        const { label, tone } = relativeDay(touch.nextTouchAt);
        const row = (
          <div className="flex items-center gap-3 px-3 py-2.5 transition-colors" style={{ borderColor: "var(--border)" }}>
            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 w-20 text-center" style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}>
              {label}
            </span>
            <SquishySkillBadge skill="win-back" size={16} enabled />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold truncate" style={{ color: "var(--text-primary)" }}>
                {touch.prospectName ?? touch.prospectEmail}
              </p>
              <p className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
                {touch.buyer}
              </p>
            </div>
            <StatusPill tone={tone}>{`${touch.touchesSent}/${touch.touchesTotal} sent`}</StatusPill>
          </div>
        );
        return touch.runId ? (
          <Link key={touch.enrollmentId} href={`/dashboard/runs/${touch.runId}`} className="block hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
            {row}
          </Link>
        ) : (
          <div key={touch.enrollmentId} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
            {row}
          </div>
        );
      })}
    </div>
  );
}
