"use client";

// src/app/dashboard/engagements/[id]/master-roster-calendar.tsx

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  List,
  Search,
  RefreshCw,
  Check,
  Copy,
  Phone,
  PhoneCall,
  Mail,
  ExternalLink,
  Building2,
  CalendarDays,
  ChevronDown,
  Sparkles,
  CalendarX2,
  UserCheck,
  UserX,
  CalendarClock,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { skillName } from "@/lib/copy";
import { getDaysInMonthGrid, dateKey, timeStr } from "@/app/dashboard/runs/[id]/_shared/calendar-grid";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import { RunActivityPanel } from "@/app/dashboard/runs/[id]/_shared/run-activity-panel";
import { StatusPill } from "@/app/dashboard/runs/[id]/_shared/status-pill";
import type { RosterEntry } from "@/app/api/engagements/[id]/roster/route";
import type { PileOnPipelineItem } from "@/app/api/engagements/[id]/pile-on-pipeline/route";
import type { WinBackPipelineItem } from "@/app/api/engagements/[id]/win-back-pipeline/route";
import type { ActivityEvent, ActivitySkill } from "@/app/api/engagements/[id]/activity/route";

const TONE_TO_SEVERITY_LABEL: Record<string, string> = {
  danger: "High severity",
  warning: "Medium severity",
  info: "Low severity",
  neutral: "Clean",
};

// Real outcome, sourced from briefOutcomeLog via the roster API (see that
// route's comment on the actualOutcome fix) — not a guess, not a status
// that was quietly assumed once a date passed.
const OUTCOME_META: Record<"showed" | "no_show" | "rescheduled" | "cancelled", { label: string; tone: "success" | "danger" | "warning" | "neutral" }> = {
  showed: { label: "Showed", tone: "success" },
  no_show: { label: "No-show", tone: "danger" },
  rescheduled: { label: "Rescheduled", tone: "warning" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

const ACTIVITY_SKILL_LABEL: Record<ActivitySkill, string> = {
  "pile-on": skillName("pile-on"),
  "win-back": skillName("win-back"),
  "leak-map": skillName("leak-map"),
};

type ViewMode = "month" | "day" | "list";
type ListScope = "week" | "month";

const HOURS = Array.from({ length: 15 }, (_, i) => i + 8);

interface StreamState<T> {
  data: T[];
  loading: boolean;
  fetched: boolean;
  error: string | null;
}

function emptyStream<T>(): StreamState<T> {
  return { data: [], loading: false, fetched: false, error: null };
}

// Fix: local filled-pill StatusPill removed — see _shared/status-pill.tsx.

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

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-rose-300 dark:border-rose-800/50 bg-rose-100 dark:bg-rose-950/20 px-4 py-2.5 text-xs text-rose-800 dark:text-rose-300 font-sans">
      <span>{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg border border-rose-300 dark:border-rose-700 bg-rose-200/50 dark:bg-rose-900/50 px-2.5 py-1 font-semibold text-rose-900 dark:text-rose-200 hover:bg-rose-300/50 dark:hover:bg-rose-800 cursor-pointer font-sans"
      >
        Retry
      </button>
    </div>
  );
}

type EnrichedEntry = RosterEntry & {
  pileOnData: PileOnPipelineItem | null;
  winBackData: WinBackPipelineItem | null;
};

export function MasterRosterCalendar({ engagementId }: { engagementId: string }) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [inspectionType, setInspectionType] = useState<"call" | "activity">("call");
  
  const [mode, setMode] = useState<ViewMode>("month");
  const [listScope, setListScope] = useState<ListScope>("week");
  const [filterText, setFilterText] = useState("");
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeTab, setActiveTab] = useState<"brief" | "pile_on" | "win_back">("brief");
  const [showUpcomingInMonth, setShowUpcomingInMonth] = useState(false);

  // Per-Stream State
  const [roster, setRoster] = useState<StreamState<RosterEntry>>(emptyStream());
  const [pileOn, setPileOn] = useState<StreamState<PileOnPipelineItem>>(emptyStream());
  const [winBack, setWinBack] = useState<StreamState<WinBackPipelineItem>>(emptyStream());
  const [activity, setActivity] = useState<StreamState<ActivityEvent>>(emptyStream());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthString = `${year}-${String(month + 1).padStart(2, "0")}`;

  // Primary Fetch: Roster
  const fetchRoster = useCallback(async () => {
    setRoster((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch(`/api/engagements/${engagementId}/roster?month=${monthString}`);
      if (!res.ok) throw new Error(`Roster fetch failed: ${res.status}`);
      const data = await res.json();
      setRoster({ data: data.entries ?? [], loading: false, fetched: true, error: null });
    } catch (err) {
      setRoster({ data: [], loading: false, fetched: true, error: err instanceof Error ? err.message : "Failed to load roster" });
    }
  }, [engagementId, monthString]);

  // Primary Fetch: Activity
  const fetchActivity = useCallback(async () => {
    setActivity((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch(`/api/engagements/${engagementId}/activity?month=${monthString}`);
      if (!res.ok) throw new Error(`Activity fetch failed: ${res.status}`);
      const data = await res.json();
      setActivity({ data: data.events ?? [], loading: false, fetched: true, error: null });
    } catch (err) {
      setActivity({ data: [], loading: false, fetched: true, error: err instanceof Error ? err.message : "Failed to load skill activity" });
    }
  }, [engagementId, monthString]);

  // Lazy Fetch: Pile-On
  const fetchPileOn = useCallback(async () => {
    if (pileOn.fetched || pileOn.loading) return;
    setPileOn((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch(`/api/engagements/${engagementId}/pile-on-pipeline`);
      if (!res.ok) throw new Error(`Pile-on fetch failed: ${res.status}`);
      const data = await res.json();
      setPileOn({ data: data.items ?? [], loading: false, fetched: true, error: null });
    } catch (err) {
      setPileOn({ data: [], loading: false, fetched: true, error: err instanceof Error ? err.message : "Failed to load pile-on data" });
    }
  }, [engagementId, pileOn.fetched, pileOn.loading]);

  // Lazy Fetch: Win-Back
  const fetchWinBack = useCallback(async () => {
    if (winBack.fetched || winBack.loading) return;
    setWinBack((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch(`/api/engagements/${engagementId}/win-back-pipeline`);
      if (!res.ok) throw new Error(`Win-back fetch failed: ${res.status}`);
      const data = await res.json();
      setWinBack({ data: data.items ?? [], loading: false, fetched: true, error: null });
    } catch (err) {
      setWinBack({ data: [], loading: false, fetched: true, error: err instanceof Error ? err.message : "Failed to load win-back data" });
    }
  }, [engagementId, winBack.fetched, winBack.loading]);

  // Sync Month Changes & Mode Switches
  useEffect(() => {
    fetchRoster();
    fetchActivity();
    setPileOn(emptyStream());
    setWinBack(emptyStream());
  }, [fetchRoster, fetchActivity]);

  useEffect(() => {
    if (mode === "day" || mode === "list") {
      fetchPileOn();
      fetchWinBack();
    }
  }, [mode, fetchPileOn, fetchWinBack]);

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

  // Client-Side Indexes & Joins
  const pileOnByBookingId = useMemo(
    () => new Map(pileOn.data.map((p) => [p.bookingId, p])),
    [pileOn.data]
  );

  const winBackByEmail = useMemo(
    () => new Map(winBack.data.map((w) => [w.prospectEmail.toLowerCase(), w])),
    [winBack.data]
  );

  const enrichedEntries = useMemo<EnrichedEntry[]>(() => {
    return roster.data.map((entry) => ({
      ...entry,
      pileOnData: pileOnByBookingId.get(entry.externalCallId) ?? null,
      winBackData: entry.prospectEmail
        ? winBackByEmail.get(entry.prospectEmail.toLowerCase()) ?? null
        : null,
    }));
  }, [roster.data, pileOnByBookingId, winBackByEmail]);

  const filteredEntries = useMemo(() => {
    if (!filterText.trim()) return enrichedEntries;
    const q = filterText.toLowerCase();
    return enrichedEntries.filter(
      (e) =>
        (e.prospectName ?? "").toLowerCase().includes(q) ||
        (e.prospectEmail ?? "").toLowerCase().includes(q) ||
        (e.prospectPhone ?? "").toLowerCase().includes(q)
    );
  }, [enrichedEntries, filterText]);

  const entriesByDate = useMemo(() => {
    const map: Record<string, EnrichedEntry[]> = {};
    for (const entry of filteredEntries) {
      const k = dateKey(new Date(entry.callTime));
      (map[k] ??= []).push(entry);
    }
    return map;
  }, [filteredEntries]);

  const filteredActivity = useMemo(() => {
    if (!filterText.trim()) return activity.data;
    const q = filterText.toLowerCase();
    return activity.data.filter(
      (e) => (e.prospectName ?? "").toLowerCase().includes(q) || (e.prospectEmail ?? "").toLowerCase().includes(q)
    );
  }, [activity.data, filterText]);

  const activityByDate = useMemo(() => {
    const map: Record<string, ActivityEvent[]> = {};
    for (const ev of filteredActivity) {
      const k = dateKey(new Date(ev.occurredAt));
      (map[k] ??= []).push(ev);
    }
    return map;
  }, [filteredActivity]);

  const todayK = dateKey(new Date());

  // SMART WEEK GENERATOR: 7 Days centered on active week (Mon -> Sun)
  const currentWeekDays = useMemo(() => {
    const anchor = selectedDate || new Date();
    const d = new Date(anchor);
    const day = d.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diffToMon);

    const days: { dateStr: string; dateObj: Date; calls: EnrichedEntry[]; activities: ActivityEvent[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const dateObj = new Date(monday);
      dateObj.setDate(monday.getDate() + i);
      const k = dateKey(dateObj);
      const calls = entriesByDate[k] ?? [];
      const activities = activityByDate[k] ?? [];

      if (k <= todayK || calls.length > 0 || activities.length > 0) {
        days.push({ dateStr: k, dateObj, calls, activities });
      }
    }
    return days.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
  }, [selectedDate, entriesByDate, activityByDate, todayK]);

  // SMART MONTH FEED: Today & Past first (descending), Future days separate
  const monthDaysSmart = useMemo(() => {
    const days: { dateStr: string; dateObj: Date; calls: EnrichedEntry[]; activities: ActivityEvent[]; isFuture: boolean }[] = [];
    const numDays = new Date(year, month + 1, 0).getDate();

    for (let d = 1; d <= numDays; d++) {
      const dateObj = new Date(year, month, d);
      const k = dateKey(dateObj);
      const calls = entriesByDate[k] ?? [];
      const activities = activityByDate[k] ?? [];
      const isFuture = k > todayK;
      days.push({ dateStr: k, dateObj, calls, activities, isFuture });
    }

    const pastAndToday = days
      .filter((d) => !d.isFuture)
      .sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());

    const future = days
      .filter((d) => d.isFuture && (d.calls.length > 0 || d.activities.length > 0))
      .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

    return { pastAndToday, future };
  }, [year, month, entriesByDate, activityByDate, todayK]);

  const listDaysToRender = useMemo(() => {
    if (listScope === "week") {
      return currentWeekDays;
    }
    return monthDaysSmart.pastAndToday;
  }, [listScope, currentWeekDays, monthDaysSmart]);

  const dayMetrics = useMemo(() => {
    const metrics: Record<string, {
      totalCalls: number;
      pileOnActive: number;
      winBackActive: number;
      briefDelivered: number;
      activityBySkill: Record<ActivitySkill, number>;
    }> = {};

    const ensure = (k: string) => {
      if (!metrics[k]) {
        metrics[k] = {
          totalCalls: 0,
          pileOnActive: 0,
          winBackActive: 0,
          briefDelivered: 0,
          activityBySkill: { "pile-on": 0, "win-back": 0, "leak-map": 0 },
        };
      }
      return metrics[k];
    };

    for (const entry of filteredEntries) {
      const k = dateKey(new Date(entry.callTime));
      const m = ensure(k);
      m.totalCalls++;
      if (entry.pileOnData) m.pileOnActive++;
      if (entry.winBackData?.status === "active") m.winBackActive++;
      if (entry.status === "brief_delivered") m.briefDelivered++;
    }

    for (const ev of filteredActivity) {
      const k = dateKey(new Date(ev.occurredAt));
      ensure(k).activityBySkill[ev.skill]++;
    }

    return metrics;
  }, [filteredEntries, filteredActivity]);

  const EMPTY_METRIC = { totalCalls: 0, pileOnActive: 0, winBackActive: 0, briefDelivered: 0, activityBySkill: { "pile-on": 0, "win-back": 0, "leak-map": 0 } as Record<ActivitySkill, number> };

  const selectedDayKey = dateKey(selectedDate);
  const selectedDayEntries = entriesByDate[selectedDayKey] ?? [];
  const selectedDayActivity = activityByDate[selectedDayKey] ?? [];
  const selectedDayMetric = dayMetrics[selectedDayKey] ?? EMPTY_METRIC;

  useEffect(() => {
    if (selectedDayEntries.length > 0) {
      if (!selectedEntryId || !selectedDayEntries.some((e) => e.id === selectedEntryId)) {
        setSelectedEntryId(selectedDayEntries[0].id);
        setInspectionType("call");
      }
    } else if (selectedDayActivity.length > 0) {
      if (!selectedActivityId || !selectedDayActivity.some((a) => a.id === selectedActivityId)) {
        setSelectedActivityId(selectedDayActivity[0].id);
        setInspectionType("activity");
      }
    } else {
      setSelectedEntryId(null);
      setSelectedActivityId(null);
    }
  }, [selectedDayKey, selectedDayEntries, selectedDayActivity, selectedEntryId, selectedActivityId]);

  const selectedEntry = useMemo(
    () => filteredEntries.find((e) => e.id === selectedEntryId) ?? selectedDayEntries[0] ?? null,
    [filteredEntries, selectedEntryId, selectedDayEntries]
  );

  const selectedActivity = useMemo(
    () => filteredActivity.find((a) => a.id === selectedActivityId) ?? selectedDayActivity[0] ?? null,
    [filteredActivity, selectedActivityId, selectedDayActivity]
  );

  const gridDays = useMemo(() => getDaysInMonthGrid(year, month), [year, month]);
  const monthName = currentDate.toLocaleString("default", { month: "long" });

  const handleCopyText = (text: string, type: "email" | "link") => {
    navigator.clipboard.writeText(text);
    if (type === "email") {
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    } else {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  // Outcome logging — the master roster is the one place meant to show
  // every booking regardless of which skills are enabled, so this hits
  // the general engagement-level endpoint (not the Pre-Call-Read-specific
  // one) and doesn't require any particular skill to have already
  // processed the call. Keyed by externalCallId since that's the roster's
  // own ground-truth booking id — the same id every skill's own tables
  // (briefedCallsLog, pileOnSendLog, briefOutcomeLog) key on.
  const [outcomeSubmittingId, setOutcomeSubmittingId] = useState<string | null>(null);
  const [outcomeError, setOutcomeError] = useState<string | null>(null);
  const handleLogOutcome = async (entry: EnrichedEntry, outcome: "showed" | "no_show" | "rescheduled") => {
    if (outcomeSubmittingId) return;
    setOutcomeSubmittingId(entry.externalCallId);
    setOutcomeError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/bookings/${entry.externalCallId}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to log outcome.");
      }
      await fetchRoster();
    } catch (err) {
      setOutcomeError(err instanceof Error ? err.message : "Failed to log outcome.");
    } finally {
      setOutcomeSubmittingId(null);
    }
  };

  return (
    <div className="space-y-3 font-sans antialiased">
      {/* Explicit Error Banners */}
      {roster.error && <ErrorBanner message={roster.error} onRetry={fetchRoster} />}
      {pileOn.error && (mode === "day" || mode === "list") && (
        <ErrorBanner message={pileOn.error} onRetry={fetchPileOn} />
      )}
      {winBack.error && (mode === "day" || mode === "list") && (
        <ErrorBanner message={winBack.error} onRetry={fetchWinBack} />
      )}
      {activity.error && <ErrorBanner message={activity.error} onRetry={fetchActivity} />}

      {/* Toolbar & View Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 p-2 shadow-sm font-sans">
        <div className="flex items-center gap-2">
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

          <div className="relative w-64">
            <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-400 dark:text-zinc-500" />
            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Search bookings, emails, or phone..."
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 py-1.5 pl-8 pr-2.5 text-xs text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:border-zinc-400 dark:focus:border-zinc-700 focus:outline-none font-sans"
            />
          </div>

          <button
            type="button"
            onClick={fetchRoster}
            disabled={roster.loading}
            className="flex items-center gap-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer font-sans"
          >
            <RefreshCw size={13} className={cn(roster.loading && "animate-spin")} />
          </button>
        </div>

        {/* View Switcher (Month, Day View, Master List) */}
        <div className="flex items-center gap-1 rounded-xl bg-zinc-200/60 dark:bg-zinc-900 p-1 border border-zinc-200 dark:border-zinc-800 text-xs font-sans">
          {([["month", CalendarIcon, "Month"], ["day", Clock, "Day View"], ["list", List, "Master List"]] as const).map(
            ([viewMode, Icon, label]) => (
              <button
                key={viewMode}
                type="button"
                onClick={() => setMode(viewMode)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold transition-colors cursor-pointer font-sans",
                  mode === viewMode ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                )}
              >
                <Icon size={13} />
                <span>{label}</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Loading Skeleton */}
      {roster.loading && (
        <div className="grid grid-cols-7 gap-px rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900/40 overflow-hidden font-sans">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="min-h-[105px] bg-[#f8f7fa] dark:bg-zinc-950 animate-pulse" />
          ))}
        </div>
      )}

      {/* 1. Month View */}
      {mode === "month" && !roster.loading && (
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

                  {metric && (["pile-on", "win-back", "leak-map"] as ActivitySkill[]).some((s) => metric.activityBySkill[s] > 0) && (
                    <div className="flex items-center gap-1 flex-wrap px-0.5">
                      {(["pile-on", "win-back", "leak-map"] as ActivitySkill[]).map(
                        (s) =>
                          metric.activityBySkill[s] > 0 && (
                            <div key={s} className="relative">
                              <SquishySkillBadge skill={s} size={14} enabled={true} />
                              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-700 text-[7px] font-bold text-zinc-800 dark:text-white font-mono">
                                {metric.activityBySkill[s]}
                              </span>
                            </div>
                          )
                      )}
                    </div>
                  )}

                  <div className="my-auto py-1 font-sans">
                    {metric && metric.totalCalls > 0 ? (
                      <div className="rounded-lg bg-[#fde2e8] dark:bg-pink-500/20 px-2 py-1.5 transition-colors group-hover:bg-[#fbcfe8] dark:group-hover:bg-pink-500/30 flex items-center gap-1.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#ffcfd2] text-rose-950 dark:bg-rose-900/60 dark:text-rose-200 shrink-0">
                          <PhoneCall size={10} className="fill-current" />
                        </span>
                        <div>
                          <span className="text-[11px] font-bold block leading-none text-pink-950 dark:text-pink-200 font-sans">
                            {metric.totalCalls} call{metric.totalCalls === 1 ? "" : "s"}
                          </span>
                          <span className="text-[9.5px] font-mono mt-0.5 block font-semibold text-pink-800 dark:text-pink-300/90">
                            {metric.briefDelivered}/{metric.totalCalls} briefed
                          </span>
                        </div>
                      </div>
                    ) : metric && (["pile-on", "win-back", "leak-map"] as ActivitySkill[]).some((s) => metric.activityBySkill[s] > 0) ? (
                      <span className="text-[10px] text-zinc-600 dark:text-zinc-400 font-mono block">
                        {(["pile-on", "win-back", "leak-map"] as ActivitySkill[])
                          .filter((s) => metric.activityBySkill[s] > 0)
                          .map((s) => `${metric.activityBySkill[s]} ${ACTIVITY_SKILL_LABEL[s]}`)
                          .join(" · ")}
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-600 font-mono italic block">No activity</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Day View */}
      {mode === "day" && !roster.loading && (
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
                  {selectedDayEntries.length} meeting{selectedDayEntries.length === 1 ? "" : "s"}
                </span>
                {selectedDayMetric.briefDelivered > 0 && (
                  <span className="text-emerald-900 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-500/20 px-2 py-0.5 rounded text-[10px] font-bold border-0">
                    {selectedDayMetric.briefDelivered} briefed
                  </span>
                )}
              </div>
            </div>

            {/* Skill Activity Strip */}
            {selectedDayActivity.length > 0 && (
              <div className="border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/50 dark:bg-zinc-900/30 p-2 space-y-1.5 font-sans">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 block px-1">
                  Skill Activity
                </span>
                <div className="flex flex-wrap gap-1.5 font-sans">
                  {selectedDayActivity.map((ev) => (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => {
                        setSelectedActivityId(ev.id);
                        setInspectionType("activity");
                      }}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs cursor-pointer transition-colors font-sans",
                        inspectionType === "activity" && selectedActivityId === ev.id
                          ? "border-amber-400 bg-amber-100/80 dark:bg-amber-950/60 text-zinc-900 dark:text-white font-bold"
                          : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent text-zinc-800 dark:text-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-700"
                      )}
                    >
                      <SquishySkillBadge skill={ev.skill} size={14} enabled={true} />
                      <span className="font-bold">
                        {ev.prospectName ?? ev.prospectEmail ?? ACTIVITY_SKILL_LABEL[ev.skill]}
                      </span>
                      <span className="text-zinc-500 dark:text-zinc-400">{ev.title}</span>
                      <StatusPill tone={ev.tone}>{timeStr(ev.occurredAt)}</StatusPill>
                    </button>
                  ))}
                </div>
              </div>
            )}

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
                        const isSelected = inspectionType === "call" && selectedEntry?.id === entry.id;
                        return (
                          <button
                            key={entry.id}
                            type="button"
                            onClick={() => {
                              setSelectedEntryId(entry.id);
                              setInspectionType("call");
                            }}
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
                                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-950 bg-[#ffcfd2] px-1.5 py-0.5 rounded font-bold border-0">
                                  <PhoneCall size={9} className="fill-current text-rose-950" />
                                  {timeStr(entry.callTime)}
                                </span>
                              </div>
                              <p className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400 truncate">{entry.prospectEmail}</p>

                              <div className="flex flex-wrap gap-1 pt-1 font-sans">
                                <StatusPill tone={entry.status === "brief_delivered" ? "success" : entry.status === "brief_failed" ? "danger" : "neutral"}>
                                  Brief: {entry.status.replace("_", " ")}
                                </StatusPill>
                                {entry.outcomeStatus === "resolved" && entry.actualOutcome && (
                                  <StatusPill tone={OUTCOME_META[entry.actualOutcome].tone}>
                                    {OUTCOME_META[entry.actualOutcome].label}
                                  </StatusPill>
                                )}
                                {entry.outcomeStatus === "awaiting_outcome" && (
                                  <StatusPill tone="warning" className="flex items-center gap-1">
                                    <HelpCircle size={10} /> Awaiting outcome
                                  </StatusPill>
                                )}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyText(entry.prospectEmail ?? "", "email");
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

            {/* FULL INSPECTOR PANEL (CALL INSPECTION vs ACTIVITY INSPECTION) */}
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 p-4 space-y-4 shadow-xl font-sans">
              {inspectionType === "activity" && selectedActivity ? (
                /* SYSTEM EVENT / LEAK-MAP AUDIT PREVIEW */
                <div className="space-y-4 font-sans">
                  <div className="space-y-2 border-b border-zinc-200 dark:border-zinc-800 pb-3 font-sans">
                    <div className="flex items-center justify-between font-sans">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1.5 font-sans">
                        <SquishySkillBadge skill={selectedActivity.skill} size={16} enabled={true} />
                        {ACTIVITY_SKILL_LABEL[selectedActivity.skill]}
                      </span>
                      <StatusPill tone={selectedActivity.tone}>
                        {TONE_TO_SEVERITY_LABEL[selectedActivity.tone] ?? selectedActivity.tone}
                      </StatusPill>
                    </div>

                    <h4 className="text-base font-bold text-zinc-900 dark:text-white font-sans">{selectedActivity.title}</h4>

                    <div className="flex items-center gap-2 font-mono text-xs text-zinc-600 dark:text-zinc-400 pt-0.5">
                      <Clock size={12} className="text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>{new Date(selectedActivity.occurredAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent p-3 space-y-2 text-xs font-sans">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase block font-semibold">Audit Findings & Diagnostic</span>
                    <p className="text-zinc-800 dark:text-zinc-300 leading-relaxed font-sans text-xs">
                      {selectedActivity.detail || "Automated audit scan completed."}
                    </p>
                  </div>

                  {selectedActivity.prospectEmail && (
                    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent p-3 space-y-1 text-xs font-sans">
                      <span className="text-[10px] font-mono text-zinc-500 uppercase block font-semibold">Associated Lead</span>
                      <p className="font-bold text-zinc-900 dark:text-white">{selectedActivity.prospectName ?? selectedActivity.prospectEmail}</p>
                      <p className="font-mono text-zinc-500 text-[11px]">{selectedActivity.prospectEmail}</p>
                    </div>
                  )}

                  <div className="pt-2 font-sans">
                    <Link
                      href={`/dashboard/engagements/${engagementId}/skills/${selectedActivity.skill}`}
                      className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors w-full justify-center shadow-xs"
                    >
                      <span>Open Full {ACTIVITY_SKILL_LABEL[selectedActivity.skill]} Skill Page</span>
                      <ExternalLink size={12} />
                    </Link>
                  </div>
                </div>
              ) : selectedEntry ? (
                /* PROSPECT CALL INSPECTIONS WITH TABS */
                <>
                  <div className="space-y-2 border-b border-zinc-200 dark:border-zinc-800 pb-3 font-sans">
                    <div className="flex items-center justify-between font-sans">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-sky-600 dark:text-sky-400 font-bold flex items-center gap-1 font-sans">
                        <Building2 size={12} /> {selectedEntry.bookingPlatform ?? "Calendar"}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyText(selectedEntry.prospectEmail ?? "", "email")}
                        className="flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent px-2 py-1 text-[11px] text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white font-sans"
                      >
                        {copiedEmail ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                        <span>Copy Email</span>
                      </button>
                    </div>

                    <h4 className="text-base font-bold text-zinc-900 dark:text-white font-sans">{selectedEntry.prospectName ?? "Unnamed Prospect"}</h4>

                    <div className="space-y-1 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                      <div className="flex items-center gap-2">
                        <Mail size={12} className="text-zinc-500 shrink-0" />
                        <span className="truncate">{selectedEntry.prospectEmail ?? "No email provided"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone size={12} className="text-zinc-500 shrink-0" />
                        <span>{selectedEntry.prospectPhone ?? "No phone recorded"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-zinc-800 dark:text-zinc-300 pt-0.5">
                        <Clock size={12} className="text-sky-600 dark:text-sky-400 shrink-0" />
                        <span>{new Date(selectedEntry.callTime).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                    </div>

                    {/* ── Call outcome — truth, not an assumption ──
                        Fix: this whole section didn't exist before. A
                        booking whose date had passed with nothing logged
                        just kept showing whatever pipeline stage it last
                        had (usually "Newly booked" or "Scheduled")
                        indefinitely — no distinction from a call still
                        genuinely upcoming, and no way to resolve it from
                        here. Resolution priority is unchanged (a rep
                        clicking here is source "dashboard", same as
                        every other manual click) — Recall telemetry, the
                        CRM check, and the auto-sweep all still run first
                        and this simply won't need clicking if one of
                        them already resolved it. */}
                    {selectedEntry.outcomeStatus === "resolved" && selectedEntry.actualOutcome ? (
                      <div className="flex items-center justify-between rounded-lg bg-zinc-100 dark:bg-zinc-800/60 px-2.5 py-1.5 font-sans">
                        <span className="text-[10.5px] font-mono text-zinc-500 uppercase">Call outcome</span>
                        <StatusPill tone={OUTCOME_META[selectedEntry.actualOutcome].tone}>
                          {OUTCOME_META[selectedEntry.actualOutcome].label}
                        </StatusPill>
                      </div>
                    ) : selectedEntry.outcomeStatus === "awaiting_outcome" ? (
                      <div className="space-y-1.5 rounded-lg border border-amber-300 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/10 p-2.5 font-sans">
                        <span className="flex items-center gap-1 text-[10.5px] font-mono text-amber-800 dark:text-amber-300 uppercase">
                          <CalendarClock size={11} /> Call time has passed — no outcome logged yet
                        </span>
                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleLogOutcome(selectedEntry, "showed")}
                            disabled={outcomeSubmittingId !== null}
                            className="flex items-center justify-center gap-1 py-1.5 rounded-lg bg-emerald-500 text-zinc-950 text-[11px] font-bold hover:bg-emerald-400 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <UserCheck size={11} /> {outcomeSubmittingId === selectedEntry.externalCallId ? "…" : "Showed"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleLogOutcome(selectedEntry, "no_show")}
                            disabled={outcomeSubmittingId !== null}
                            className="flex items-center justify-center gap-1 py-1.5 rounded-lg bg-rose-500 text-white text-[11px] font-bold hover:bg-rose-400 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <UserX size={11} /> No-Show
                          </button>
                          <button
                            type="button"
                            onClick={() => handleLogOutcome(selectedEntry, "rescheduled")}
                            disabled={outcomeSubmittingId !== null}
                            className="flex items-center justify-center gap-1 py-1.5 rounded-lg bg-zinc-700 dark:bg-zinc-600 text-white text-[11px] font-bold hover:bg-zinc-600 dark:hover:bg-zinc-500 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Resched.
                          </button>
                        </div>
                        {outcomeError && <p className="text-[10.5px] text-rose-600 dark:text-rose-400">{outcomeError}</p>}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-1 rounded-xl bg-zinc-200/60 dark:bg-zinc-900 p-1 border border-zinc-200 dark:border-zinc-800 text-xs font-sans">
                    <button
                      type="button"
                      onClick={() => setActiveTab("brief")}
                      className={cn(
                        "flex-1 py-1 rounded-lg font-semibold transition-colors cursor-pointer text-center text-[11px] font-sans",
                        activeTab === "brief" ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                      )}
                    >
                      Brief
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("pile_on")}
                      className={cn(
                        "flex-1 py-1 rounded-lg font-semibold transition-colors cursor-pointer text-center text-[11px] font-sans",
                        activeTab === "pile_on" ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                      )}
                    >
                      Pile-On
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("win_back")}
                      className={cn(
                        "flex-1 py-1 rounded-lg font-semibold transition-colors cursor-pointer text-center text-[11px] font-sans",
                        activeTab === "win_back" ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                      )}
                    >
                      Win-Back
                    </button>
                  </div>

                  {activeTab === "brief" && (
                    <div className="space-y-3 text-xs font-sans">
                      <div className="flex items-center justify-between font-sans">
                        <span className="text-[10.5px] font-mono text-zinc-500 uppercase">Status & Channel</span>
                        <StatusPill tone={selectedEntry.status === "brief_delivered" ? "success" : selectedEntry.status === "brief_failed" ? "danger" : "neutral"}>
                          {selectedEntry.status.replace("_", " ")}
                        </StatusPill>
                      </div>

                      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent p-3 space-y-2 font-sans">
                        <div className="flex items-center justify-between text-[11px] font-sans">
                          <span className="text-zinc-600 dark:text-zinc-400 font-semibold">Delivered via</span>
                          <span className="font-mono text-zinc-900 dark:text-white capitalize">{selectedEntry.destinationDelivered ?? "Slack"}</span>
                        </div>

                        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700/80 space-y-1 font-sans">
                          <span className="text-[10px] font-mono text-zinc-500 uppercase block">Brief Content</span>
                          <p className="text-zinc-800 dark:text-zinc-300 leading-relaxed font-sans whitespace-pre-wrap max-h-[160px] overflow-y-auto text-[11.5px]">
                            {selectedEntry.briefText ?? "No brief text synthesized for this call yet."}
                          </p>
                        </div>
                      </div>

                      {selectedEntry.runId && (
                        <a
                          href={`/dashboard/runs/${selectedEntry.runId}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent px-2.5 py-1.5 text-[11px] text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors w-fit"
                        >
                          <SquishySkillBadge skill="pre-call-read" size={14} enabled={true} />
                          <span>View research execution run</span>
                          <ExternalLink size={11} className="text-zinc-500" />
                        </a>
                      )}
                    </div>
                  )}

                  {activeTab === "pile_on" && (
                    <div className="space-y-3 text-xs font-sans">
                      {selectedEntry.pileOnData ? (
                        <>
                          <div className="flex items-center justify-between font-sans">
                            <span className="text-[10.5px] font-mono text-zinc-500 uppercase">Sequence Progress</span>
                            <StatusPill tone="info">
                              {selectedEntry.pileOnData.touchesSent}/{selectedEntry.pileOnData.touchesTotal} SMS Touches
                            </StatusPill>
                          </div>

                          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent p-3 space-y-2 font-sans">
                            <div className="flex items-center justify-between text-[11px] font-sans">
                              <span className="text-zinc-600 dark:text-zinc-400 font-semibold">Email 1 Method</span>
                              <span className="font-mono text-zinc-900 dark:text-white capitalize">{selectedEntry.pileOnData.sentVia ?? "hybrid"}</span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] font-sans">
                              <span className="text-zinc-600 dark:text-zinc-400 font-semibold">Current Stage</span>
                              <span className="font-mono text-amber-600 dark:text-amber-400 capitalize">{selectedEntry.pileOnData.stage.replace("_", " ")}</span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <p className="text-zinc-500 italic text-[11px] py-4 text-center font-sans">No active Pile-On speed-to-lead sequence for this booking.</p>
                      )}
                    </div>
                  )}

                  {activeTab === "win_back" && (
                    <div className="space-y-3 text-xs font-sans">
                      {selectedEntry.winBackData ? (
                        <>
                          <div className="flex items-center justify-between font-sans">
                            <span className="text-[10.5px] font-mono text-zinc-500 uppercase">Recovery Status</span>
                            <StatusPill tone="warning" className="capitalize">
                              {selectedEntry.winBackData.status}
                            </StatusPill>
                          </div>

                          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent p-3 space-y-2 font-sans">
                            <div className="flex items-center justify-between text-[11px] font-sans">
                              <span className="text-zinc-600 dark:text-zinc-400 font-semibold">Touches Sent</span>
                              <span className="font-mono text-zinc-900 dark:text-white">{selectedEntry.winBackData.touchesSent} / {selectedEntry.winBackData.touchesTotal}</span>
                            </div>
                            {selectedEntry.winBackData.exitReason && (
                              <div className="flex items-center justify-between text-[11px] font-sans">
                                <span className="text-zinc-600 dark:text-zinc-400 font-semibold">Exit Reason</span>
                                <span className="font-mono text-zinc-700 dark:text-zinc-300">{selectedEntry.winBackData.exitReason}</span>
                              </div>
                            )}
                          </div>

                          {selectedEntry.winBackData.freshRescheduleLink && (
                            <button
                              type="button"
                              onClick={() => handleCopyText(selectedEntry.winBackData!.freshRescheduleLink!, "link")}
                              className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-amber-300 dark:border-amber-800/50 bg-amber-100/60 dark:bg-amber-950/30 px-3 py-2 text-xs font-semibold text-amber-900 dark:text-amber-300 hover:bg-amber-200/60 dark:hover:bg-amber-900/40 cursor-pointer transition-colors font-sans"
                            >
                              {copiedLink ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                              <span>{copiedLink ? "Link Copied!" : "Copy Fresh Reschedule Link"}</span>
                            </button>
                          )}
                        </>
                      ) : (
                        <p className="text-zinc-500 italic text-[11px] py-4 text-center font-sans">Prospect is active/scheduled — not enrolled in Win-Back recovery.</p>
                      )}
                    </div>
                  )}
                </>
              ) : selectedDayActivity.length > 0 ? (
                <div className="py-6 space-y-2 font-sans">
                  <p className="text-[11px] text-zinc-500 text-center font-sans">
                    No call today, but {selectedDayActivity.length} other skill event{selectedDayActivity.length === 1 ? "" : "s"} happened — see the Skill Activity strip above.
                  </p>
                </div>
              ) : (
                <div className="py-12 text-center text-zinc-500 space-y-2 font-sans">
                  <CalendarDays size={24} className="mx-auto text-zinc-400 dark:text-zinc-600" />
                  <p className="text-xs font-sans">
                    {selectedDate ? (
                      <>
                        <span className="font-bold text-zinc-800 dark:text-zinc-200 block mb-0.5">
                          {selectedDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                        </span>
                        Zero calls or skill activity for this date.
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

      {/* 3. MASTER LIST VIEW (SMART SPLIT-PANE WITH MULTI-SKILL INSPECTOR) */}
      {mode === "list" && !roster.loading && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 font-sans">
          {/* LEFT 7 COLUMNS: UNIFIED MULTI-SKILL FEED */}
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
            {listDaysToRender.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-zinc-400 dark:text-zinc-600 font-sans">
                <CalendarX2 size={22} />
                <span className="text-xs">No bookings or activity on file.</span>
              </div>
            ) : (
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800/60 max-h-[580px] overflow-y-auto">
                {listDaysToRender.map(({ dateStr, dateObj, calls, activities }) => {
                  const isSelectedDay = dateKey(selectedDate) === dateStr;
                  const systemAudits = activities.filter((ev) => ev.skill === "leak-map");

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
                          {systemAudits.length > 0 && ` · ${systemAudits.length} audit${systemAudits.length === 1 ? "" : "s"}`}
                        </span>
                      </div>

                      {/* Day Feed Entries */}
                      <div className="divide-y divide-zinc-200/60 dark:divide-zinc-800/40">
                        {/* 1. System Events Banner (e.g., Leak-Map Audits) */}
                        {systemAudits.map((audit) => {
                          const isSelectedAudit = inspectionType === "activity" && selectedActivityId === audit.id;

                          return (
                            <button
                              key={audit.id}
                              type="button"
                              onClick={() => {
                                setSelectedActivityId(audit.id);
                                setInspectionType("activity");
                                handleUpdateSelectedDate(dateObj);
                              }}
                              className={cn(
                                "w-full flex items-center justify-between px-4 py-2 text-xs font-sans cursor-pointer transition-colors border-0 border-b border-amber-500/20 text-left",
                                isSelectedAudit
                                  ? "bg-amber-500/25 dark:bg-amber-950/60 ring-1 ring-amber-400"
                                  : "bg-amber-500/10 dark:bg-amber-950/30 hover:bg-amber-500/15"
                              )}
                            >
                              <div className="flex items-center gap-2 font-sans min-w-0 flex-1">
                                <span className="font-mono text-[10px] font-bold text-amber-950 dark:text-amber-200 bg-amber-200 dark:bg-amber-900/60 px-1.5 py-0.5 rounded shrink-0">
                                  {timeStr(audit.occurredAt)}
                                </span>
                                <SquishySkillBadge skill="leak-map" size={14} enabled={true} />
                                <span className="font-bold text-zinc-900 dark:text-white font-sans truncate">{audit.title}</span>
                                {audit.detail && <span className="text-zinc-500 font-mono text-[11px] truncate hidden sm:inline">{audit.detail}</span>}
                              </div>
                              <StatusPill tone={audit.tone} className="shrink-0 ml-2">
                                {TONE_TO_SEVERITY_LABEL[audit.tone] ?? audit.tone}
                              </StatusPill>
                            </button>
                          );
                        })}

                        {/* 2. Prospect Calls with Combined Skill Badges */}
                        {calls.length > 0 ? (
                          calls.map((entry) => {
                            const isSelected = inspectionType === "call" && selectedEntry?.id === entry.id;
                            const isFailed = entry.status === "brief_failed";
                            const appointmentHour = formatTimeBadge(entry.callTime);

                            return (
                              <button
                                key={entry.id}
                                type="button"
                                onClick={() => {
                                  setSelectedEntryId(entry.id);
                                  setInspectionType("call");
                                  handleUpdateSelectedDate(new Date(entry.callTime));
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
                                      {entry.prospectName ?? entry.prospectEmail ?? "Unnamed Prospect"}
                                    </span>
                                    {entry.prospectEmail && (
                                      <span className="text-[11px] text-zinc-500 font-mono block truncate">
                                        {entry.prospectEmail}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  {/* Combined Active Skill Badges */}
                                  <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800/80 p-1 rounded-lg border border-zinc-200 dark:border-zinc-700/60">
                                    <SquishySkillBadge skill="pre-call-read" size={14} enabled={true} />
                                    {entry.pileOnData && <SquishySkillBadge skill="pile-on" size={14} enabled={true} />}
                                    {entry.winBackData && <SquishySkillBadge skill="win-back" size={14} enabled={true} />}
                                  </div>

                                  <StatusPill tone={entry.status === "brief_delivered" ? "success" : entry.status === "brief_failed" ? "danger" : "neutral"} className="shrink-0">
                                    {entry.status.replace("_", " ")}
                                  </StatusPill>

                                  {/* Fix: this row previously said nothing about
                                      whether the call actually happened — a
                                      booking from a week ago with no outcome
                                      logged looked identical to one still in
                                      the future. Now says so plainly, and
                                      distinguishes a real logged outcome from
                                      one nobody has confirmed yet. */}
                                  {entry.outcomeStatus === "resolved" && entry.actualOutcome && (
                                    <StatusPill tone={OUTCOME_META[entry.actualOutcome].tone} className="shrink-0">
                                      {OUTCOME_META[entry.actualOutcome].label}
                                    </StatusPill>
                                  )}
                                  {entry.outcomeStatus === "awaiting_outcome" && (
                                    <StatusPill tone="warning" className="shrink-0 flex items-center gap-1">
                                      <HelpCircle size={10} /> Awaiting outcome
                                    </StatusPill>
                                  )}

                                  {entry.prospectEmail && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleCopyText(entry.prospectEmail!, "email");
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
                        ) : systemAudits.length === 0 ? (
                          /* Explicit empty day row when 0 bookings/activity took place */
                          <button
                            type="button"
                            onClick={() => {
                              handleUpdateSelectedDate(dateObj);
                              setSelectedEntryId(null);
                              setSelectedActivityId(null);
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
                              No calls or skill runs
                            </span>
                            <span className="text-[10px] text-zinc-400 dark:text-zinc-600">0 / 0</span>
                          </button>
                        ) : null}
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
                      <span>Upcoming Bookings in {monthName} ({monthDaysSmart.future.reduce((acc, d) => acc + d.calls.length, 0)})</span>
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
                              <span>{calls.length} bookings</span>
                            </div>
                            <div className="divide-y divide-zinc-200/60 dark:divide-zinc-800/40">
                              {calls.map((entry) => (
                                <button
                                  key={entry.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedEntryId(entry.id);
                                    setInspectionType("call");
                                    handleUpdateSelectedDate(new Date(entry.callTime));
                                  }}
                                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50 cursor-pointer font-sans border-0"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-zinc-950 bg-[#ffcfd2] px-1.5 py-0.5 rounded shrink-0">
                                      <PhoneCall size={9} className="fill-current text-rose-950" />
                                      {formatTimeBadge(entry.callTime)}
                                    </span>
                                    <span className="truncate text-xs font-bold text-zinc-900 dark:text-white">
                                      {entry.prospectName ?? entry.prospectEmail}
                                    </span>
                                  </div>
                                  <StatusPill tone={entry.status === "brief_delivered" ? "success" : entry.status === "brief_failed" ? "danger" : "neutral"}>
                                    {entry.status.replace("_", " ")}
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

          {/* RIGHT 5 COLUMNS: MULTI-SKILL INSPECTOR PANEL */}
          <div className="lg:col-span-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 p-4 space-y-4 shadow-xl font-sans">
            {inspectionType === "activity" && selectedActivity ? (
              /* SYSTEM EVENT / LEAK-MAP AUDIT PREVIEW */
              <div className="space-y-4 font-sans">
                <div className="space-y-2 border-b border-zinc-200 dark:border-zinc-800 pb-3 font-sans">
                  <div className="flex items-center justify-between font-sans">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1.5 font-sans">
                      <SquishySkillBadge skill={selectedActivity.skill} size={16} enabled={true} />
                      {ACTIVITY_SKILL_LABEL[selectedActivity.skill]}
                    </span>
                    <StatusPill tone={selectedActivity.tone}>
                      {TONE_TO_SEVERITY_LABEL[selectedActivity.tone] ?? selectedActivity.tone}
                    </StatusPill>
                  </div>

                  <h4 className="text-base font-bold text-zinc-900 dark:text-white font-sans">{selectedActivity.title}</h4>

                  <div className="flex items-center gap-2 font-mono text-xs text-zinc-600 dark:text-zinc-400 pt-0.5">
                    <Clock size={12} className="text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>{new Date(selectedActivity.occurredAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent p-3 space-y-2 text-xs font-sans">
                  <span className="text-[10px] font-mono text-zinc-500 uppercase block font-semibold">Audit Findings & Diagnostic</span>
                  <p className="text-zinc-800 dark:text-zinc-300 leading-relaxed font-sans text-xs">
                    {selectedActivity.detail || "Automated audit scan completed."}
                  </p>
                </div>

                {selectedActivity.prospectEmail && (
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent p-3 space-y-1 text-xs font-sans">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase block font-semibold">Associated Lead</span>
                    <p className="font-bold text-zinc-900 dark:text-white">{selectedActivity.prospectName ?? selectedActivity.prospectEmail}</p>
                    <p className="font-mono text-zinc-500 text-[11px]">{selectedActivity.prospectEmail}</p>
                  </div>
                )}

                <div className="pt-2 font-sans">
                  <Link
                    href={`/dashboard/engagements/${engagementId}/skills/${selectedActivity.skill}`}
                    className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors w-full justify-center shadow-xs font-sans"
                  >
                    <span>Open Full {ACTIVITY_SKILL_LABEL[selectedActivity.skill]} Skill Page</span>
                    <ExternalLink size={12} />
                  </Link>
                </div>
              </div>
            ) : selectedEntry ? (
              /* PROSPECT CALL INSPECTION WITH TABS */
              <>
                <div className="space-y-2 border-b border-zinc-200 dark:border-zinc-800 pb-3 font-sans">
                  <div className="flex items-center justify-between font-sans">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-sky-600 dark:text-sky-400 font-bold flex items-center gap-1 font-sans">
                      <Building2 size={12} /> {selectedEntry.bookingPlatform ?? "Calendar"}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyText(selectedEntry.prospectEmail ?? "", "email")}
                      className="flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent px-2 py-1 text-[11px] text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white font-sans"
                    >
                      {copiedEmail ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                      <span>Copy Email</span>
                    </button>
                  </div>

                  <h4 className="text-base font-bold text-zinc-900 dark:text-white font-sans">{selectedEntry.prospectName ?? "Unnamed Prospect"}</h4>

                  <div className="space-y-1 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                    <div className="flex items-center gap-2">
                      <Mail size={12} className="text-zinc-500 shrink-0" />
                      <span className="truncate">{selectedEntry.prospectEmail ?? "No email provided"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone size={12} className="text-zinc-500 shrink-0" />
                      <span>{selectedEntry.prospectPhone ?? "No phone recorded"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-zinc-800 dark:text-zinc-300 pt-0.5">
                      <Clock size={12} className="text-sky-600 dark:text-sky-400 shrink-0" />
                      <span>{new Date(selectedEntry.callTime).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>

                  {selectedEntry.outcomeStatus === "resolved" && selectedEntry.actualOutcome ? (
                    <div className="flex items-center justify-between rounded-lg bg-zinc-100 dark:bg-zinc-800/60 px-2.5 py-1.5 font-sans">
                      <span className="text-[10.5px] font-mono text-zinc-500 uppercase">Call outcome</span>
                      <StatusPill tone={OUTCOME_META[selectedEntry.actualOutcome].tone}>
                        {OUTCOME_META[selectedEntry.actualOutcome].label}
                      </StatusPill>
                    </div>
                  ) : selectedEntry.outcomeStatus === "awaiting_outcome" ? (
                    <div className="space-y-1.5 rounded-lg border border-amber-300 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/10 p-2.5 font-sans">
                      <span className="flex items-center gap-1 text-[10.5px] font-mono text-amber-800 dark:text-amber-300 uppercase">
                        <CalendarClock size={11} /> Call time has passed — no outcome logged yet
                      </span>
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleLogOutcome(selectedEntry, "showed")}
                          disabled={outcomeSubmittingId !== null}
                          className="flex items-center justify-center gap-1 py-1.5 rounded-lg bg-emerald-500 text-zinc-950 text-[11px] font-bold hover:bg-emerald-400 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <UserCheck size={11} /> {outcomeSubmittingId === selectedEntry.externalCallId ? "…" : "Showed"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLogOutcome(selectedEntry, "no_show")}
                          disabled={outcomeSubmittingId !== null}
                          className="flex items-center justify-center gap-1 py-1.5 rounded-lg bg-rose-500 text-white text-[11px] font-bold hover:bg-rose-400 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <UserX size={11} /> No-Show
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLogOutcome(selectedEntry, "rescheduled")}
                          disabled={outcomeSubmittingId !== null}
                          className="flex items-center justify-center gap-1 py-1.5 rounded-lg bg-zinc-700 dark:bg-zinc-600 text-white text-[11px] font-bold hover:bg-zinc-600 dark:hover:bg-zinc-500 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Resched.
                        </button>
                      </div>
                      {outcomeError && <p className="text-[10.5px] text-rose-600 dark:text-rose-400">{outcomeError}</p>}
                    </div>
                  ) : null}
                </div>

                {/* Skill Inspection Tabs */}
                <div className="flex items-center gap-1 rounded-xl bg-zinc-200/60 dark:bg-zinc-900 p-1 border border-zinc-200 dark:border-zinc-800 text-xs font-sans">
                  <button
                    type="button"
                    onClick={() => setActiveTab("brief")}
                    className={cn(
                      "flex-1 py-1 rounded-lg font-semibold transition-colors cursor-pointer text-center text-[11px] font-sans",
                      activeTab === "brief" ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                    )}
                  >
                    Brief
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("pile_on")}
                    className={cn(
                      "flex-1 py-1 rounded-lg font-semibold transition-colors cursor-pointer text-center text-[11px] font-sans",
                      activeTab === "pile_on" ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                    )}
                  >
                    Pile-On
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("win_back")}
                    className={cn(
                      "flex-1 py-1 rounded-lg font-semibold transition-colors cursor-pointer text-center text-[11px] font-sans",
                      activeTab === "win_back" ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                    )}
                  >
                    Win-Back
                  </button>
                </div>

                {activeTab === "brief" && (
                  <div className="space-y-3 text-xs font-sans">
                    <div className="flex items-center justify-between font-sans">
                      <span className="text-[10.5px] font-mono text-zinc-500 uppercase">Status & Channel</span>
                      <StatusPill tone={selectedEntry.status === "brief_delivered" ? "success" : selectedEntry.status === "brief_failed" ? "danger" : "neutral"}>
                        {selectedEntry.status.replace("_", " ")}
                      </StatusPill>
                    </div>

                    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent p-3 space-y-2 font-sans">
                      <div className="flex items-center justify-between text-[11px] font-sans">
                        <span className="text-zinc-600 dark:text-zinc-400 font-semibold">Delivered via</span>
                        <span className="font-mono text-zinc-900 dark:text-white capitalize">{selectedEntry.destinationDelivered ?? "Slack"}</span>
                      </div>

                      <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700/80 space-y-1 font-sans">
                        <span className="text-[10px] font-mono text-zinc-500 uppercase block">Brief Content</span>
                        <p className="text-zinc-800 dark:text-zinc-300 leading-relaxed font-sans whitespace-pre-wrap max-h-[160px] overflow-y-auto text-[11.5px]">
                          {selectedEntry.briefText ?? "No brief text synthesized for this call yet."}
                        </p>
                      </div>
                    </div>

                    {selectedEntry.runId && (
                      <a
                        href={`/dashboard/runs/${selectedEntry.runId}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent px-2.5 py-1.5 text-[11px] text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors w-fit"
                      >
                        <SquishySkillBadge skill="pre-call-read" size={14} enabled={true} />
                        <span>View research execution run</span>
                        <ExternalLink size={11} className="text-zinc-500" />
                      </a>
                    )}
                  </div>
                )}

                {activeTab === "pile_on" && (
                  <div className="space-y-3 text-xs font-sans">
                    {selectedEntry.pileOnData ? (
                      <>
                        <div className="flex items-center justify-between font-sans">
                          <span className="text-[10.5px] font-mono text-zinc-500 uppercase">Sequence Progress</span>
                          <StatusPill tone="info">
                            {selectedEntry.pileOnData.touchesSent}/{selectedEntry.pileOnData.touchesTotal} SMS Touches
                          </StatusPill>
                        </div>

                        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent p-3 space-y-2 font-sans">
                          <div className="flex items-center justify-between text-[11px] font-sans">
                            <span className="text-zinc-600 dark:text-zinc-400 font-semibold">Email 1 Method</span>
                            <span className="font-mono text-zinc-900 dark:text-white capitalize">{selectedEntry.pileOnData.sentVia ?? "hybrid"}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] font-sans">
                            <span className="text-zinc-600 dark:text-zinc-400 font-semibold">Current Stage</span>
                            <span className="font-mono text-amber-600 dark:text-amber-400 capitalize">{selectedEntry.pileOnData.stage.replace("_", " ")}</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="text-zinc-500 italic text-[11px] py-4 text-center font-sans">No active Pile-On speed-to-lead sequence for this booking.</p>
                    )}
                  </div>
                )}

                {activeTab === "win_back" && (
                  <div className="space-y-3 text-xs font-sans">
                    {selectedEntry.winBackData ? (
                      <>
                        <div className="flex items-center justify-between font-sans">
                          <span className="text-[10.5px] font-mono text-zinc-500 uppercase">Recovery Status</span>
                          <StatusPill tone="warning" className="capitalize">
                            {selectedEntry.winBackData.status}
                          </StatusPill>
                        </div>

                        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent p-3 space-y-2 font-sans">
                          <div className="flex items-center justify-between text-[11px] font-sans">
                            <span className="text-zinc-600 dark:text-zinc-400 font-semibold">Touches Sent</span>
                            <span className="font-mono text-zinc-900 dark:text-white">{selectedEntry.winBackData.touchesSent} / {selectedEntry.winBackData.touchesTotal}</span>
                          </div>
                          {selectedEntry.winBackData.exitReason && (
                            <div className="flex items-center justify-between text-[11px] font-sans">
                              <span className="text-zinc-600 dark:text-zinc-400 font-semibold">Exit Reason</span>
                              <span className="font-mono text-zinc-700 dark:text-zinc-300">{selectedEntry.winBackData.exitReason}</span>
                            </div>
                          )}
                        </div>

                        {selectedEntry.winBackData.freshRescheduleLink && (
                          <button
                            type="button"
                            onClick={() => handleCopyText(selectedEntry.winBackData!.freshRescheduleLink!, "link")}
                            className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-amber-300 dark:border-amber-800/50 bg-amber-100/60 dark:bg-amber-950/30 px-3 py-2 text-xs font-semibold text-amber-900 dark:text-amber-300 hover:bg-amber-200/60 dark:hover:bg-amber-900/40 cursor-pointer transition-colors font-sans"
                          >
                            {copiedLink ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                            <span>{copiedLink ? "Link Copied!" : "Copy Fresh Reschedule Link"}</span>
                          </button>
                        )}
                      </>
                    ) : (
                      <p className="text-zinc-500 italic text-[11px] py-4 text-center font-sans">Prospect is active/scheduled — not enrolled in Win-Back recovery.</p>
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
                      Zero calls or skill activity for this date.
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