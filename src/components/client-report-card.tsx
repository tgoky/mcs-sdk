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
  offerDetails,
}: {
  buyerName: string;
  metricsByPeriod: Record<ReportPeriod, ClientReportMetrics>;
  notesByPeriod: Partial<Record<"week" | "month", string | null>>;
  offerDetails?: Record<string, any> | null;
}) {
  const [period, setPeriod] = useState<ReportPeriod>("week");
  const m = metricsByPeriod[period];
  const note = period !== "all_time" ? notesByPeriod[period] : null;

  const offerName = String(offerDetails?.name || "").trim() || "Unspecified Offer";
  const offerPrice = String(offerDetails?.price || "").trim();
  const offerIcp = String(offerDetails?.icp || "").trim();
  const trafficTemp = offerDetails?.traffic_temperature ? String(offerDetails.traffic_temperature) : null;

  return (
    <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800/80 space-y-4">
      {/* Top Row: Offer & Header + Period Controls */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
              Offer & Performance
            </span>
            {trafficTemp && (
              <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 font-mono text-[10px] capitalize">
                {trafficTemp} traffic
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              {offerName}
            </h2>
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 font-mono">
              {offerPrice ? `$${offerPrice}` : "—"}
            </span>
          </div>
        </div>

        {/* Period Selector Tabs */}
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

      {/* Targeting / ICP Description */}
      {offerIcp && (
        <div className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-3xl">
          <span className="font-semibold text-zinc-900 dark:text-zinc-200">Targeting: </span>
          {offerIcp}
        </div>
      )}

      {/* Stat Blocks */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
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
        <StatBlock
          icon={ClipboardCheck}
          label="Approvals"
          value={m.approvals.approved}
          sub={m.approvals.rejected > 0 ? `${m.approvals.rejected} rejected` : undefined}
        />
      </div>

      {/* Breakdown Pills & Insights */}
      <div className="space-y-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-800/50">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-[11px] font-mono">
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
          <div className="flex items-start gap-2 pt-1">
            <Sparkles className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 shrink-0 mt-0.5" />
            <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">{note}</p>
          </div>
        )}

        {!note && period !== "all_time" && (m.bookings > 0 || m.calls.total > 0 || m.winBack.rebooked + m.winBack.lost + m.winBack.active + m.winBack.replyExited > 0) === false && (
          <p className="text-[11px] text-zinc-400 dark:text-zinc-600 font-mono flex items-center gap-1.5 pt-1">
            <FileText className="w-3.5 h-3.5" /> No activity {m.periodLabel.toLowerCase()}.
          </p>
        )}
      </div>
    </div>
  );
}