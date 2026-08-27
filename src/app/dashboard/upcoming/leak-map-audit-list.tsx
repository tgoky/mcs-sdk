"use client";

// src/app/dashboard/upcoming/leak-map-audit-list.tsx
//
// The "next Leak Map" section of /dashboard/upcoming — restyled 2026-08-26
// to match the shared SquishySkillBadge/StatusPill row language (see
// win-back-touch-list.tsx's header comment for why this doesn't switch to
// day-grouping like Calendar has).

import Link from "next/link";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import { StatusPill } from "@/app/dashboard/runs/[id]/_shared/status-pill";
import type { UpcomingLeakMapAudit } from "@/lib/upcoming-leak-map";

function relativeDay(iso: string): { label: string; tone: "warning" | "info" } {
  const target = new Date(iso);
  const now = new Date();
  const msPerDay = 86_400_000;
  const dayDiff = Math.round(
    (Date.UTC(target.getFullYear(), target.getMonth(), target.getDate()) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / msPerDay
  );
  if (dayDiff <= 0) return { label: "Due today", tone: "warning" };
  if (dayDiff === 1) return { label: "Tomorrow", tone: "info" };
  return { label: `In ${dayDiff}d`, tone: "info" };
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
    <div className="rounded-2xl border overflow-hidden shadow-xl divide-y" style={{ borderColor: "var(--border)" }}>
      {audits.map((audit) => {
        const { label, tone } = relativeDay(audit.nextRunAt);
        return (
          <Link
            key={audit.engagementId}
            href={`/dashboard/engagements/${audit.engagementId}`}
            className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
          >
            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 w-20 text-center" style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}>
              {label}
            </span>
            <SquishySkillBadge skill="leak-map" size={16} enabled />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold truncate" style={{ color: "var(--text-primary)" }}>
                {audit.buyer}
              </p>
            </div>
            <StatusPill tone={tone}>{audit.auditType}</StatusPill>
          </Link>
        );
      })}
    </div>
  );
}
