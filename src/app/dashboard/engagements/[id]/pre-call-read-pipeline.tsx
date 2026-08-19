"use client";

// src/app/dashboard/engagements/[id]/pre-call-read-pipeline.tsx

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { 
  ChevronLeft, 
  ChevronRight, 
  Search, 
  Mail, 
  Phone, 
  CalendarX2, 
  ExternalLink, 
  ChevronDown, 
  Calendar as CalendarIcon, 
  List as ListIcon, 
  Copy, 
  Check, 
  Clock,
  RefreshCw,
  Building2,
  CalendarDays
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getDaysInMonthGrid, dateKey, timeStr } from "@/app/dashboard/runs/[id]/_shared/calendar-grid";
import { RunActivityPanel } from "@/app/dashboard/runs/[id]/_shared/run-activity-panel";
import { bookingPlatformLabel, briefDestinationLabel, outcomeSourceLabel } from "@/lib/copy";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import type { RosterEntry, RosterStatus } from "@/app/api/engagements/[id]/roster/route";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";
type ViewMode = "month" | "day" | "list";
type ListScope = "week" | "month";

const HOURS = Array.from({ length: 15 }, (_, i) => i + 8);

const STATUS_META: Record<RosterStatus, { label: string; tone: Tone }> = {
  scheduled: { label: "Scheduled", tone: "info" },
  brief_delivered: { label: "Brief delivered", tone: "success" },
  brief_failed: { label: "Brief failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

function matchLabel(entry: RosterEntry): { text: string; tone: Tone } {
  if (entry.researchStatus === "completed") return { text: "Verified", tone: "success" };
  if (entry.researchStatus === "failed") return { text: "Research failed", tone: "warning" };
  if (entry.researchStatus === "skipped_low_confidence") return { text: "Not verified", tone: "neutral" };
  return { text: "Not scored", tone: "neutral" };
}

const OUTCOME_META: Record<string, { label: string; tone: Tone }> = {
  showed: { label: "Showed", tone: "success" },
  no_show: { label: "No-show", tone: "danger" },
  rescheduled: { label: "Rescheduled", tone: "warning" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

function StatusPill({
  tone,
  children,
  className,
}: {
  tone: Tone | string;
  children: React.ReactNode;
  className?: string;
}) {
  const toneClasses =
    {
      success: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-300",
      danger: "bg-[#ffcfd2] text-rose-950 dark:bg-rose-950/60 dark:text-rose-200",
      warning: "bg-amber-100 text-amber-950 dark:bg-amber-500/20 dark:text-amber-300",
      info: "bg-sky-100 text-sky-950 dark:bg-sky-500/20 dark:text-sky-300",
      neutral: "bg-zinc-200/80 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-300",
    }[tone] ?? "bg-zinc-200/80 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-300";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-tight transition-colors border-0",
        toneClasses,
        className
      )}
    >
      {children}
    </span>
  );
}

function formatDayHeader(dateStr: string) {
  const todayKey = dateKey(new Date());

  const yesterdayObj = new Date();
  yesterdayObj.setDate(yesterdayObj.getDate() - 1);
  const yesterdayKey = dateKey(yesterdayObj);

  const tomorrowObj = new Date();
  tomorrowObj.setDate(tomorrowObj.getDate() + 1);
  const tomorrowKey = dateKey(tomorrowObj);

  if (dateStr === todayKey) return "Today";
  if (dateStr === yesterdayKey) return "Yesterday";
  if (dateStr === tomorrowKey) return "Tomorrow";
  
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatTimeBadge(isoString: string | null | undefined) {
  if (!isoString) return null;
  return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function PreCallReadPipeline({ engagementId }: { engagementId: string }) {
  const [mode, setMode] = useState<ViewMode>("month");
  const [listScope, setListScope] = useState<ListScope>("week");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [showRunActivity, setShowRunActivity] = useState(false);
  const [showUpcomingInMonth, setShowUpcomingInMonth] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthString = `${year}-${String(month + 1).padStart(2, "0")}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/roster?month=${monthString}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Failed to load calls.");
      const body = await res.json();
      const loadedEntries: RosterEntry[] = body.entries ?? [];
      setEntries(loadedEntries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load calls.");
    } finally {
      setLoading(false);
    }
  }, [engagementId, monthString]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCopyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  const filtered = useMemo(() => {
    if (!filterText.trim()) return entries;
    const q = filterText.toLowerCase();
    return entries.filter((e) => (e.prospectName ?? e.prospectEmail ?? "").toLowerCase().includes(q));
  }, [entries, filterText]);

  const entriesByDate = useMemo(() => {
    const map: Record<string, RosterEntry[]> = {};
    for (const entry of filtered) {
      const k = dateKey(new Date(entry.callTime));
      (map[k] ??= []).push(entry);
    }
    return map;
  }, [filtered]);

  // SMART WEEK GENERATOR: 7 Days centered on active week (Mon -> Sun)
  const currentWeekDays = useMemo(() => {
    const anchor = selectedDate || new Date();
    const d = new Date(anchor);
    const day = d.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day; // Adjust for Sunday
    const monday = new Date(d);
    monday.setDate(d.getDate() + diffToMon);

    const days: { dateStr: string; dateObj: Date; calls: RosterEntry[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const dateObj = new Date(monday);
      dateObj.setDate(monday.getDate() + i);
      const k = dateKey(dateObj);
      const calls = entriesByDate[k] ?? [];
      days.push({ dateStr: k, dateObj, calls });
    }
    // Sort descending so Today/Latest days in week appear first
    return days.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
  }, [selectedDate, entriesByDate]);

  // SMART MONTH FEED: Today & Past first (descending), Future days separate
  const monthDaysSmart = useMemo(() => {
    const todayK = dateKey(new Date());
    const days: { dateStr: string; dateObj: Date; calls: RosterEntry[]; isFuture: boolean }[] = [];
    const numDays = new Date(year, month + 1, 0).getDate();

    for (let d = 1; d <= numDays; d++) {
      const dateObj = new Date(year, month, d);
      const k = dateKey(dateObj);
      const calls = entriesByDate[k] ?? [];
      const isFuture = k > todayK;
      days.push({ dateStr: k, dateObj, calls, isFuture });
    }

    const pastAndToday = days
      .filter((d) => !d.isFuture)
      .sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());

    const future = days
      .filter((d) => d.isFuture)
      .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

    return { pastAndToday, future };
  }, [year, month, entriesByDate]);

  const listDaysToRender = useMemo(() => {
    if (listScope === "week") {
      return currentWeekDays;
    }
    return monthDaysSmart.pastAndToday;
  }, [listScope, currentWeekDays, monthDaysSmart]);

  const dayMetrics = useMemo(() => {
    const metrics: Record<string, { totalCalls: number; briefDelivered: number }> = {};
    for (const entry of filtered) {
      const k = dateKey(new Date(entry.callTime));
      if (!metrics[k]) metrics[k] = { totalCalls: 0, briefDelivered: 0 };
      metrics[k].totalCalls++;
      if (entry.status === "brief_delivered") metrics[k].briefDelivered++;
    }
    return metrics;
  }, [filtered]);

  const selectedDayKey = dateKey(selectedDate);
  const selectedDayEntries = entriesByDate[selectedDayKey] ?? [];

  useEffect(() => {
    if (selectedDayEntries.length > 0) {
      if (!selectedEntryId || !selectedDayEntries.some((e) => e.id === selectedEntryId)) {
        setSelectedEntryId(selectedDayEntries[0].id);
      }
    } else {
      setSelectedEntryId(null);
    }
  }, [selectedDayKey, selectedDayEntries, selectedEntryId]);

  const selectedEntry = useMemo(
    () => filtered.find((e) => e.id === selectedEntryId) ?? selectedDayEntries[0] ?? null,
    [filtered, selectedEntryId, selectedDayEntries]
  );

  const gridDays = useMemo(() => getDaysInMonthGrid(year, month), [year, month]);
  const monthName = currentDate.toLocaleString("default", { month: "long" });
  const briefedCount = filtered.filter((e) => e.status === "brief_delivered").length;

  return (
    <div className="flex flex-col gap-3 font-sans antialiased">
      {/* Shared Toolbar & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 p-2 shadow-sm font-sans">
        <div className="flex flex-wrap items-center gap-2">
          {/* Universal Month Navigation */}
          <div className="flex items-center gap-1 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-800 p-1">
            <button
              type="button"
              onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
              className="rounded-lg p-1 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs font-bold text-zinc-900 dark:text-white font-sans px-1 min-w-[100px] text-center">
              {monthName} {year}
            </span>
            <button
              type="button"
              onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
              className="rounded-lg p-1 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
            >
              <ChevronRight size={14} />
            </button>
            <button
              type="button"
              onClick={() => { setCurrentDate(new Date()); setSelectedDate(new Date()); }}
              className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-2 py-0.5 text-[10.5px] font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 cursor-pointer font-sans ml-0.5"
            >
              Today
            </button>
          </div>

          <div className="relative w-56">
            <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-400 dark:text-zinc-500" />
            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Search prospect name or email..."
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 py-1.5 pl-8 pr-2.5 text-xs text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:border-zinc-400 dark:focus:border-zinc-700 focus:outline-none font-sans"
            />
          </div>

          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer font-sans"
          >
            <RefreshCw size={13} className={cn(loading && "animate-spin")} />
          </button>

          {!loading && (
            <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 font-semibold px-1">
              {briefedCount}/{filtered.length} briefed
            </span>
          )}
        </div>

        {/* Theme-aware view switcher (Month, Day View, List) */}
        <div className="flex items-center gap-1 rounded-xl bg-zinc-200/60 dark:bg-zinc-900 p-1 border border-zinc-200 dark:border-zinc-800 text-xs font-sans">
          {([
            ["month", CalendarIcon, "Month"],
            ["day", Clock, "Day View"],
            ["list", ListIcon, "List"]
          ] as const).map(([viewMode, Icon, label]) => (
            <button
              key={viewMode}
              type="button"
              onClick={() => setMode(viewMode)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold transition-colors cursor-pointer font-sans",
                mode === viewMode
                  ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              )}
            >
              <Icon size={13} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300 dark:border-rose-800/50 bg-rose-100 dark:bg-rose-950/20 px-3 py-2 text-xs text-rose-800 dark:text-rose-300 font-sans">{error}</div>
      )}

      {/* 1. MONTH VIEW */}
      {mode === "month" && !loading && (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 shadow-xl font-sans">
          <div className="grid grid-cols-7 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-900/40 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-500 font-sans">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="border-r border-zinc-200 dark:border-zinc-800/60 py-2 last:border-r-0">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 auto-rows-fr bg-[#f8f7fa] dark:bg-zinc-950 font-sans">
            {gridDays.map(({ date, isCurrentMonth }, idx) => {
              const k = dateKey(date);
              const metric = dayMetrics[k];

              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const cellDate = new Date(date);
              cellDate.setHours(0, 0, 0, 0);

              const isToday = cellDate.getTime() === today.getTime();
              const isPast = cellDate < today;

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => { setSelectedDate(date); setMode("day"); }}
                  className={cn(
                    "group relative flex min-h-[105px] flex-col justify-between border-b border-r border-zinc-200 dark:border-zinc-800/60 p-2 text-left transition-all hover:bg-zinc-200/60 dark:hover:bg-zinc-800/80 cursor-pointer font-sans",
                    !isCurrentMonth && "bg-zinc-100/50 dark:bg-zinc-900/20 opacity-40",
                    isCurrentMonth && isPast && "bg-zinc-200/35 dark:bg-zinc-900/60",
                    isCurrentMonth && !isPast && !isToday && "bg-white dark:bg-zinc-950"
                  )}
                >
                  <div className="flex items-start justify-between gap-1 w-full">
                    <span className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full font-mono text-[11px] font-semibold shrink-0",
                      isToday
                        ? "bg-emerald-500 text-zinc-950 font-bold"
                        : isPast
                        ? "text-zinc-400 dark:text-zinc-500"
                        : "text-zinc-700 dark:text-zinc-300"
                    )}>
                      {date.getDate()}
                    </span>

                    <div className="flex items-center gap-1 shrink-0">
                      {metric && metric.totalCalls > 0 && (
                        <div className="relative">
                          <SquishySkillBadge skill="pre-call-read" size={16} enabled={true} />
                          <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-sky-500 text-[8px] font-bold text-zinc-950 font-mono">
                            {metric.totalCalls}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="my-auto py-1 font-sans">
                    {metric && metric.totalCalls > 0 ? (
                      <div className="rounded-lg bg-[#fde2e8] dark:bg-pink-500/20 px-2 py-1.5 transition-colors group-hover:bg-[#fbcfe8] dark:group-hover:bg-pink-500/30">
                        <span className="text-[11px] font-bold block leading-none text-pink-950 dark:text-pink-200 font-sans">
                          {metric.totalCalls} call{metric.totalCalls === 1 ? "" : "s"}
                        </span>
                        <span className="text-[9.5px] font-mono mt-0.5 block font-semibold text-pink-800 dark:text-pink-300/90">
                          {metric.briefDelivered}/{metric.totalCalls} briefed
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-600 font-mono italic block">No calls</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. DAY VIEW (HOURLY TIMELINE + PERSISTENT INSPECTOR PANEL) */}
      {mode === "day" && !loading && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 font-sans">
          {/* LEFT 7 COLUMNS: HOURLY TIMELINE GRID */}
          <div className="lg:col-span-7 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 shadow-xl flex flex-col font-sans">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/80 dark:bg-zinc-900/60 px-4 py-3 font-sans">
              <div className="flex items-center gap-2 font-sans">
                <button type="button" onClick={() => setSelectedDate(new Date(selectedDate.getTime() - 86400000))} className="rounded-lg p-1.5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white cursor-pointer font-sans">
                  <ChevronLeft size={15} />
                </button>
                <button type="button" onClick={() => setSelectedDate(new Date(selectedDate.getTime() + 86400000))} className="rounded-lg p-1.5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white cursor-pointer font-sans">
                  <ChevronRight size={15} />
                </button>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-sans">
                  {selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                </h3>
              </div>

              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                <span className="text-zinc-600 dark:text-zinc-400 font-semibold">{selectedDayEntries.length} meeting{selectedDayEntries.length === 1 ? "" : "s"}</span>
                {selectedDayEntries.filter((e) => e.status === "brief_delivered").length > 0 && (
                  <span className="text-emerald-900 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-500/20 px-2 py-0.5 rounded text-[10px] font-bold border-0">
                    {selectedDayEntries.filter((e) => e.status === "brief_delivered").length} briefed
                  </span>
                )}
              </div>
            </div>

            {/* Hourly Timeline */}
            <div className="divide-y divide-zinc-200 dark:divide-zinc-900 overflow-y-auto max-h-[620px] p-2 font-sans">
              {HOURS.map((hour) => {
                const hourEntries = selectedDayEntries.filter((e) => new Date(e.callTime).getHours() === hour);
                return (
                  <div key={hour} className="flex min-h-[60px] gap-3 py-1.5 border-b border-zinc-200 dark:border-zinc-900/80 last:border-b-0 font-sans">
                    <span className="w-14 shrink-0 font-mono text-[11px] text-zinc-500 text-right pt-0.5">
                      {hour.toString().padStart(2, "0")}:00
                    </span>
                    <div className="flex-1 space-y-1.5 font-sans">
                      {hourEntries.map((entry) => {
                        const isSelected = selectedEntry?.id === entry.id;
                        return (
                          <button
                            key={entry.id}
                            type="button"
                            onClick={() => setSelectedEntryId(entry.id)}
                            className={cn(
                              "w-full rounded-xl p-2.5 text-left transition-all cursor-pointer flex items-start justify-between gap-2 shadow-xs font-sans border-0",
                              isSelected
                                ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white ring-1 ring-zinc-400 dark:ring-zinc-600"
                                : "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-700/80"
                            )}
                          >
                            <div className="space-y-1 min-w-0 font-sans">
                              <div className="flex items-center gap-2 font-sans">
                                <span className="font-bold text-zinc-900 dark:text-white text-xs font-sans">{entry.prospectName ?? "Unnamed"}</span>
                                <span className="text-[10px] font-mono text-zinc-950 bg-[#ffcfd2] px-1.5 py-0.5 rounded font-bold border-0">
                                  {timeStr(entry.callTime)}
                                </span>
                              </div>
                              <p className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400 truncate">{entry.prospectEmail}</p>

                              <div className="flex flex-wrap gap-1 pt-1 font-sans">
                                <StatusPill tone={STATUS_META[entry.status].tone}>
                                  Brief: {STATUS_META[entry.status].label}
                                </StatusPill>
                              </div>
                            </div>

                            {entry.prospectEmail && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopyEmail(entry.prospectEmail!);
                                }}
                                className="rounded-lg bg-zinc-100 dark:bg-zinc-700/80 p-1.5 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white shrink-0 font-sans border-0"
                              >
                                {copiedEmail ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                              </button>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT 5 COLUMNS: MINI CALENDAR + PROSPECT INSPECTOR PANEL */}
          <div className="lg:col-span-5 space-y-3 font-sans">
            {/* MINI CALENDAR NAVIGATOR */}
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 p-3 space-y-2 shadow-lg font-sans">
              <span className="text-[11px] font-bold text-zinc-900 dark:text-white block px-1 font-sans">{monthName} {year}</span>
              <div className="grid grid-cols-7 text-center text-[9px] font-mono text-zinc-500 font-bold uppercase font-sans">
                {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <div key={i}>{d}</div>)}
              </div>
              <div className="grid grid-cols-7 text-center text-xs gap-1 font-sans">
                {gridDays.map(({ date, isCurrentMonth }, idx) => {
                  const isSelected = dateKey(date) === selectedDayKey;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedDate(date)}
                      className={cn(
                        "h-6 w-6 mx-auto flex items-center justify-center rounded-full font-mono text-[10px] transition-colors cursor-pointer font-sans",
                        isSelected ? "bg-emerald-500 text-zinc-950 font-bold" : isCurrentMonth ? "text-zinc-800 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800" : "text-zinc-400 dark:text-zinc-700"
                      )}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* FULL PROSPECT INSPECTOR PANEL */}
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 p-4 space-y-4 shadow-xl font-sans">
              {selectedEntry ? (
                <>
                  <div className="space-y-2 border-b border-zinc-200 dark:border-zinc-800 pb-3 font-sans">
                    <div className="flex items-center justify-between font-sans flex-wrap gap-1">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-sky-600 dark:text-sky-400 font-bold flex items-center gap-1 font-sans">
                        <Building2 size={12} /> {selectedEntry.bookingPlatform ?? "Calendar"}
                      </span>
                      {selectedEntry.prospectEmail && (
                        <button
                          type="button"
                          onClick={() => handleCopyEmail(selectedEntry.prospectEmail!)}
                          className="flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent px-2 py-1 text-[11px] text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white font-sans"
                        >
                          {copiedEmail ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                          <span>Copy Email</span>
                        </button>
                      )}
                    </div>

                    <h4 className="text-base font-bold text-zinc-900 dark:text-white font-sans">{selectedEntry.prospectName ?? "Unnamed Prospect"}</h4>

                    <div className="space-y-1 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                      {selectedEntry.prospectEmail && (
                        <div className="flex items-center gap-2">
                          <Mail size={12} className="text-zinc-500 shrink-0" />
                          <span className="truncate">{selectedEntry.prospectEmail}</span>
                        </div>
                      )}
                      {selectedEntry.prospectPhone && (
                        <div className="flex items-center gap-2">
                          <Phone size={12} className="text-zinc-500 shrink-0" />
                          <span className="truncate">{selectedEntry.prospectPhone}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-zinc-800 dark:text-zinc-300 pt-0.5">
                        <Clock size={12} className="text-sky-600 dark:text-sky-400 shrink-0" />
                        <span>{new Date(selectedEntry.callTime).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <StatusPill tone={STATUS_META[selectedEntry.status].tone}>{STATUS_META[selectedEntry.status].label}</StatusPill>
                    <StatusPill tone={matchLabel(selectedEntry).tone}>{matchLabel(selectedEntry).text}</StatusPill>
                    {selectedEntry.actualOutcome && (
                      <StatusPill tone={OUTCOME_META[selectedEntry.actualOutcome]?.tone ?? "neutral"}>
                        {OUTCOME_META[selectedEntry.actualOutcome]?.label ?? selectedEntry.actualOutcome}
                      </StatusPill>
                    )}
                  </div>

                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent p-3 space-y-2 text-xs font-sans">
                    <div className="flex items-center justify-between font-sans">
                      <span className="text-zinc-600 dark:text-zinc-400 font-semibold">Delivered via</span>
                      <span className="font-mono text-zinc-900 dark:text-white capitalize">{selectedEntry.destinationDelivered ? briefDestinationLabel(selectedEntry.destinationDelivered) : "Slack"}</span>
                    </div>
                    {selectedEntry.briefDeliveredAt && (
                      <div className="flex items-center justify-between font-sans pt-1">
                        <span className="text-zinc-600 dark:text-zinc-400 font-semibold">Brief Delivered</span>
                        <span className="font-mono text-zinc-900 dark:text-white">{new Date(selectedEntry.briefDeliveredAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                    )}
                    {selectedEntry.personMatchScore !== null && (
                      <div className="flex items-center justify-between font-sans pt-1">
                        <span className="text-zinc-600 dark:text-zinc-400 font-semibold">Identity Match Score</span>
                        <span className="font-mono text-zinc-900 dark:text-white">{selectedEntry.personMatchScore}/100</span>
                      </div>
                    )}
                    {selectedEntry.predictedShowProbability !== null && (
                      <div className="flex items-center justify-between font-sans pt-1">
                        <span className="text-zinc-600 dark:text-zinc-400 font-semibold">Predicted Show Rate</span>
                        <span className="font-mono text-zinc-900 dark:text-white">{selectedEntry.predictedShowProbability}%</span>
                      </div>
                    )}
                    {selectedEntry.outcomeSource && (
                      <div className="flex items-center justify-between font-sans pt-1 gap-3">
                        <span className="text-zinc-600 dark:text-zinc-400 font-semibold shrink-0">Outcome Source</span>
                        <span className="text-zinc-900 dark:text-white text-right font-mono">{outcomeSourceLabel(selectedEntry.outcomeSource, selectedEntry.actualOutcome)}</span>
                      </div>
                    )}
                  </div>

                  {selectedEntry.briefText ? (
                    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent p-3 space-y-1.5 text-xs font-sans">
                      <span className="text-[10.5px] font-mono text-zinc-500 uppercase block">Brief Content</span>
                      <p className="text-zinc-800 dark:text-zinc-300 leading-relaxed font-sans whitespace-pre-wrap max-h-[160px] overflow-y-auto text-[11.5px]">{selectedEntry.briefText}</p>
                    </div>
                  ) : (
                    <p className="text-zinc-500 italic text-[11px] font-sans">No brief text on file for this call.</p>
                  )}

                  {selectedEntry.runId && (
                    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent overflow-hidden text-xs font-sans">
                      <button
                        type="button"
                        onClick={() => setShowRunActivity((p) => !p)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors"
                      >
                        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-300">
                          <SquishySkillBadge skill="pre-call-read" size={14} enabled={true} />
                          Run activity
                        </span>
                        <ChevronDown size={13} className={cn("text-zinc-500 transition-transform", showRunActivity && "rotate-180")} />
                      </button>
                      {showRunActivity && (
                        <div className="px-3 pb-3 pt-1 border-t border-zinc-200 dark:border-zinc-800/60">
                          <RunActivityPanel runId={selectedEntry.runId} />
                          <a
                            href={`/dashboard/runs/${selectedEntry.runId}`}
                            className="mt-3 inline-flex items-center gap-1.5 text-[10.5px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 transition-colors"
                          >
                            <span>Open full research run</span>
                            <ExternalLink size={10} />
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="py-12 text-center text-zinc-500 space-y-2 font-sans">
                  <Clock size={24} className="mx-auto text-zinc-400 dark:text-zinc-600" />
                  <p className="text-xs font-sans">No call selected or found for this date.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. SMART LIST VIEW (DEFAULTS TO CURRENT WEEK ANCHORED ON TODAY) */}
      {mode === "list" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 font-sans">
          {/* LEFT 7 COLUMNS: SMART CHRONOLOGICAL FEED */}
          <div className="lg:col-span-7 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 shadow-xl font-sans flex flex-col">
            {/* List Feed Scope Control Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/80 dark:bg-zinc-900/60 font-sans">
              <div className="flex items-center gap-1.5">
                <CalendarDays size={14} className="text-zinc-500" />
                <span className="text-xs font-bold text-zinc-900 dark:text-white font-sans">
                  {listScope === "week" ? "Current Week Feed" : `${monthName} Feed`}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {listScope === "week" && (
                  <div className="flex items-center gap-1 font-mono text-xs text-zinc-500">
                    <button
                      type="button"
                      onClick={() => setSelectedDate(new Date(selectedDate.getTime() - 7 * 86400000))}
                      className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                      title="Previous Week"
                    >
                      <ChevronLeft size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedDate(new Date())}
                      className="text-[10.5px] px-1.5 py-0.5 rounded font-sans font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 cursor-pointer"
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedDate(new Date(selectedDate.getTime() + 7 * 86400000))}
                      className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                      title="Next Week"
                    >
                      <ChevronRight size={13} />
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-1 bg-zinc-200/60 dark:bg-zinc-900 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-[11px] font-sans">
                  <button
                    type="button"
                    onClick={() => setListScope("week")}
                    className={cn(
                      "px-2 py-0.5 rounded-md font-semibold transition-colors cursor-pointer font-sans",
                      listScope === "week" ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                    )}
                  >
                    Current Week
                  </button>
                  <button
                    type="button"
                    onClick={() => setListScope("month")}
                    className={cn(
                      "px-2 py-0.5 rounded-md font-semibold transition-colors cursor-pointer font-sans",
                      listScope === "month" ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                    )}
                  >
                    Full Month
                  </button>
                </div>
              </div>
            </div>

            {/* List Stream Content */}
            {listDaysToRender.length === 0 && !loading ? (
              <div className="flex flex-col items-center gap-2 py-12 text-zinc-400 dark:text-zinc-600 font-sans">
                <CalendarX2 size={22} />
                <span className="text-xs">No calls on file.</span>
              </div>
            ) : (
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800/60 max-h-[580px] overflow-y-auto">
                {listDaysToRender.map(({ dateStr, dateObj, calls }) => {
                  const isSelectedDay = dateKey(selectedDate) === dateStr;

                  return (
                    <div key={dateStr} className="space-y-0 font-sans">
                      {/* Sticky Day Header */}
                      <div className="sticky top-0 z-10 flex items-center justify-between bg-zinc-100/95 dark:bg-zinc-900/95 backdrop-blur-xs px-4 py-1.5 border-b border-zinc-200/80 dark:border-zinc-800/80 text-[10.5px] font-mono font-bold uppercase tracking-wider text-zinc-500">
                        <span>{formatDayHeader(dateStr)}</span>
                        <span className={cn("font-normal", calls.length > 0 ? "text-zinc-700 dark:text-zinc-300 font-bold" : "text-zinc-400")}>
                          {calls.length} call{calls.length === 1 ? "" : "s"}
                        </span>
                      </div>

                      {/* Day Feed Entries */}
                      <div className="divide-y divide-zinc-200/60 dark:divide-zinc-800/40">
                        {calls.length > 0 ? (
                          calls.map((entry) => {
                            const isSelected = selectedEntry?.id === entry.id;
                            const isFailed = entry.status === "brief_failed";
                            const appointmentHour = formatTimeBadge(entry.callTime);

                            return (
                              <button
                                key={entry.id}
                                type="button"
                                onClick={() => {
                                  setSelectedEntryId(entry.id);
                                  setSelectedDate(new Date(entry.callTime));
                                }}
                                className={cn(
                                  "flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors cursor-pointer font-sans border-0",
                                  isFailed && "bg-[#ffcfd2]/40 dark:bg-rose-950/30",
                                  isSelected
                                    ? "bg-zinc-200/80 dark:bg-zinc-800 text-zinc-900 dark:text-white"
                                    : "bg-white dark:bg-transparent hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50"
                                )}
                              >
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <span className="font-mono text-[10px] font-bold text-zinc-950 bg-[#ffcfd2] px-1.5 py-0.5 rounded shrink-0 border-0">
                                    {appointmentHour}
                                  </span>

                                  <div className="min-w-0 space-y-0.5">
                                    <span className="truncate text-xs font-bold text-zinc-900 dark:text-white block font-sans">
                                      {entry.prospectName ?? entry.prospectEmail}
                                    </span>
                                    {entry.prospectEmail && (
                                      <span className="text-[11px] text-zinc-500 font-mono block truncate">
                                        {entry.prospectEmail}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <StatusPill tone={STATUS_META[entry.status].tone} className="shrink-0">
                                    {STATUS_META[entry.status].label}
                                  </StatusPill>

                                  {entry.prospectEmail && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleCopyEmail(entry.prospectEmail!);
                                      }}
                                      className="p-1 rounded-md text-zinc-400 hover:text-zinc-800 dark:hover:text-white transition-colors"
                                    >
                                      {copiedEmail ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                    </button>
                                  )}
                                </div>
                              </button>
                            );
                          })
                        ) : (
                          /* Explicit empty day row when 0 calls took place */
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDate(dateObj);
                              setSelectedEntryId(null);
                            }}
                            className={cn(
                              "w-full px-4 py-2.5 text-left text-xs font-mono transition-colors cursor-pointer flex items-center justify-between border-0",
                              isSelectedDay
                                ? "bg-zinc-200/60 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 font-semibold"
                                : "text-zinc-400 dark:text-zinc-600 hover:bg-zinc-100/60 dark:hover:bg-zinc-900/40"
                            )}
                          >
                            <span>No calls scheduled</span>
                            <span className="text-[10px] text-zinc-400 dark:text-zinc-600">0 / 0</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Collapsible Upcoming Days Section (Only in Full Month mode) */}
                {listScope === "month" && monthDaysSmart.future.length > 0 && (
                  <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 font-sans">
                    <button
                      type="button"
                      onClick={() => setShowUpcomingInMonth((p) => !p)}
                      className="flex w-full items-center justify-between px-4 py-2 text-[11px] font-mono font-bold text-zinc-500 uppercase tracking-wider hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer font-sans"
                    >
                      <span>Upcoming Days in {monthName} ({monthDaysSmart.future.length})</span>
                      <ChevronDown size={13} className={cn("transition-transform", showUpcomingInMonth && "rotate-180")} />
                    </button>

                    {showUpcomingInMonth && (
                      <div className="divide-y divide-zinc-200 dark:divide-zinc-800/60 font-sans">
                        {monthDaysSmart.future.map(({ dateStr, dateObj, calls }) => (
                          <div key={dateStr} className="space-y-0 font-sans">
                            <div className="bg-zinc-100/90 dark:bg-zinc-900/90 px-4 py-1.5 border-b border-zinc-200/80 dark:border-zinc-800/80 text-[10.5px] font-mono font-bold uppercase tracking-wider text-zinc-500 flex justify-between">
                              <span>{formatDayHeader(dateStr)}</span>
                              <span>{calls.length} calls</span>
                            </div>
                            <div className="divide-y divide-zinc-200/60 dark:divide-zinc-800/40">
                              {calls.length > 0 ? (
                                calls.map((entry) => (
                                  <button
                                    key={entry.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedEntryId(entry.id);
                                      setSelectedDate(new Date(entry.callTime));
                                    }}
                                    className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50 cursor-pointer font-sans border-0"
                                  >
                                    <div className="flex items-center gap-3 min-w-0">
                                      <span className="font-mono text-[10px] font-bold text-zinc-950 bg-[#ffcfd2] px-1.5 py-0.5 rounded shrink-0">
                                        {formatTimeBadge(entry.callTime)}
                                      </span>
                                      <span className="truncate text-xs font-bold text-zinc-900 dark:text-white">
                                        {entry.prospectName ?? entry.prospectEmail}
                                      </span>
                                    </div>
                                    <StatusPill tone={STATUS_META[entry.status].tone}>
                                      {STATUS_META[entry.status].label}
                                    </StatusPill>
                                  </button>
                                ))
                              ) : (
                                <div className="px-4 py-2 text-xs font-mono text-zinc-400 dark:text-zinc-600">No calls scheduled</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT 5 COLUMNS: PROSPECT INSPECTOR PANEL ONLY */}
          <div className="lg:col-span-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 p-4 space-y-4 shadow-xl font-sans">
            {selectedEntry ? (
              <>
                <div className="space-y-2 border-b border-zinc-200 dark:border-zinc-800 pb-3 font-sans">
                  <div className="flex items-center justify-between font-sans flex-wrap gap-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-sky-600 dark:text-sky-400 font-bold flex items-center gap-1 font-sans">
                      <Building2 size={12} /> {selectedEntry.bookingPlatform ?? "Calendar"}
                    </span>
                    {selectedEntry.prospectEmail && (
                      <button
                        type="button"
                        onClick={() => handleCopyEmail(selectedEntry.prospectEmail!)}
                        className="flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent px-2 py-1 text-[11px] text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white font-sans"
                      >
                        {copiedEmail ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                        <span>Copy Email</span>
                      </button>
                    )}
                  </div>

                  <h4 className="text-base font-bold text-zinc-900 dark:text-white font-sans">{selectedEntry.prospectName ?? "Unnamed Prospect"}</h4>

                  <div className="space-y-1 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                    {selectedEntry.prospectEmail && (
                      <div className="flex items-center gap-2">
                        <Mail size={12} className="text-zinc-500 shrink-0" />
                        <span className="truncate">{selectedEntry.prospectEmail}</span>
                      </div>
                    )}
                    {selectedEntry.prospectPhone && (
                      <div className="flex items-center gap-2">
                        <Phone size={12} className="text-zinc-500 shrink-0" />
                        <span className="truncate">{selectedEntry.prospectPhone}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-zinc-800 dark:text-zinc-300 pt-0.5">
                      <Clock size={12} className="text-sky-600 dark:text-sky-400 shrink-0" />
                      <span>{new Date(selectedEntry.callTime).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <StatusPill tone={STATUS_META[selectedEntry.status].tone}>{STATUS_META[selectedEntry.status].label}</StatusPill>
                  <StatusPill tone={matchLabel(selectedEntry).tone}>{matchLabel(selectedEntry).text}</StatusPill>
                  {selectedEntry.actualOutcome && (
                    <StatusPill tone={OUTCOME_META[selectedEntry.actualOutcome]?.tone ?? "neutral"}>
                      {OUTCOME_META[selectedEntry.actualOutcome]?.label ?? selectedEntry.actualOutcome}
                    </StatusPill>
                  )}
                </div>

                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent p-3 space-y-2 text-xs font-sans">
                  <div className="flex items-center justify-between font-sans">
                    <span className="text-zinc-600 dark:text-zinc-400 font-semibold">Delivered via</span>
                    <span className="font-mono text-zinc-900 dark:text-white capitalize">{selectedEntry.destinationDelivered ? briefDestinationLabel(selectedEntry.destinationDelivered) : "Slack"}</span>
                  </div>
                  {selectedEntry.briefDeliveredAt && (
                    <div className="flex items-center justify-between font-sans pt-1">
                      <span className="text-zinc-600 dark:text-zinc-400 font-semibold">Brief Delivered</span>
                      <span className="font-mono text-zinc-900 dark:text-white">{new Date(selectedEntry.briefDeliveredAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  )}
                  {selectedEntry.personMatchScore !== null && (
                    <div className="flex items-center justify-between font-sans pt-1">
                      <span className="text-zinc-600 dark:text-zinc-400 font-semibold">Identity Match Score</span>
                      <span className="font-mono text-zinc-900 dark:text-white">{selectedEntry.personMatchScore}/100</span>
                    </div>
                  )}
                  {selectedEntry.predictedShowProbability !== null && (
                    <div className="flex items-center justify-between font-sans pt-1">
                      <span className="text-zinc-600 dark:text-zinc-400 font-semibold">Predicted Show Rate</span>
                      <span className="font-mono text-zinc-900 dark:text-white">{selectedEntry.predictedShowProbability}%</span>
                    </div>
                  )}
                  {selectedEntry.outcomeSource && (
                    <div className="flex items-center justify-between font-sans pt-1 gap-3">
                      <span className="text-zinc-600 dark:text-zinc-400 font-semibold shrink-0">Outcome Source</span>
                      <span className="text-zinc-900 dark:text-white text-right font-mono">{outcomeSourceLabel(selectedEntry.outcomeSource, selectedEntry.actualOutcome)}</span>
                    </div>
                  )}
                </div>

                {selectedEntry.briefText ? (
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent p-3 space-y-1.5 text-xs font-sans">
                    <span className="text-[10.5px] font-mono text-zinc-500 uppercase block">Brief Content</span>
                    <p className="text-zinc-800 dark:text-zinc-300 leading-relaxed font-sans whitespace-pre-wrap max-h-[160px] overflow-y-auto text-[11.5px]">{selectedEntry.briefText}</p>
                  </div>
                ) : (
                  <p className="text-zinc-500 italic text-[11px] font-sans">No brief text on file for this call.</p>
                )}

                {selectedEntry.runId && (
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent overflow-hidden text-xs font-sans">
                    <button
                      type="button"
                      onClick={() => setShowRunActivity((p) => !p)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors"
                    >
                      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-300">
                        <SquishySkillBadge skill="pre-call-read" size={14} enabled={true} />
                        Run activity
                      </span>
                      <ChevronDown size={13} className={cn("text-zinc-500 transition-transform", showRunActivity && "rotate-180")} />
                    </button>
                    {showRunActivity && (
                      <div className="px-3 pb-3 pt-1 border-t border-zinc-200 dark:border-zinc-800/60">
                        <RunActivityPanel runId={selectedEntry.runId} />
                        <a
                          href={`/dashboard/runs/${selectedEntry.runId}`}
                          className="mt-3 inline-flex items-center gap-1.5 text-[10.5px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 transition-colors"
                        >
                          <span>Open full research run</span>
                          <ExternalLink size={10} />
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="py-12 text-center text-zinc-500 space-y-2 font-sans">
                <CalendarDays size={24} className="mx-auto text-zinc-400 dark:text-zinc-600" />
                <p className="text-xs font-sans">
                  {selectedDate ? (
                    <>
                      <span className="font-bold text-zinc-800 dark:text-zinc-200 block mb-0.5">
                        {selectedDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                      </span>
                      Zero calls scheduled for this date.
                    </>
                  ) : (
                    "Select a date or call from the list to inspect brief details."
                  )}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}