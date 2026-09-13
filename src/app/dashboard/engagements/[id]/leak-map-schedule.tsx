"use client";

// src/app/dashboard/engagements/[id]/leak-map-schedule.tsx

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
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
  AlertCircle,
  Bell
} from "lucide-react";
import { cn } from "@/lib/utils";
import { dateKey } from "@/app/dashboard/runs/[id]/_shared/calendar-grid";
import { StatusPill, toneFromSeverity } from "@/app/dashboard/runs/[id]/_shared/status-pill";
import { auditRunTypeLabel } from "@/lib/copy";
import { LeakMapView } from "@/app/dashboard/runs/[id]/views/leak-map-view";
import { ActionMenu } from "@/components/action-menu";
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

  // Detail report state
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
    // Clear the explicit pick so `selected` falls through to whatever's
    // first in the new month — otherwise it keeps resolving the old
    // selectedId straight out of the full (unfiltered-by-month) history
    // list below, and the detail panel never actually changes.
    setSelectedId(null);
  };

  const handleTodayClick = () => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDate(now);
    setSelectedId(null);
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

  // Group monthly history by Week Buckets
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

  const selected = useMemo(() => {
    // Only trust selectedId when it's actually a pick within the current
    // month's list — otherwise (e.g. right after switching months, before
    // the auto-select effect below runs) fall through to that month's
    // first audit, or null if it has none. Never fall back to the most
    // recent audit overall regardless of month — that's what made the
    // month arrows look like they did nothing.
    const byId = selectedId ? history.find((h) => h.id === selectedId) : null;
    if (byId) return byId;
    return monthWeeksGrouped[0]?.audits[0] ?? null;
  }, [history, selectedId, monthWeeksGrouped]);

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
      {/* Toolbar & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-transparent border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl p-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-zinc-50 dark:bg-zinc-800/80 rounded-xl border border-zinc-200/80 dark:border-zinc-800 p-1">
            <button
              type="button"
              onClick={() => handleMonthChange(new Date(year, month - 1, 1))}
              className="hover-lift press-settle rounded-lg p-1 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs font-bold text-zinc-900 dark:text-white px-1 min-w-[100px] text-center">
              {monthName} {year}
            </span>
            <button
              type="button"
              onClick={() => handleMonthChange(new Date(year, month + 1, 1))}
              className="hover-lift press-settle rounded-lg p-1 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
            >
              <ChevronRight size={14} />
            </button>
            <button
              type="button"
              onClick={handleTodayClick}
              className="hover-lift press-settle shadow-elevation-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-0.5 text-[10.5px] font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 cursor-pointer ml-0.5"
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
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 py-1.5 pl-8 pr-2.5 text-xs text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:border-zinc-400 dark:focus:border-zinc-700 focus:outline-none"
            />
          </div>

          {/* Audit picker — replaces the old always-visible timeline rail,
              which left a mostly-empty column whenever there weren't many
              runs yet. Same content (week-grouped list, scope filter),
              now a dropdown next to search instead of its own column. */}
          <ActionMenu
            align="start"
            panelWidth={340}
            trigger={({ toggle, open }) => (
              <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                disabled={!selected}
                className="hover-lift press-settle shadow-elevation-1 flex items-center gap-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Clock size={13} className="text-zinc-400 shrink-0" />
                {selected ? (
                  <span className="truncate max-w-[160px]">
                    {formatDayHeader(dateKey(new Date(selected.createdAt)))} · {auditRunTypeLabel(selected.runType)}
                  </span>
                ) : (
                  <span className="text-zinc-400">No audits yet</span>
                )}
                <ChevronDown size={12} className="shrink-0 text-zinc-400" />
              </button>
            )}
          >
            {(closeMenu) => (
              <div className="flex flex-col max-h-[70vh]">
                <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 p-1.5 border-b border-zinc-200 dark:border-zinc-800 text-[11px] shrink-0">
                  {(["all", "weekly", "monthly"] as AuditScopeFilter[]).map((scope) => (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => setScopeFilter(scope)}
                      className={cn(
                        "hover-lift press-settle px-2 py-0.5 rounded-md font-semibold transition-colors cursor-pointer capitalize",
                        scopeFilter === scope
                          ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs"
                          : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                      )}
                    >
                      {scope === "all" ? `All (${monthlyRunCount})` : scope}
                    </button>
                  ))}
                </div>

                {monthWeeksGrouped.length === 0 && !loading ? (
                  <div className="flex flex-col items-center gap-2 py-10 text-zinc-400 dark:text-zinc-600">
                    <CalendarX2 size={20} />
                    <span className="text-xs px-4 text-center">
                      No {scopeFilter === "all" ? "" : `${scopeFilter} `}audits recorded in {monthName} {year}.
                    </span>
                  </div>
                ) : (
                  <div className="overflow-y-auto divide-y divide-zinc-200/80 dark:divide-zinc-800/60">
                    {monthWeeksGrouped.map(({ weekNum, audits }) => (
                      <div key={weekNum} className="space-y-0">
                        <div className="flex items-center justify-between px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
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
                                  closeMenu();
                                }}
                                className={cn(
                                  "hover-lift press-settle flex w-full flex-col gap-1 px-3 py-2 text-left transition-colors cursor-pointer border-0 bg-transparent",
                                  isSelected ? "text-zinc-900 dark:text-white" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                                )}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 shrink-0">
                                    {formatDayHeader(dateKey(new Date(item.createdAt)))} · {timeBadge}
                                  </span>
                                  <StatusPill
                                    tone={item.overallSeverity === "none" ? "success" : toneFromSeverity(item.overallSeverity)}
                                    className="shrink-0 capitalize text-[10px]"
                                  >
                                    {item.overallSeverity === "none" ? "Clean" : item.overallSeverity}
                                  </StatusPill>
                                </div>
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="truncate text-xs font-bold text-zinc-900 dark:text-white">
                                    {auditRunTypeLabel(item.runType)}
                                  </span>
                                  {isManual && <Zap size={10} className="text-amber-500 shrink-0" aria-label="Manual" />}
                                </div>
                                <span className="flex items-center gap-2.5 text-[11px] text-zinc-500 dark:text-zinc-500 font-mono">
                                  <span className="inline-flex items-center gap-1">
                                    <AlertCircle size={10} className="shrink-0" />
                                    {item.topIssueCount} issue{item.topIssueCount === 1 ? "" : "s"}
                                  </span>
                                  <span className="inline-flex items-center gap-1">
                                    <Bell size={10} className="shrink-0" />
                                    {item.alertsFiredCount} alert{item.alertsFiredCount === 1 ? "" : "s"}
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </ActionMenu>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="hover-lift press-settle shadow-elevation-1 flex items-center gap-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            <RefreshCw size={13} className={cn(loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-800/50 bg-rose-50 dark:bg-rose-950/20 px-3 py-2 text-xs text-rose-800 dark:text-rose-300">{error}</div>
      )}

      {/* Next Scheduled Audits — one compact line, not two hero tiles for
          metadata you check once and move on from. */}
      {!loading && scheduled.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-1 text-xs text-zinc-500 dark:text-zinc-400">
          {scheduled.map((s) => (
            <span key={s.auditType} className="flex items-center gap-1.5">
              <CalendarClock size={12} className="text-zinc-400 dark:text-zinc-500 shrink-0" />
              Next {s.auditType}:{" "}
              <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                {new Date(s.nextRunAt).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="text-zinc-400 dark:text-zinc-600">({s.timezone})</span>
            </span>
          ))}
        </div>
      )}

      {/* Active Alerts — rare and urgent, stays full-width and prominent */}
      {!loading && alerts.length > 0 && (
        <div className="rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/80 dark:bg-rose-950/20 p-3.5 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-rose-900 dark:text-rose-300">
            <AlertTriangle size={14} className="text-rose-600 dark:text-rose-400" />
            <span>{alerts.length} active funnel alert{alerts.length === 1 ? "" : "s"}</span>
          </div>
          <div className="space-y-1">
            {alerts.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-xs text-rose-950 dark:text-rose-200">
                <span className="font-bold">{a.metricName}</span>
                <span className="font-mono text-[11px]">
                  {a.comparison} {a.threshold}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ONE COLUMN — the audit picker above replaces the old always-
          visible timeline rail (which columns picked which audit, but
          left a mostly-empty column whenever there weren't many runs
          yet). This is just the selected audit's detail now, full
          width — no separate "which audit" header either, since the
          picker button already shows exactly that. */}
      <div className="bg-transparent border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl p-4 space-y-3">
        {selected ? (
          <>
            <div className="flex justify-end">
              <a
                href={`/dashboard/runs/${selected.runId}`}
                className="inline-flex items-center gap-1 text-[10.5px] text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors font-medium shrink-0"
              >
                <span>Open full page</span>
                <ArrowUpRight size={12} />
              </a>
            </div>

            {selected.runId && (
              <div className="relative">
                {detailLoading && (
                  <div className="flex items-center justify-center py-8 text-zinc-500">
                    <Loader2 size={16} className="animate-spin" />
                  </div>
                )}
                {detailError && <p className="text-[11px] text-rose-600 dark:text-rose-400">{detailError}</p>}
                {!detailLoading && !detailError && detail && "audit" in detail && (
                  <LeakMapView detail={detail} embedded history={history} />
                )}
              </div>
            )}
          </>
        ) : (
          <div className="py-12 text-center text-zinc-500 space-y-2">
            <CalendarDays size={24} className="mx-auto text-zinc-400 dark:text-zinc-600" />
            <p className="text-xs">
              {history.length === 0 ? "No audits recorded yet." : `No audits recorded in ${monthName} ${year}.`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}