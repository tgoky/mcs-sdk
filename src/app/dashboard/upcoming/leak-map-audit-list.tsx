"use client";

// src/app/dashboard/upcoming/leak-map-audit-list.tsx
//
// The "next Leak Map" section of /dashboard/upcoming — shared between the
// full page and the compact right-panel tab, same reuse pattern as every
// other list on this page.

import Link from "next/link";
import { Radar } from "lucide-react";
import type { UpcomingLeakMapAudit } from "@/lib/upcoming-leak-map";

function relativeDay(iso: string): string {
  const target = new Date(iso);
  const now = new Date();
  const msPerDay = 86_400_000;
  const dayDiff = Math.round(
    (Date.UTC(target.getFullYear(), target.getMonth(), target.getDate()) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / msPerDay
  );
  if (dayDiff <= 0) return "Due today";
  if (dayDiff === 1) return "Tomorrow";
  return `In ${dayDiff}d`;
}

export function LeakMapAuditList({ audits }: { audits: UpcomingLeakMapAudit[] }) {
  if (audits.length === 0) {
    return (
      <div className="text-center py-8 text-xs font-mono font-medium text-zinc-400 dark:text-zinc-600">
        No clients yet — add one from Engagements to see it here.
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {audits.map((audit) => (
        <Link
          key={audit.engagementId}
          href={`/dashboard/engagements/${audit.engagementId}`}
          className="flex items-center gap-3 rounded-lg px-3 py-2 hover:opacity-80 transition-opacity"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <span
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold shrink-0 w-20 justify-center text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40"
          >
            {relativeDay(audit.nextRunAt)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold truncate" style={{ color: "var(--text-primary)" }}>
              {audit.buyer}
            </p>
          </div>
          <span className="flex items-center gap-1 text-[10px] font-mono font-bold capitalize shrink-0" style={{ color: "var(--text-muted)" }}>
            <Radar size={11} />
            {audit.auditType}
          </span>
        </Link>
      ))}
    </div>
  );
}
