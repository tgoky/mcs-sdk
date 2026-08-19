"use client";

// src/app/dashboard/engagements/[id]/pile-on-pipeline.tsx

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { 
  ChevronLeft, 
  ChevronRight, 
  Search, 
  Mail, 
  Phone,
  PhoneCall, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  ChevronDown, 
  Sparkles,
  Calendar as CalendarIcon,
  List as ListIcon,
  Copy,
  Check,
  Clock,
  RefreshCw,
  CalendarDays,
  CalendarX2,
  ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getDaysInMonthGrid, dateKey, timeStr } from "@/app/dashboard/runs/[id]/_shared/calendar-grid";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import { RunActivityPanel } from "@/app/dashboard/runs/[id]/_shared/run-activity-panel";
import { classifyRunError } from "@/lib/error-classification";
import { sentViaLabel } from "@/lib/copy";
import type { PileOnPipelineItem, PileOnStage, PileOnWeeklyTrend } from "@/app/api/engagements/[id]/pile-on-pipeline/route";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";
type ViewMode = "month" | "day" | "list";
type ListScope = "week" | "month";

const HOURS = Array.from({ length: 15 }, (_, i) => i + 8);

const STAGE_META: Record<PileOnStage, { label: string; tone: Tone }> = {
  newly_booked: { label: "Newly booked", tone: "info" },
  active_sequence: { label: "Active sequence", tone: "warning" },
  sequence_complete: { label: "Sequence complete", tone: "success" },
  call_today: { label: "Call today", tone: "danger" },
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

export function PileOnPipeline({ engagementId }: { engagementId: string }) {
  const [mode, setMode] = useState<ViewMode>("month");
  const [listScope, setListScope] = useState<ListScope>("week");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [items, setItems] = useState<PileOnPipelineItem[]>([]);
  const [weeklyTrend, setWeeklyTrend] = useState<PileOnWeeklyTrend | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [showRunActivity, setShowRunActivity] = useState(false);
  const [showUpcomingInMonth, setShowUpcomingInMonth] = useState(false);

  const firstMeetingRef = useRef<HTMLDivElement | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/pile-on-pipeline`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Failed to load pipeline.");
      const body = await res.json();
      const loadedItems: PileOnPipelineItem[] = body.items ?? [];
      setItems(loadedItems);
      setWeeklyTrend(body.weeklyTrend ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pipeline.");
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

  const handleCopyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  const filtered = useMemo(() => {
    if (!filterText.trim()) return items;
    const q = filterText.toLowerCase();
    return items.filter((i) => (i.prospectName ?? i.prospectEmail).toLowerCase().includes(q));
  }, [items, filterText]);

  const itemsByDate = useMemo(() => {
    const map: Record<string, PileOnPipelineItem[]> = {};
    for (const item of filtered) {
      const k = dateKey(new Date(item.createdAt));
      (map[k] ??= []).push(item);
    }
    return map;
  }, [filtered]);

  const todayK = dateKey(new Date());

  // SMART WEEK GENERATOR: 7 Days centered on active week
  const currentWeekDays = useMemo(() => {
    const anchor = selectedDate || new Date();
    const d = new Date(anchor);
    const day = d.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diffToMon);

    const days: { dateStr: string; dateObj: Date; calls: PileOnPipelineItem[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const dateObj = new Date(monday);
      dateObj.setDate(monday.getDate() + i);
      const k = dateKey(dateObj);
      const calls = itemsByDate[k] ?? [];
      
      if (k <= todayK || calls.length > 0) {
        days.push({ dateStr: k, dateObj, calls });
      }
    }
    return days.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
  }, [selectedDate, itemsByDate, todayK]);

  // SMART MONTH FEED: Today & Past first (descending), Future days separate
  const monthDaysSmart = useMemo(() => {
    const days: { dateStr: string; dateObj: Date; calls: PileOnPipelineItem[]; isFuture: boolean }[] = [];
    const numDays = new Date(year, month + 1, 0).getDate();

    for (let d = 1; d <= numDays; d++) {
      const dateObj = new Date(year, month, d);
      const k = dateKey(dateObj);
      const calls = itemsByDate[k] ?? [];
      const isFuture = k > todayK;
      days.push({ dateStr: k, dateObj, calls, isFuture });
    }

    const pastAndToday = days
      .filter((d) => !d.isFuture)
      .sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());

    const future = days
      .filter((d) => d.isFuture && d.calls.length > 0)
      .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

    return { pastAndToday, future };
  }, [year, month, itemsByDate, todayK]);

  const listDaysToRender = useMemo(() => {
    if (listScope === "week") {
      return currentWeekDays;
    }
    return monthDaysSmart.pastAndToday;
  }, [listScope, currentWeekDays, monthDaysSmart]);

  const dayMetrics = useMemo(() => {
    const metrics: Record<string, { total: number; active: number }> = {};
    for (const item of filtered) {
      const k = dateKey(new Date(item.createdAt));
      if (!metrics[k]) metrics[k] = { total: 0, active: 0 };
      metrics[k].total++;
      if (item.stage === "active_sequence" || item.stage === "call_today") metrics[k].active++;
    }
    return metrics;
  }, [filtered]);

  const selectedDayKey = dateKey(selectedDate);
  const selectedDayItems = itemsByDate[selectedDayKey] ?? [];

  useEffect(() => {
    if (selectedDayItems.length > 0) {
      if (!selectedId || !selectedDayItems.some((i) => i.id === selectedId)) {
        setSelectedId(selectedDayItems[0].id);
      }
    } else {
      setSelectedId(null);
    }
  }, [selectedDayKey, selectedDayItems, selectedId]);

  const selected = useMemo(
    () => filtered.find((i) => i.id === selectedId) ?? selectedDayItems[0] ?? null,
    [filtered, selectedId, selectedDayItems]
  );

  // Auto-scroll timeline to earliest meeting when Day View opens or selected date changes
  useEffect(() => {
    if (mode === "day" && firstMeetingRef.current) {
      firstMeetingRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [mode, selectedDayKey]);

  const gridDays = useMemo(() => getDaysInMonthGrid(year, month), [year, month]);
  const monthName = currentDate.toLocaleString("default", { month: "long" });
  const callTodayCount = filtered.filter((i) => i.stage === "call_today").length;

  const earliestHourWithCall = useMemo(() => {
    if (selectedDayItems.length === 0) return null;
    const hours = selectedDayItems.map((i) => new Date(i.callTime ?? i.createdAt).getHours());
    return Math.min(...hours);
  }, [selectedDayItems]);

  return (
    <div className="flex flex-col gap-3 font-sans antialiased">
      {!loading && weeklyTrend && (weeklyTrend.thisWeek > 0 || weeklyTrend.priorWeek > 0) && (() => {
        const { thisWeek, priorWeek } = weeklyTrend;
        const delta = thisWeek - priorWeek;
        const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
        const tone = delta > 0 ? "text-emerald-600 dark:text-emerald-400" : delta < 0 ? "text-rose-600 dark:text-rose-400" : "text-zinc-500";
        return (
          <div className="flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 px-3 py-2 font-sans shadow-xs">
            <Icon size={13} className={tone} />
            <span className="text-xs text-zinc-700 dark:text-zinc-300 font-sans">
              <span className="font-mono font-bold text-zinc-900 dark:text-white">{thisWeek}</span> booked this week
              <span className="text-zinc-500"> · {priorWeek} last week</span>
            </span>
          </div>
        );
      })()}

      {/* Shared Toolbar & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 p-2 shadow-sm font-sans">
        <div className="flex flex-wrap items-center gap-2">
          {/* Universal Month Navigation */}
          <div className="flex items-center gap-1 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-800 p-1">
            <button
              type="button"
              onClick={() => handleMonthChange(new Date(year, month - 1, 1))}
              className="rounded-lg p-1 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs font-bold text-zinc-900 dark:text-white font-sans px-1 min-w-[100px] text-center">
              {monthName} {year}
            </span>
            <button
              type="button"
              onClick={() => handleMonthChange(new Date(year, month + 1, 1))}
              className="rounded-lg p-1 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
            >
              <ChevronRight size={14} />
            </button>
            <button
              type="button"
              onClick={handleTodayClick}
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
              placeholder="Search prospect name..."
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

          {!loading && callTodayCount > 0 && (
            <span className="flex items-center gap-1.5 text-[11px] font-mono font-semibold text-rose-950 dark:text-rose-200 bg-[#ffcfd2] dark:bg-rose-950/60 px-2.5 py-1 rounded-full shrink-0">
              <PhoneCall size={10} className="fill-current" /> {callTodayCount} call{callTodayCount === 1 ? "" : "s"} today
            </span>
          )}
        </div>

        {/* Theme-aware view switcher */}
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
                      {metric && metric.total > 0 && (
                        <div className="relative">
                          <SquishySkillBadge skill="pile-on" size={16} enabled={true} />
                          <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-purple-500 text-[8px] font-bold text-zinc-950 font-mono">
                            {metric.total}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="my-auto py-1 font-sans">
                    {metric && metric.total > 0 ? (
                      <div className="rounded-lg bg-purple-100/80 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/50 px-2 py-1.5 transition-colors flex items-center gap-1.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-200 text-purple-950 dark:bg-purple-900/60 dark:text-purple-200 shrink-0">
                          <PhoneCall size={10} className="fill-current" />
                        </span>
                        <div>
                          <span className="text-[11px] font-bold block leading-none text-purple-950 dark:text-purple-200 font-sans">
                            {metric.total} booking{metric.total === 1 ? "" : "s"}
                          </span>
                          <span className="text-[9.5px] font-mono mt-0.5 block font-semibold text-purple-700 dark:text-purple-300/90">
                            {metric.active} active
                          </span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-600 font-mono italic block">No bookings</span>
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
                <button type="button" onClick={() => handleUpdateSelectedDate(new Date(selectedDate.getTime() - 86400000))} className="rounded-lg p-1.5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white cursor-pointer font-sans">
                  <ChevronLeft size={15} />
                </button>
                <button type="button" onClick={() => handleUpdateSelectedDate(new Date(selectedDate.getTime() + 86400000))} className="rounded-lg p-1.5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white cursor-pointer font-sans">
                  <ChevronRight size={15} />
                </button>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-sans">
                  {selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                </h3>
              </div>

              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                <span className="flex items-center gap-1 text-zinc-600 dark:text-zinc-400 font-semibold">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#ffcfd2] text-rose-950 dark:bg-rose-950/60 dark:text-rose-200 shrink-0">
                    <PhoneCall size={10} className="fill-current" />
                  </span>
                  {selectedDayItems.length} booking{selectedDayItems.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            {/* Hourly Timeline */}
            <div className="divide-y divide-zinc-200 dark:divide-zinc-900 overflow-y-auto max-h-[620px] p-2 font-sans">
              {HOURS.map((hour) => {
                const hourItems = selectedDayItems.filter((i) => new Date(i.callTime ?? i.createdAt).getHours() === hour);
                const isEarliestHour = earliestHourWithCall === hour;

                return (
                  <div
                    key={hour}
                    ref={isEarliestHour ? firstMeetingRef : null}
                    className="flex min-h-[60px] gap-3 py-1.5 border-b border-zinc-200 dark:border-zinc-900/80 last:border-b-0 font-sans"
                  >
                    <span className="w-14 shrink-0 font-mono text-[11px] text-zinc-500 text-right pt-0.5">
                      {hour.toString().padStart(2, "0")}:00
                    </span>
                    <div className="flex-1 space-y-1.5 font-sans">
                      {hourItems.map((item) => {
                        const isSelected = selected?.id === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setSelectedId(item.id)}
                            className={cn(
                              "w-full rounded-xl p-2.5 text-left transition-all cursor-pointer flex items-start justify-between gap-2 shadow-xs font-sans border-0",
                              isSelected
                                ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white ring-1 ring-zinc-400 dark:ring-zinc-600"
                                : "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-700/80"
                            )}
                          >
                            <div className="space-y-1 min-w-0 font-sans">
                              <div className="flex items-center gap-2 font-sans">
                                <span className="font-bold text-zinc-900 dark:text-white text-xs font-sans">{item.prospectName ?? item.prospectEmail}</span>
                                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-950 bg-[#ffcfd2] px-1.5 py-0.5 rounded font-bold border-0">
                                  <PhoneCall size={9} className="fill-current text-rose-950" />
                                  {timeStr(item.callTime ?? item.createdAt)}
                                </span>
                              </div>
                              <p className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400 truncate">{item.prospectEmail}</p>

                              <div className="flex flex-wrap gap-1 pt-1 font-sans">
                                <StatusPill tone={STAGE_META[item.stage].tone}>
                                  {STAGE_META[item.stage].label}
                                </StatusPill>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyEmail(item.prospectEmail);
                              }}
                              className="rounded-lg bg-zinc-100 dark:bg-zinc-700/80 p-1.5 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white shrink-0 font-sans border-0"
                            >
                              {copiedEmail ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                            </button>
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
                      onClick={() => handleUpdateSelectedDate(date)}
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
              {selected ? (
                <>
                  <div className="space-y-2 border-b border-zinc-200 dark:border-zinc-800 pb-3 font-sans">
                    <div className="flex items-center justify-between font-sans flex-wrap gap-1">
                      <StatusPill tone={STAGE_META[selected.stage].tone}>
                        {STAGE_META[selected.stage].label}
                      </StatusPill>

                      <button
                        type="button"
                        onClick={() => handleCopyEmail(selected.prospectEmail)}
                        className="flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent px-2 py-1 text-[11px] text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white font-sans"
                      >
                        {copiedEmail ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                        <span>Copy Email</span>
                      </button>
                    </div>

                    <h4 className="text-base font-bold text-zinc-900 dark:text-white font-sans">{selected.prospectName ?? selected.prospectEmail}</h4>

                    <div className="space-y-1 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                      <div className="flex items-center gap-2">
                        <Mail size={12} className="text-zinc-500 shrink-0" />
                        <span className="truncate">{selected.prospectEmail}</span>
                      </div>
                      <div className="flex items-center gap-2 text-zinc-800 dark:text-zinc-300 pt-0.5">
                        <Clock size={12} className="text-sky-600 dark:text-sky-400 shrink-0" />
                        <span>Booked {new Date(selected.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent p-3 space-y-2 text-xs font-sans">
                    <div className="flex items-center justify-between font-sans">
                      <span className="text-zinc-600 dark:text-zinc-400 font-semibold">Email 1 Method</span>
                      <span className="font-mono text-zinc-900 dark:text-white capitalize">{sentViaLabel(selected.sentVia)}</span>
                    </div>
                    {selected.touchesTotal > 0 && (
                      <>
                        <div className="flex items-center justify-between font-sans pt-1">
                          <span className="text-zinc-600 dark:text-zinc-400 font-semibold">SMS Touches</span>
                          <span className="font-mono text-zinc-900 dark:text-white">{selected.touchesSent} / {selected.touchesTotal}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                          <div className="h-full bg-amber-500" style={{ width: `${(selected.touchesSent / selected.touchesTotal) * 100}%` }} />
                        </div>
                      </>
                    )}
                    {selected.callTime && (
                      <div className="flex items-center justify-between font-sans pt-1">
                        <span className="text-zinc-600 dark:text-zinc-400 font-semibold">Appointment Call Time</span>
                        <span className="font-mono text-zinc-900 dark:text-white">{new Date(selected.callTime).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                    )}
                  </div>

                  {selected.sendError && (() => {
                    const diagnosis = classifyRunError(selected.sendError);
                    return (
                      <div className="rounded-xl border border-rose-300 dark:border-rose-900/50 bg-rose-100 dark:bg-rose-950/20 p-3 font-sans">
                        <span className="block text-[10.5px] font-mono uppercase text-rose-700 dark:text-rose-400/80 mb-1">Email 1 didn&apos;t go out</span>
                        {diagnosis ? (
                          <>
                            <p className="text-xs font-semibold text-rose-900 dark:text-rose-300">{diagnosis.title}</p>
                            <p className="text-[11px] text-rose-800 dark:text-rose-300/90 mt-0.5">{diagnosis.explanation}</p>
                          </>
                        ) : (
                          <p className="text-[11px] text-rose-800 dark:text-rose-300/90">
                            This hit an unexpected error and didn&apos;t send.
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {selected.sentVia === "hybrid" && selected.personalizedIntro && (
                    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent p-3 space-y-1.5 text-xs font-sans">
                      <span className="flex items-center gap-1.5 text-[10.5px] font-mono text-zinc-500 uppercase">
                        <Sparkles size={11} /> AI-personalized intro
                      </span>
                      <p className="text-zinc-800 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed font-sans">{selected.personalizedIntro}</p>
                    </div>
                  )}

                  {selected.runId && (
                    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent overflow-hidden text-xs font-sans">
                      <button
                        type="button"
                        onClick={() => setShowRunActivity((p) => !p)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors"
                      >
                        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-300">
                          <SquishySkillBadge skill="pile-on" size={14} enabled={true} />
                          Run activity
                        </span>
                        <ChevronDown size={13} className={cn("text-zinc-500 transition-transform", showRunActivity && "rotate-180")} />
                      </button>
                      {showRunActivity && (
                        <div className="px-3 pb-3 pt-1 border-t border-zinc-200 dark:border-zinc-800/60">
                          <RunActivityPanel runId={selected.runId} />
                          <a
                            href={`/dashboard/runs/${selected.runId}`}
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
                        Zero speed-to-lead runs for this date.
                      </>
                    ) : (
                      "Select a date or lead from the list to inspect sequence details."
                    )}
                  </p>
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
                      onClick={() => handleUpdateSelectedDate(new Date(selectedDate.getTime() - 7 * 86400000))}
                      className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                      title="Previous Week"
                    >
                      <ChevronLeft size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={handleTodayClick}
                      className="text-[10.5px] px-1.5 py-0.5 rounded font-sans font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 cursor-pointer"
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateSelectedDate(new Date(selectedDate.getTime() + 7 * 86400000))}
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
                <span className="text-xs">No bookings on file.</span>
              </div>
            ) : (
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800/60 max-h-[580px] overflow-y-auto">
                {listDaysToRender.map(({ dateStr, dateObj, calls }) => {
                  const isSelectedDay = dateKey(selectedDate) === dateStr;

                  return (
                    <div key={dateStr} className="space-y-0 font-sans">
                      {/* Sticky Day Header */}
                      <div className="sticky top-0 z-10 flex items-center justify-between bg-zinc-100/95 dark:bg-zinc-900/95 backdrop-blur-xs px-4 py-1.5 border-b border-zinc-200/80 dark:border-zinc-800/80 text-[10.5px] font-mono font-bold uppercase tracking-wider text-zinc-500">
                        <span className="flex items-center gap-1.5">
                          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#ffcfd2] text-rose-950 dark:bg-rose-950/60 dark:text-rose-200 shrink-0">
                            <PhoneCall size={9} className="fill-current" />
                          </span>
                          {formatDayHeader(dateStr)}
                        </span>
                        <span className={cn("font-normal", calls.length > 0 ? "text-zinc-700 dark:text-zinc-300 font-bold" : "text-zinc-400")}>
                          {calls.length} booking{calls.length === 1 ? "" : "s"}
                        </span>
                      </div>

                      {/* Day Feed Entries */}
                      <div className="divide-y divide-zinc-200/60 dark:divide-zinc-800/40">
                        {calls.length > 0 ? (
                          calls.map((item) => {
                            const isSelected = selected?.id === item.id;
                            const isFailed = !!item.sendError;
                            const appointmentHour = formatTimeBadge(item.callTime ?? item.createdAt);

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
                                  isFailed && "bg-[#ffcfd2]/40 dark:bg-rose-950/30",
                                  isSelected
                                    ? "bg-zinc-200/80 dark:bg-zinc-800 text-zinc-900 dark:text-white"
                                    : "bg-white dark:bg-transparent hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50"
                                )}
                              >
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-zinc-950 bg-[#ffcfd2] px-1.5 py-0.5 rounded shrink-0 border-0">
                                    <PhoneCall size={9} className="fill-current text-rose-950" />
                                    {appointmentHour}
                                  </span>

                                  <div className="min-w-0 space-y-0.5">
                                    <span className="truncate text-xs font-bold text-zinc-900 dark:text-white block font-sans">
                                      {item.prospectName ?? item.prospectEmail}
                                    </span>
                                    <span className="text-[11px] text-zinc-500 font-mono block truncate">
                                      {item.prospectEmail}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  {item.touchesTotal > 0 && (
                                    <div className="hidden sm:flex flex-col items-end gap-1 w-20">
                                      <span className="text-[9.5px] font-mono text-zinc-500 font-bold">
                                        {item.touchesSent}/{item.touchesTotal} SMS
                                      </span>
                                      <div className="h-1 w-full bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-amber-500"
                                          style={{ width: `${(item.touchesSent / item.touchesTotal) * 100}%` }}
                                        />
                                      </div>
                                    </div>
                                  )}

                                  <StatusPill tone={STAGE_META[item.stage].tone} className="shrink-0">
                                    {STAGE_META[item.stage].label}
                                  </StatusPill>

                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCopyEmail(item.prospectEmail);
                                    }}
                                    className="p-1 rounded-md text-zinc-400 hover:text-zinc-800 dark:hover:text-white transition-colors"
                                  >
                                    {copiedEmail ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                  </button>
                                </div>
                              </button>
                            );
                          })
                        ) : (
                          /* Explicit empty day row when 0 bookings took place */
                          <button
                            type="button"
                            onClick={() => {
                              handleUpdateSelectedDate(dateObj);
                              setSelectedId(null);
                            }}
                            className={cn(
                              "w-full px-4 py-2.5 text-left text-xs font-mono transition-colors cursor-pointer flex items-center justify-between border-0",
                              isSelectedDay
                                ? "bg-zinc-200/60 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 font-semibold"
                                : "text-zinc-400 dark:text-zinc-600 hover:bg-zinc-100/60 dark:hover:bg-zinc-900/40"
                            )}
                          >
                            <span className="flex items-center gap-1.5">
                              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-400 shrink-0">
                                <PhoneCall size={8} />
                              </span>
                              No speed-to-lead runs
                            </span>
                            <span className="text-[10px] text-zinc-400 dark:text-zinc-600">0 / 0</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Collapsible Upcoming Days Section (Only in Full Month mode when future bookings exist) */}
                {listScope === "month" && monthDaysSmart.future.length > 0 && (
                  <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 font-sans">
                    <button
                      type="button"
                      onClick={() => setShowUpcomingInMonth((p) => !p)}
                      className="flex w-full items-center justify-between px-4 py-2 text-[11px] font-mono font-bold text-zinc-500 uppercase tracking-wider hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer font-sans"
                    >
                      <span>Upcoming Runs in {monthName} ({monthDaysSmart.future.reduce((acc, d) => acc + d.calls.length, 0)})</span>
                      <ChevronDown size={13} className={cn("transition-transform", showUpcomingInMonth && "rotate-180")} />
                    </button>

                    {showUpcomingInMonth && (
                      <div className="divide-y divide-zinc-200 dark:divide-zinc-800/60 font-sans">
                        {monthDaysSmart.future.map(({ dateStr, calls }) => (
                          <div key={dateStr} className="space-y-0 font-sans">
                            <div className="bg-zinc-100/90 dark:bg-zinc-900/90 px-4 py-1.5 border-b border-zinc-200/80 dark:border-zinc-800/80 text-[10.5px] font-mono font-bold uppercase tracking-wider text-zinc-500 flex justify-between">
                              <span className="flex items-center gap-1.5">
                                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300 shrink-0">
                                  <PhoneCall size={9} className="fill-current" />
                                </span>
                                {formatDayHeader(dateStr)}
                              </span>
                              <span>{calls.length} runs</span>
                            </div>
                            <div className="divide-y divide-zinc-200/60 dark:divide-zinc-800/40">
                              {calls.map((item) => (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedId(item.id);
                                    handleUpdateSelectedDate(new Date(item.createdAt));
                                  }}
                                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50 cursor-pointer font-sans border-0"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-zinc-950 bg-[#ffcfd2] px-1.5 py-0.5 rounded shrink-0">
                                      <PhoneCall size={9} className="fill-current text-rose-950" />
                                      {formatTimeBadge(item.callTime ?? item.createdAt)}
                                    </span>
                                    <span className="truncate text-xs font-bold text-zinc-900 dark:text-white">
                                      {item.prospectName ?? item.prospectEmail}
                                    </span>
                                  </div>
                                  <StatusPill tone={STAGE_META[item.stage].tone}>
                                    {STAGE_META[item.stage].label}
                                  </StatusPill>
                                </button>
                              ))}
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
            {selected ? (
              <>
                <div className="space-y-2 border-b border-zinc-200 dark:border-zinc-800 pb-3 font-sans">
                  <div className="flex items-center justify-between font-sans flex-wrap gap-1">
                    <StatusPill tone={STAGE_META[selected.stage].tone}>
                      {STAGE_META[selected.stage].label}
                    </StatusPill>

                    <button
                      type="button"
                      onClick={() => handleCopyEmail(selected.prospectEmail)}
                      className="flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent px-2 py-1 text-[11px] text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white font-sans"
                    >
                      {copiedEmail ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                      <span>Copy Email</span>
                    </button>
                  </div>

                  <h4 className="text-base font-bold text-zinc-900 dark:text-white font-sans">{selected.prospectName ?? selected.prospectEmail}</h4>

                  <div className="space-y-1 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                    <div className="flex items-center gap-2">
                      <Mail size={12} className="text-zinc-500 shrink-0" />
                      <span className="truncate">{selected.prospectEmail}</span>
                    </div>
                    <div className="flex items-center gap-2 text-zinc-800 dark:text-zinc-300 pt-0.5">
                      <Clock size={12} className="text-sky-600 dark:text-sky-400 shrink-0" />
                      <span>Booked {new Date(selected.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent p-3 space-y-2 text-xs font-sans">
                  <div className="flex items-center justify-between font-sans">
                    <span className="text-zinc-600 dark:text-zinc-400 font-semibold">Email 1 Method</span>
                    <span className="font-mono text-zinc-900 dark:text-white capitalize">{sentViaLabel(selected.sentVia)}</span>
                  </div>
                  {selected.touchesTotal > 0 && (
                    <>
                      <div className="flex items-center justify-between font-sans pt-1">
                        <span className="text-zinc-600 dark:text-zinc-400 font-semibold">SMS Touches</span>
                        <span className="font-mono text-zinc-900 dark:text-white">{selected.touchesSent} / {selected.touchesTotal}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                        <div className="h-full bg-amber-500" style={{ width: `${(selected.touchesSent / selected.touchesTotal) * 100}%` }} />
                      </div>
                    </>
                  )}
                  {selected.callTime && (
                    <div className="flex items-center justify-between font-sans pt-1">
                      <span className="text-zinc-600 dark:text-zinc-400 font-semibold">Appointment Call Time</span>
                      <span className="font-mono text-zinc-900 dark:text-white">{new Date(selected.callTime).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  )}
                </div>

                {selected.sendError && (() => {
                  const diagnosis = classifyRunError(selected.sendError);
                  return (
                    <div className="rounded-xl border border-rose-300 dark:border-rose-900/50 bg-rose-100 dark:bg-rose-950/20 p-3 font-sans">
                      <span className="block text-[10.5px] font-mono uppercase text-rose-700 dark:text-rose-400/80 mb-1">Email 1 didn&apos;t go out</span>
                      {diagnosis ? (
                        <>
                          <p className="text-xs font-semibold text-rose-900 dark:text-rose-300">{diagnosis.title}</p>
                          <p className="text-[11px] text-rose-800 dark:text-rose-300/90 mt-0.5">{diagnosis.explanation}</p>
                        </>
                      ) : (
                        <p className="text-[11px] text-rose-800 dark:text-rose-300/90">
                          This hit an unexpected error and didn&apos;t send.
                        </p>
                      )}
                    </div>
                  );
                })()}

                {selected.sentVia === "hybrid" && selected.personalizedIntro && (
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent p-3 space-y-1.5 text-xs font-sans">
                    <span className="flex items-center gap-1.5 text-[10.5px] font-mono text-zinc-500 uppercase">
                      <Sparkles size={11} /> AI-personalized intro
                    </span>
                    <p className="text-zinc-800 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed font-sans">{selected.personalizedIntro}</p>
                  </div>
                )}

                {selected.runId && (
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent overflow-hidden text-xs font-sans">
                    <button
                      type="button"
                      onClick={() => setShowRunActivity((p) => !p)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors"
                    >
                      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-300">
                        <SquishySkillBadge skill="pile-on" size={14} enabled={true} />
                        Run activity
                      </span>
                      <ChevronDown size={13} className={cn("text-zinc-500 transition-transform", showRunActivity && "rotate-180")} />
                    </button>
                    {showRunActivity && (
                      <div className="px-3 pb-3 pt-1 border-t border-zinc-200 dark:border-zinc-800/60">
                        <RunActivityPanel runId={selected.runId} />
                        <a
                          href={`/dashboard/runs/${selected.runId}`}
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
                      Zero speed-to-lead runs for this date.
                    </>
                  ) : (
                    "Select a date or lead from the list to inspect sequence details."
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