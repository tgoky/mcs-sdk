"use client";

// src/app/dashboard/engagements/[id]/win-back-pipeline.tsx

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { 
  ChevronLeft, 
  ChevronRight, 
  Search, 
  Mail, 
  CalendarX2, 
  ExternalLink, 
  ChevronDown, 
  Copy, 
  Check, 
  Clock, 
  RefreshCw, 
  CalendarDays,
  Link2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { dateKey } from "@/app/dashboard/runs/[id]/_shared/calendar-grid";
import { RunActivityPanel } from "@/app/dashboard/runs/[id]/_shared/run-activity-panel";
import { exitReasonLabel } from "@/lib/copy";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import type { WinBackPipelineItem, WinBackEnrollmentStatus } from "@/app/api/engagements/[id]/win-back-pipeline/route";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";
type ListScope = "week" | "month";

const STATUS_META: Record<WinBackEnrollmentStatus, { label: string; tone: Tone }> = {
  active: { label: "Active in cadence", tone: "warning" },
  rebooked: { label: "Exited — rebooked", tone: "success" },
  reply_exited: { label: "Exited — replied", tone: "info" },
  manual_override: { label: "Exited — manual override", tone: "neutral" },
  lost: { label: "Exited — window elapsed", tone: "neutral" },
  corrected: { label: "Exited — outcome corrected", tone: "neutral" },
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
      success: "bg-emerald-100 text-emerald-950 border border-emerald-300/80 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800/80",
      danger: "bg-[#ffcfd2] text-rose-950 border border-rose-300 dark:bg-rose-950/80 dark:text-rose-200 dark:border-rose-800/80",
      // HIGH-CONTRAST #aab8d8 (LIGHT) & #c5b7ea (DARK) STYLING WITHOUT BACKGROUND PILL OR GLOWING DOT
      warning: "bg-transparent text-[#424d77] dark:text-[#c5b7ea] font-bold border-0 shadow-none p-0",
      info: "bg-sky-100 text-sky-950 border border-sky-300/80 dark:bg-sky-950/70 dark:text-sky-300 dark:border-sky-800/80",
      neutral: "bg-zinc-200/80 text-zinc-900 border border-zinc-300/60 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700/60",
    }[tone] ?? "bg-zinc-200/80 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-300";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-tight transition-colors",
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

export function WinBackPipeline({ engagementId }: { engagementId: string }) {
  const [listScope, setListScope] = useState<ListScope>("week");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [items, setItems] = useState<WinBackPipelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [showRunActivity, setShowRunActivity] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthString = `${year}-${String(month + 1).padStart(2, "0")}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/win-back-pipeline`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Failed to load pipeline.");
      const body = await res.json();
      setItems(body.items ?? []);
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

  const handleCopyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const filtered = useMemo(() => {
    if (!filterText.trim()) return items;
    const q = filterText.toLowerCase();
    return items.filter((i) => (i.prospectName ?? i.prospectEmail).toLowerCase().includes(q));
  }, [items, filterText]);

  const itemsByDate = useMemo(() => {
    const map: Record<string, WinBackPipelineItem[]> = {};
    for (const item of filtered) {
      const k = dateKey(new Date(item.enrolledAt));
      (map[k] ??= []).push(item);
    }
    return map;
  }, [filtered]);

  const todayK = dateKey(new Date());

  const currentWeekDays = useMemo(() => {
    const anchor = selectedDate || new Date();
    const d = new Date(anchor);
    const day = d.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diffToMon);

    const days: { dateStr: string; dateObj: Date; calls: WinBackPipelineItem[] }[] = [];
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

  const monthDaysSmart = useMemo(() => {
    const days: { dateStr: string; dateObj: Date; calls: WinBackPipelineItem[]; isFuture: boolean }[] = [];
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

  const monthName = currentDate.toLocaleString("default", { month: "long" });
  const activeCount = filtered.filter((i) => i.status === "active").length;

  return (
    <div className="flex flex-col gap-3 font-sans antialiased">
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
        </div>

        {/* PUSHED TO EXTREME RIGHT: UNCOLORED TEXT COUNTER + SYNC BUTTON */}
        <div className="flex items-center gap-3 font-sans">
          {!loading && (
            <span className="text-xs font-mono font-semibold text-zinc-600 dark:text-zinc-400">
              {activeCount} active in recovery
            </span>
          )}

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
        <div className="rounded-xl border border-rose-300 dark:border-rose-800/50 bg-rose-100 dark:bg-rose-950/20 px-3 py-2 text-xs text-rose-800 dark:text-rose-300 font-sans">{error}</div>
      )}

      {/* SMART SPLIT-PANE RECOVERY FEED */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 font-sans">
        {/* LEFT 7 COLUMNS: CHRONOLOGICAL RECOVERY FEED */}
        <div className="lg:col-span-7 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 shadow-xl font-sans flex flex-col">
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
              <span className="text-xs">No Win-Back enrollments on file.</span>
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
                        {calls.length} enrollment{calls.length === 1 ? "" : "s"}
                      </span>
                    </div>

                    {/* Day Feed Entries */}
                    <div className="divide-y divide-zinc-200/60 dark:divide-zinc-800/40">
                      {calls.length > 0 ? (
                        calls.map((item) => {
                          const isSelected = selected?.id === item.id;
                          const isActive = item.status === "active";
                          const enrollmentTime = formatTimeBadge(item.enrolledAt);

                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setSelectedId(item.id);
                                handleUpdateSelectedDate(new Date(item.enrolledAt));
                              }}
                              className={cn(
                                "flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors cursor-pointer font-sans border-0",
                                // ACCENT COLOR ENHANCEMENT: #aab8d8 FOR LIGHT MODE, #c5b7ea FOR DARK MODE
                                isActive && !isSelected && "bg-[#aab8d8]/30 dark:bg-[#c5b7ea]/20",
                                isSelected && "bg-[#aab8d8]/50 dark:bg-[#c5b7ea]/35 ring-1 ring-[#aab8d8] dark:ring-[#c5b7ea]",
                                !isActive && !isSelected && "bg-white dark:bg-transparent hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50"
                              )}
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-zinc-950 bg-[#aab8d8] dark:bg-[#c5b7ea] px-1.5 py-0.5 rounded shrink-0">
                                  <Clock size={9} />
                                  {enrollmentTime}
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
                                <span className="text-[9.5px] font-mono text-zinc-600 dark:text-zinc-400 font-bold">
                                  {item.touchesSent}/{item.touchesTotal} Touches
                                </span>

                                {/* SQUISHY SKILL BADGE ON THE LEFT FEED */}
                                <SquishySkillBadge skill="win-back" size={18} enabled={true} />
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        /* Explicit empty day row */
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
                          <span>No recovery enrollments</span>
                          <span className="text-[10px] text-zinc-400 dark:text-zinc-600">0 / 0</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT 5 COLUMNS: PERSISTENT RECOVERY INSPECTOR PANEL */}
        <div className="lg:col-span-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 p-4 space-y-4 shadow-xl font-sans">
          {selected ? (
            <>
              <div className="space-y-2 border-b border-zinc-200 dark:border-zinc-800 pb-3 font-sans">
                {/* MOVED STATUS TEXT TO THE RIGHT NEXT TO SQUISHY SKILL BADGE, NO BACKGROUND FILL */}
                <div className="flex items-center justify-between font-sans flex-wrap gap-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold">
                    Prospect Recovery
                  </span>
                  <div className="flex items-center gap-2">
                    <StatusPill tone={STATUS_META[selected.status].tone}>
                      {STATUS_META[selected.status].label}
                    </StatusPill>
                    <SquishySkillBadge skill="win-back" size={16} enabled={true} />
                  </div>
                </div>

                <h4 className="text-base font-bold text-zinc-900 dark:text-white font-sans">{selected.prospectName ?? selected.prospectEmail}</h4>

                <div className="space-y-1 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                  <div className="flex items-center gap-2">
                    <Mail size={12} className="text-zinc-500 shrink-0" />
                    <span className="truncate">{selected.prospectEmail}</span>
                  </div>
                  <div className="flex items-center gap-2 text-zinc-800 dark:text-zinc-300 pt-0.5">
                    <Clock size={12} className="text-zinc-600 dark:text-zinc-300 shrink-0" />
                    <span>Enrolled {new Date(selected.enrolledAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent p-3 space-y-2 text-xs font-sans">
                <div className="flex items-center justify-between font-sans">
                  <span className="text-zinc-600 dark:text-zinc-400 font-semibold">Touches Sent</span>
                  <span className="font-mono text-zinc-900 dark:text-white">{selected.touchesSent} / {selected.touchesTotal}</span>
                </div>
                <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                  <div className="h-full bg-[#aab8d8] dark:bg-[#c5b7ea]" style={{ width: `${selected.touchesTotal ? (selected.touchesSent / selected.touchesTotal) * 100 : 0}%` }} />
                </div>
                <div className="flex items-center justify-between font-sans pt-1">
                  <span className="text-zinc-600 dark:text-zinc-400 font-semibold">Recovery Window</span>
                  <span className="font-mono text-zinc-900 dark:text-white">{selected.recoveryWindowDays} days</span>
                </div>
                {selected.status === "active" && selected.nextTouchAt && (
                  <div className="flex items-center justify-between font-sans pt-1">
                    <span className="text-zinc-600 dark:text-zinc-400 font-semibold">Next Touch Due</span>
                    <span className="font-mono text-zinc-900 dark:text-zinc-200 font-bold">{new Date(selected.nextTouchAt).toLocaleDateString(undefined, { month: "long", day: "numeric" })}</span>
                  </div>
                )}
                {selected.exitedAt && (
                  <div className="flex items-center justify-between font-sans pt-1">
                    <span className="text-zinc-600 dark:text-zinc-400 font-semibold">Exited Cadence</span>
                    <span className="font-mono text-zinc-900 dark:text-white">
                      {new Date(selected.exitedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      {selected.exitReason ? ` · ${exitReasonLabel(selected.exitReason)}` : ""}
                    </span>
                  </div>
                )}
              </div>

              {selected.freshRescheduleLink && (
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent p-3 space-y-2 text-xs font-sans">
                  <span className="text-[10.5px] font-mono text-zinc-500 uppercase block font-semibold flex items-center gap-1.5">
                    <Link2 size={12} /> Single-use Reschedule Link
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={selected.freshRescheduleLink}
                      className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 py-1 px-2 font-mono text-[11px] text-zinc-700 dark:text-zinc-300 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopyLink(selected.freshRescheduleLink!)}
                      className="flex items-center gap-1 shrink-0 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[#aab8d8] dark:bg-[#c5b7ea] text-zinc-950 px-2 py-1 text-[11px] hover:opacity-90 cursor-pointer font-sans font-bold"
                    >
                      {copiedLink ? <Check size={12} className="text-emerald-950" /> : <Copy size={12} />}
                      <span>{copiedLink ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* CLEAN RUN ACTIVITY PANEL IN LIGHT MODE - NO DARK BOX OVERFLOW */}
              {selected.runId && (
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 text-zinc-900 dark:text-zinc-100 overflow-hidden text-xs font-sans">
                  <button
                    type="button"
                    onClick={() => setShowRunActivity((p) => !p)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors"
                  >
                    <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-300">
                      <SquishySkillBadge skill="win-back" size={14} enabled={true} />
                      Run activity
                    </span>
                    <ChevronDown size={13} className={cn("text-zinc-500 transition-transform", showRunActivity && "rotate-180")} />
                  </button>

                  {showRunActivity && (
                    <div className={cn(
                      "px-3 pb-3 pt-2 border-t border-zinc-200 dark:border-zinc-800/60 font-sans text-xs rounded-b-xl transition-colors",
                      "bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100",
                      "[html:not(.dark)_&_*]:!bg-zinc-100/90 [html:not(.dark)_&_*]:!text-zinc-900 [html:not(.dark)_&_*]:!border-zinc-200"
                    )}>
                      <RunActivityPanel runId={selected.runId} />
                      <a
                        href={`/dashboard/runs/${selected.runId}`}
                        className="mt-3 inline-flex items-center gap-1.5 text-[10.5px] text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors font-medium"
                      >
                        <span>Open full run page</span>
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
                    Zero recovery enrollments for this date.
                  </>
                ) : (
                  "Select an enrolled lead to inspect sequence details."
                )}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}