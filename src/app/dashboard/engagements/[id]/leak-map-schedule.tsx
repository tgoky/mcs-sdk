"use client";

// src/app/dashboard/engagements/[id]/leak-map-schedule.tsx

import { useEffect, useMemo, useState, useCallback } from "react";
import { 
  ChevronLeft, 
  ChevronRight, 
  Search, 
  CalendarClock, 
  AlertTriangle, 
  Loader2, 
  CalendarX2,
  RefreshCw,
  CalendarDays,
  Clock,
  ArrowUpRight,
  Zap,
  Calendar
} from "lucide-react";
import { cn } from "@/lib/utils";
import { dateKey } from "@/app/dashboard/runs/[id]/_shared/calendar-grid";
import { StatusPill, toneFromSeverity } from "@/app/dashboard/runs/[id]/_shared/status-pill";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import { auditRunTypeLabel } from "@/lib/copy";
import { LeakMapView } from "@/app/dashboard/runs/[id]/views/leak-map-view";
import type { LeakMapDetail } from "@/app/dashboard/runs/[id]/_shared/types";
import type { AuditHistoryItem, ScheduledAudit, ActiveAlertItem } from "@/app/api/engagements/[id]/leak-map-schedule/route";

type AuditScopeFilter = "all" | "weekly" | "monthly";

function formatDayHeader(dateStr: string) {
  const todayKey = dateKey(new Date());

  const yesterdayObj = new Date();
  yesterdayObj.setDate(yesterdayObj.getDate() - 1);
  const yesterdayKey = dateKey(yesterdayObj);

  if (dateStr === todayKey) return "Today";
  if (dateStr === yesterdayKey) return "Yesterday";

  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatTimeBadge(isoString: string | null | undefined) {
  if (!isoString) return null;
  return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getWeekOfMonth(date: Date) {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  return Math.ceil((date.getDate() + firstDay) / 7);
}

export function LeakMapSchedule({ engagementId }: { engagementId: string }) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [scopeFilter, setScopeFilter] = useState<AuditScopeFilter>("all");
  const [history, setHistory] = useState<AuditHistoryItem[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledAudit[]>([]);
  const [alerts, setAlerts] = useState<ActiveAlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Detail report state for Right Inspector
  const [detail, setDetail] = useState<LeakMapDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/leak-map-schedule`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Failed to load audit schedule.");
      const body = await res.json();
      setHistory(body.history ?? []);
      setScheduled(body.scheduled ?? []);
      setAlerts(body.alerts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit schedule.");
    } finally {
      setLoading(false);
    }
  }, [engagementId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleMonthChange = (newDate: Date) => {
    setCurrentDate(newDate);
    setSelectedDate(newDate);
  };

  const handleTodayClick = () => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDate(now);
  };

  const handleUpdateSelectedDate = (newDate: Date) => {
    setSelectedDate(newDate);
    if (newDate.getFullYear() !== currentDate.getFullYear() || newDate.getMonth() !== currentDate.getMonth()) {
      setCurrentDate(newDate);
    }
  };

  const filtered = useMemo(() => {
    let list = history;

    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      list = list.filter((h) => h.runType.toLowerCase().includes(q));
    }

    if (scopeFilter === "weekly") {
      list = list.filter((h) => h.runType.toLowerCase().includes("week"));
    } else if (scopeFilter === "monthly") {
      list = list.filter((h) => h.runType.toLowerCase().includes("month"));
    }

    return list;
  }, [history, filterText, scopeFilter]);

  // Group monthly history by Week Buckets (Week 1, Week 2, Week 3, Week 4+)
  const monthWeeksGrouped = useMemo(() => {
    const groups: Record<number, AuditHistoryItem[]> = {};

    for (const item of filtered) {
      const itemDate = new Date(item.createdAt);
      if (itemDate.getFullYear() === year && itemDate.getMonth() === month) {
        const w = getWeekOfMonth(itemDate);
        (groups[w] ??= []).push(item);
      }
    }

    return Object.entries(groups)
      .map(([weekNum, audits]) => ({
        weekNum: Number(weekNum),
        audits: audits.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      }))
      .sort((a, b) => b.weekNum - a.weekNum);
  }, [filtered, year, month]);

  const monthlyRunCount = useMemo(() => {
    return monthWeeksGrouped.reduce((acc, curr) => acc + curr.audits.length, 0);
  }, [monthWeeksGrouped]);

  const selected = useMemo(
    () => history.find((h) => h.id === selectedId) ?? monthWeeksGrouped[0]?.audits[0] ?? history[0] ?? null,
    [history, selectedId, monthWeeksGrouped]
  );

  useEffect(() => {
    if (monthWeeksGrouped.length > 0 && !selectedId) {
      const firstAvailable = monthWeeksGrouped[0]?.audits[0];
      if (firstAvailable) setSelectedId(firstAvailable.id);
    }
  }, [monthWeeksGrouped, selectedId]);

  useEffect(() => {
    if (!selected?.runId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    fetch(`/api/skill-runs/${selected.runId}/detail`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load the full report.");
        return res.json();
      })
      .then((body) => {
        if (!cancelled) setDetail(body as LeakMapDetail);
      })
      .catch((err) => {
        if (!cancelled) setDetailError(err instanceof Error ? err.message : "Failed to load report.");
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.runId]);

  const monthName = currentDate.toLocaleString("default", { month: "long" });

  return (
    <div className="flex flex-col gap-3 font-sans antialiased">
      {/* Shared Toolbar & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-2 shadow-xs font-sans">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-zinc-50 dark:bg-zinc-800/80 rounded-xl border border-zinc-200/80 dark:border-zinc-800 p-1">
            <button
              type="button"
              onClick={() => handleMonthChange(new Date(year, month - 1, 1))}
              className="rounded-lg p-1 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs font-bold text-zinc-900 dark:text-white font-sans px-1 min-w-[100px] text-center">
              {monthName} {year}
            </span>
            <button
              type="button"
              onClick={() => handleMonthChange(new Date(year, month + 1, 1))}
              className="rounded-lg p-1 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
            >
              <ChevronRight size={14} />
            </button>
            <button
              type="button"
              onClick={handleTodayClick}
              className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-0.5 text-[10.5px] font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 cursor-pointer font-sans ml-0.5"
            >
              Today
            </button>
          </div>

          <div className="relative w-56">
            <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-400 dark:text-zinc-500" />
            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Search audits..."
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 py-1.5 pl-8 pr-2.5 text-xs text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:border-zinc-400 dark:focus:border-zinc-700 focus:outline-none font-sans"
            />
          </div>
        </div>

        {/* Refresh Button */}
        <div className="flex items-center gap-3 font-sans">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer font-sans"
          >
            <RefreshCw size={13} className={cn(loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-800/50 bg-rose-50 dark:bg-rose-950/20 px-3 py-2 text-xs text-rose-800 dark:text-rose-300 font-sans">{error}</div>
      )}

      {/* SMART SPLIT-PANE AUDIT FEED */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 font-sans">
        {/* LEFT 7 COLUMNS: SCHEDULED AUDIT CARDS & HISTORY */}
        <div className="lg:col-span-7 space-y-3 font-sans">
          {/* Next Scheduled Audits Card Strip */}
          {!loading && scheduled.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {scheduled.map((s) => (
                <div
                  key={s.auditType}
                  className="flex items-center gap-2.5 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 shadow-xs font-sans"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold shrink-0">
                    <CalendarClock size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 block">
                      Next {s.auditType} audit
                    </span>
                    <span className="text-xs font-bold text-zinc-900 dark:text-white block truncate">
                      {new Date(s.nextRunAt).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="text-[10px] text-zinc-400 font-mono block">({s.timezone})</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Active Alerts Strip */}
          {!loading && alerts.length > 0 && (
            <div className="rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/80 dark:bg-rose-950/20 p-3.5 font-sans space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-rose-900 dark:text-rose-300">
                <AlertTriangle size={14} className="text-rose-600 dark:text-rose-400" />
                <span>{alerts.length} active funnel alert{alerts.length === 1 ? "" : "s"}</span>
              </div>
              <div className="space-y-1">
                {alerts.map((a) => (
                  <div key={a.id} className="flex items-center justify-between text-xs text-rose-950 dark:text-rose-200 font-sans">
                    <span className="font-bold">{a.metricName}</span>
                    <span className="font-mono text-[11px]">
                      {a.comparison} {a.threshold}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Monthly Timeline Feed */}
          <div className="overflow-hidden rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-xs font-sans flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/60 font-sans">
              <div className="flex items-center gap-1.5">
                <CalendarDays size={14} className="text-zinc-500" />
                <span className="text-xs font-bold text-zinc-900 dark:text-white font-sans">
                  {monthName} Timeline
                </span>
              </div>

              {/* Scope Filter Segmented Pill */}
              <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-[11px] font-sans">
                <button
                  type="button"
                  onClick={() => setScopeFilter("all")}
                  className={cn(
                    "px-2 py-0.5 rounded-md font-semibold transition-colors cursor-pointer font-sans",
                    scopeFilter === "all"
                      ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                  )}
                >
                  All ({monthlyRunCount})
                </button>
                <button
                  type="button"
                  onClick={() => setScopeFilter("weekly")}
                  className={cn(
                    "px-2 py-0.5 rounded-md font-semibold transition-colors cursor-pointer font-sans",
                    scopeFilter === "weekly"
                      ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                  )}
                >
                  Weekly
                </button>
                <button
                  type="button"
                  onClick={() => setScopeFilter("monthly")}
                  className={cn(
                    "px-2 py-0.5 rounded-md font-semibold transition-colors cursor-pointer font-sans",
                    scopeFilter === "monthly"
                      ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                  )}
                >
                  Monthly
                </button>
              </div>
            </div>

            {monthWeeksGrouped.length === 0 && !loading ? (
              <div className="flex flex-col items-center gap-2 py-12 text-zinc-400 dark:text-zinc-600 font-sans">
                <CalendarX2 size={22} />
                <span className="text-xs">
                  No {scopeFilter === "all" ? "" : `${scopeFilter} `}audits recorded in {monthName} {year}.
                </span>
              </div>
            ) : (
              <div className="divide-y divide-zinc-200/80 dark:divide-zinc-800/60 max-h-[520px] overflow-y-auto">
                {monthWeeksGrouped.map(({ weekNum, audits }) => (
                  <div key={weekNum} className="space-y-0 font-sans">
                    <div className="sticky top-0 z-10 flex items-center justify-between bg-zinc-100/90 dark:bg-zinc-900/90 backdrop-blur-xs px-4 py-1.5 border-b border-zinc-200/80 dark:border-zinc-800/80 text-[10.5px] font-mono font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                      <span>Week {weekNum}</span>
                      <span>{audits.length} run{audits.length === 1 ? "" : "s"}</span>
                    </div>

                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800/40">
                      {audits.map((item) => {
                        const isSelected = selected?.id === item.id;
                        const timeBadge = formatTimeBadge(item.createdAt);
                        const isManual = item.runType.toLowerCase().includes("manual") || item.runType.toLowerCase().includes("adhoc");

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setSelectedId(item.id);
                              handleUpdateSelectedDate(new Date(item.createdAt));
                            }}
                            className={cn(
                              "flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors cursor-pointer font-sans border-0",
                              isSelected
                                ? "bg-zinc-100/80 dark:bg-zinc-800 text-zinc-900 dark:text-white"
                                : "bg-white dark:bg-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 rounded shrink-0">
                                <Clock size={9} />
                                {formatDayHeader(dateKey(new Date(item.createdAt)))} • {timeBadge}
                              </span>

                              <div className="min-w-0 space-y-0.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="truncate text-xs font-bold text-zinc-900 dark:text-white font-sans">
                                    {auditRunTypeLabel(item.runType)}
                                  </span>
                                  {isManual ? (
                                    <span className="inline-flex items-center gap-0.5 text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 font-semibold shrink-0">
                                      <Zap size={8} /> Manual
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-0.5 text-[9px] font-mono px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 font-semibold shrink-0">
                                      <Calendar size={8} /> Automated
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-zinc-500 font-mono block truncate">
                                  {item.topIssueCount} issue{item.topIssueCount === 1 ? "" : "s"} · {item.alertsFiredCount} alert{item.alertsFiredCount === 1 ? "" : "s"}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <StatusPill
                                tone={toneFromSeverity(item.overallSeverity)}
                                className={cn(
                                  "shrink-0 capitalize",
                                  item.overallSeverity === "none" &&
                                    "bg-transparent text-amber-700 border border-amber-400 dark:bg-zinc-800 dark:text-amber-400 dark:border-amber-500/40"
                                )}
                              >
                                {item.overallSeverity === "none" ? "Clean" : `${item.overallSeverity} severity`}
                              </StatusPill>
                              <SquishySkillBadge skill="leak-map" size={18} enabled={true} />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT 5 COLUMNS: PERSISTENT AUDIT INSPECTOR PANEL */}
        <div className="lg:col-span-5 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 space-y-4 shadow-xs font-sans">
          {selected ? (
            <>
              <div className="space-y-2 border-b border-zinc-200 dark:border-zinc-800 pb-3 font-sans">
                <div className="flex items-center justify-between font-sans flex-wrap gap-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold">
                    Funnel Audit Diagnostic
                  </span>
                  <div className="flex items-center gap-2">
                    <StatusPill
                      tone={toneFromSeverity(selected.overallSeverity)}
                      className={cn(
                        "capitalize",
                        selected.overallSeverity === "none" &&
                          "bg-transparent text-amber-700 border border-amber-400 dark:bg-zinc-800 dark:text-amber-400 dark:border-amber-500/40"
                      )}
                    >
                      {selected.overallSeverity === "none" ? "Clean" : `${selected.overallSeverity} severity`}
                    </StatusPill>
                    <SquishySkillBadge skill="leak-map" size={16} enabled={true} />
                  </div>
                </div>

                <h4 className="text-base font-bold text-zinc-900 dark:text-white font-sans">
                  {auditRunTypeLabel(selected.runType)}
                </h4>

                <div className="flex items-center gap-2 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                  <Clock size={12} className="text-zinc-500 shrink-0" />
                  <span>{new Date(selected.createdAt).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </div>

              {/* Metric Breakdown Cards */}
              <div className="grid grid-cols-3 gap-2 font-sans text-center">
                <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 p-2 space-y-0.5">
                  <span className="text-[10px] font-mono text-zinc-500 uppercase block font-bold">Issues</span>
                  <span className="text-base font-bold text-zinc-900 dark:text-white font-mono">{selected.topIssueCount}</span>
                </div>
                <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 p-2 space-y-0.5">
                  <span className="text-[10px] font-mono text-zinc-500 uppercase block font-bold">Alerts</span>
                  <span className="text-base font-bold text-zinc-900 dark:text-white font-mono">{selected.alertsFiredCount}</span>
                </div>
                <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 p-2 space-y-0.5">
                  <span className="text-[10px] font-mono text-zinc-500 uppercase block font-bold">Gaps</span>
                  <span className="text-base font-bold text-zinc-900 dark:text-white font-mono">{selected.gapsCount}</span>
                </div>
              </div>

              {/* Embedded Report Content */}
              {selected.runId && (
                <div className="space-y-2 font-sans">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-300 font-sans">
                      Audit Diagnostic Report
                    </span>
                    <a
                      href={`/dashboard/runs/${selected.runId}`}
                      className="inline-flex items-center gap-1 text-[10.5px] text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors font-medium font-sans"
                    >
                      <span>Open full page</span>
                      <ArrowUpRight size={12} />
                    </a>
                  </div>

                  <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 text-zinc-900 dark:text-zinc-100 p-3 max-h-[320px] overflow-y-auto text-xs font-sans relative">
                    {detailLoading && (
                      <div className="flex items-center justify-center py-8 text-zinc-500">
                        <Loader2 size={16} className="animate-spin" />
                      </div>
                    )}
                    {detailError && (
                      <p className="text-[11px] text-rose-600 dark:text-rose-400 font-sans">{detailError}</p>
                    )}
                    {!detailLoading && !detailError && detail && "audit" in detail && (
                      <div className="font-sans text-xs">
                        <LeakMapView detail={detail} embedded />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="py-12 text-center text-zinc-500 space-y-2 font-sans">
              <CalendarDays size={24} className="mx-auto text-zinc-400 dark:text-zinc-600" />
              <p className="text-xs font-sans">Select an audit from the list to inspect report details.</p>
            </div>
          )} 
        </div>
      </div>
    </div>
  );
}