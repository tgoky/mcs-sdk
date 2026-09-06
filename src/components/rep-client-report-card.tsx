"use client";

import { useState } from "react";
import { MessageSquare, Flag, ShieldAlert, TrendingDown } from "lucide-react";
import type { RepClientReportMetrics } from "@/features/reputation-manager/server/rep-report-service";
import type { ReportPeriod } from "@/features/reports/server/report-service";

const PERIOD_TABS: { key: ReportPeriod; label: string }[] = [
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "all_time", label: "All time" },
];

function pct(n: number | null): string {
  return n === null ? "—" : `${(n * 100).toFixed(0)}%`;
}

function StatBlock({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
        {label}
      </p>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-light text-zinc-900 dark:text-zinc-100">{value}</span>
        {sub && <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">{sub}</span>}
      </div>
    </div>
  );
}

/**
 * Reputation Manager's counterpart to ClientReportCard (client-report-
 * card.tsx) — same period-tabbed stat-block shape, but built on
 * mentions/sentiment/flags/incidents instead of bookings/calls/Win-Back,
 * since those Showtime concepts don't exist for an RM-only client. That
 * mismatch is exactly why /dashboard/reports and this engagement page
 * used to show every client Showtime's own card regardless of which
 * product they're actually enrolled in — a pure-RM client got real stat
 * blocks that all read zero. This renders instead whenever the client has
 * an identity graph (repIdentityGraphRow), the same signal
 * RepSkillsPanel/RepAuditLogPanel already gate on elsewhere on this page.
 */
export function RepClientReportCard({
  operatorName,
  soleAuthorityName,
  metricsByPeriod,
}: {
  operatorName: string;
  soleAuthorityName: string | null;
  metricsByPeriod: Record<ReportPeriod, RepClientReportMetrics>;
}) {
  const [period, setPeriod] = useState<ReportPeriod>("week");
  const m = metricsByPeriod[period];

  return (
    <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800/80 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
            Mentions &amp; Sentiment
          </span>
          <div className="flex items-baseline gap-3 flex-wrap">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">{operatorName}</h2>
            {soleAuthorityName && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">Sole authority: {soleAuthorityName}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5 shrink-0 self-start sm:self-auto">
          {PERIOD_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setPeriod(tab.key)}
              className={`px-2.5 py-1 text-xs font-mono rounded-md transition-colors cursor-pointer ${
                period === tab.key
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
        <StatBlock icon={MessageSquare} label="Mentions" value={m.mentions.total} />
        <StatBlock icon={Flag} label="Flagged" value={m.flagged} />
        <StatBlock icon={TrendingDown} label="Negative sentiment" value={pct(m.mentions.negativePct)} />
        <StatBlock icon={ShieldAlert} label="Incidents" value={m.incidents} />
      </div>

      <div className="space-y-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-800/50">
        {m.mentions.total > 0 ? (
          <div className="space-y-1.5">
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div className="bg-emerald-400 dark:bg-emerald-500" style={{ width: `${(m.mentions.positive / m.mentions.total) * 100}%` }} />
              <div className="bg-zinc-300 dark:bg-zinc-600" style={{ width: `${(m.mentions.neutral / m.mentions.total) * 100}%` }} />
              <div className="bg-rose-400 dark:bg-rose-500" style={{ width: `${(m.mentions.negative / m.mentions.total) * 100}%` }} />
            </div>
            <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono text-zinc-600 dark:text-zinc-400">
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 dark:bg-emerald-500" />{m.mentions.positive} positive</span>
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600" />{m.mentions.neutral} neutral</span>
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-rose-400 dark:bg-rose-500" />{m.mentions.negative} negative</span>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-zinc-400 dark:text-zinc-600 font-mono flex items-center gap-1.5 pt-1">
            <MessageSquare className="w-3.5 h-3.5" /> No mentions scored {m.periodLabel.toLowerCase()}.
          </p>
        )}
      </div>
    </div>
  );
}
