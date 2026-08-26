"use client";

import { useState } from "react";
import { FileText, PhoneCall, UserX, CalendarClock, RefreshCcw, ClipboardCheck, X, Sparkles } from "lucide-react";
import type { ClientReportMetrics, ReportPeriod } from "@/features/reports/server/report-service";

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

export function ClientReportCard({
  buyerName,
  metricsByPeriod,
  notesByPeriod,
}: {
  buyerName: string;
  metricsByPeriod: Record<ReportPeriod, ClientReportMetrics>;
  notesByPeriod: Partial<Record<"week" | "month", string | null>>;
}) {
  const [period, setPeriod] = useState<ReportPeriod>("week");
  const m = metricsByPeriod[period];
  const note = period !== "all_time" ? notesByPeriod[period] : null;

  return (
    <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800/80 space-y-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-500 block">
            Report
          </span>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
            {buyerName}&apos;s performance
          </h2>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5">
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

      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-900/50 backdrop-blur-xs p-4 space-y-4 shadow-xs">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatBlock icon={CalendarClock} label="Bookings" value={m.bookings} />
          <StatBlock
            icon={PhoneCall}
            label="Show rate"
            value={pct(m.calls.showRate)}
            sub={m.calls.total > 0 ? `${m.calls.total} resolved` : undefined}
          />
          <StatBlock
            icon={RefreshCcw}
            label="Win-Back recovery"
            value={pct(m.winBack.recoveryRate)}
            sub={m.winBack.rebooked + m.winBack.lost > 0 ? `${m.winBack.rebooked}/${m.winBack.rebooked + m.winBack.lost} concluded` : undefined}
          />
          <StatBlock icon={ClipboardCheck} label="Approvals" value={m.approvals.approved} sub={m.approvals.rejected > 0 ? `${m.approvals.rejected} rejected` : undefined} />
        </div>

        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/50 text-[11px] font-mono">
          <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full bg-status-success shrink-0" /> {m.calls.showed} showed
          </div>
          <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
            <UserX className="w-3 h-3 text-rose-500 shrink-0" /> {m.calls.noShow} no-show
          </div>
          <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
            <RefreshCcw className="w-3 h-3 text-amber-500 shrink-0" /> {m.calls.rescheduled} rescheduled
          </div>
          <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full bg-status-success shrink-0" /> {m.winBack.rebooked} rebooked
          </div>
          <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
            <X className="w-3 h-3 text-rose-500 shrink-0" /> {m.winBack.lost} lost
          </div>
          <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
            {m.winBack.active} active · {m.winBack.replyExited} replied
          </div>
        </div>

        {note && (
          <div className="flex items-start gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800/50">
            <Sparkles className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 shrink-0 mt-0.5" />
            <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">{note}</p>
          </div>
        )}

        {!note && period !== "all_time" && (m.bookings > 0 || m.calls.total > 0 || m.winBack.rebooked + m.winBack.lost + m.winBack.active + m.winBack.replyExited > 0) === false && (
          <p className="text-[11px] text-zinc-400 dark:text-zinc-600 font-mono flex items-center gap-1.5 pt-3 border-t border-zinc-100 dark:border-zinc-800/50">
            <FileText className="w-3.5 h-3.5" /> No activity {m.periodLabel.toLowerCase()}.
          </p>
        )}
      </div>
    </div>
  );
}
