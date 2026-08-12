// src/app/dashboard/engagements/[id]/master-roster-calendar.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  List,
  LayoutGrid,
  Search,
  RefreshCw,
  Check,
  Copy,
  Phone,
  Mail,
  ExternalLink,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { skillName } from "@/lib/copy";
import { StatusPill } from "@/app/dashboard/runs/[id]/_shared/status-pill";
import { getDaysInMonthGrid, dateKey, timeStr } from "@/app/dashboard/runs/[id]/_shared/calendar-grid";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import type { RosterEntry } from "@/app/api/engagements/[id]/roster/route";
import type { PileOnPipelineItem, PileOnStage } from "@/app/api/engagements/[id]/pile-on-pipeline/route";
import type { WinBackPipelineItem, WinBackEnrollmentStatus } from "@/app/api/engagements/[id]/win-back-pipeline/route";
import type { ActivityEvent, ActivitySkill } from "@/app/api/engagements/[id]/activity/route";

const TONE_TO_SEVERITY_LABEL: Record<string, string> = {
  danger: "High severity",
  warning: "Medium severity",
  info: "Low severity",
  neutral: "Clean",
};

// Finding A fix (2026-08-07 handoff) — this was a 4th independently
// hardcoded copy of skill display names (beyond the 3 the handoff named),
// found while sweeping for the same drift pattern. Derived from
// skillName() (copy.ts) now.
const ACTIVITY_SKILL_LABEL: Record<ActivitySkill, string> = {
  "pile-on": skillName("pile-on"),
  "win-back": skillName("win-back"),
  "leak-map": skillName("leak-map"),
};

type ViewMode = "month" | "day" | "list" | "board";
type BoardPipelineLens = "all" | "pile_on" | "win_back" | "leak_map";

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

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-rose-800/50 bg-rose-950/20 px-4 py-2.5 text-xs text-rose-300 font-sans">
      <span>{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg border border-rose-700 bg-rose-900/50 px-2.5 py-1 font-semibold text-rose-200 hover:bg-rose-800 cursor-pointer font-sans"
      >
        Retry
      </button>
    </div>
  );
}

export function MasterRosterCalendar({ engagementId }: { engagementId: string }) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>("month");
  const [boardLens, setBoardLens] = useState<BoardPipelineLens>("all");
  const [filterText, setFilterText] = useState("");
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeTab, setActiveTab] = useState<"brief" | "pile_on" | "win_back">("brief");

  // Per-Stream State
  const [roster, setRoster] = useState<StreamState<RosterEntry>>(emptyStream());
  const [pileOn, setPileOn] = useState<StreamState<PileOnPipelineItem>>(emptyStream());
  const [winBack, setWinBack] = useState<StreamState<WinBackPipelineItem>>(emptyStream());
  // Unified feed for everything that isn't a call: Pile-On/Win-Back
  // touches actually sent, Win-Back enrollment/exit lifecycle events, and
  // Leak-Map audit completions. Month-view badges need this immediately
  // (not lazily, the way pileOn/winBack pipeline rollups are) since a day
  // can have real activity with zero calls on it.
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

  // Primary Fetch: Activity (Pile-On / Win-Back / Leak-Map events, month-scoped like roster)
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

  // Lazy Fetch: Pile-On (full-history pipeline rollup, used by List/Board only)
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

  // Lazy Fetch: Win-Back (full-history pipeline rollup, used by List/Board only)
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

  // Lazy Fetch: full-history activity (Board view's Leak-Map lens only —
  // that lens buckets by severity across the whole engagement, same as
  // the Pile-On/Win-Back lenses next to it, not one month).
  const [activityAll, setActivityAll] = useState<StreamState<ActivityEvent>>(emptyStream());
  const fetchActivityAll = useCallback(async () => {
    if (activityAll.fetched || activityAll.loading) return;
    setActivityAll((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch(`/api/engagements/${engagementId}/activity?all=1`);
      if (!res.ok) throw new Error(`Activity fetch failed: ${res.status}`);
      const data = await res.json();
      setActivityAll({ data: data.events ?? [], loading: false, fetched: true, error: null });
    } catch (err) {
      setActivityAll({ data: [], loading: false, fetched: true, error: err instanceof Error ? err.message : "Failed to load skill activity" });
    }
  }, [engagementId, activityAll.fetched, activityAll.loading]);

  // Sync Month Changes & Mode Switches
  useEffect(() => {
    fetchRoster();
    fetchActivity();
    setPileOn(emptyStream());
    setWinBack(emptyStream());
  }, [fetchRoster, fetchActivity]);

  useEffect(() => {
    if (mode === "day" || mode === "board" || mode === "list") {
      fetchPileOn();
      fetchWinBack();
    }
    if (mode === "board") {
      fetchActivityAll();
    }
  }, [mode, fetchPileOn, fetchWinBack, fetchActivityAll]);

  // Client-Side Indexes & Joins
  const pileOnByBookingId = useMemo(
    () => new Map(pileOn.data.map((p) => [p.bookingId, p])),
    [pileOn.data]
  );

  const winBackByEmail = useMemo(
    () => new Map(winBack.data.map((w) => [w.prospectEmail.toLowerCase(), w])),
    [winBack.data]
  );

  type EnrichedEntry = RosterEntry & {
    pileOnData: PileOnPipelineItem | null;
    winBackData: WinBackPipelineItem | null;
  };

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

  // Same filterText applied to activity as to roster entries — a search
  // for a prospect should hide unrelated system events (Leak-Map audits
  // have no prospect and are excluded once a search is active), and an
  // empty search shows everything.
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
  const selectedDayMetric = dayMetrics[selectedDayKey] ?? EMPTY_METRIC;

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
    () => filteredEntries.find((e) => e.id === selectedEntryId) ?? selectedDayEntries[0] ?? null,
    [filteredEntries, selectedEntryId, selectedDayEntries]
  );

  const selectedDayActivity = activityByDate[selectedDayKey] ?? [];

  type UnifiedListRow = {
    key: string;
    occurredAt: string;
    skill: "pre-call-read" | ActivitySkill;
    title: string;
    tone: "success" | "warning" | "danger" | "info" | "neutral";
    statusLabel: string;
    detail: string | null;
    prospectName: string | null;
    prospectEmail: string | null;
    onSelect: () => void;
  };

  function activityStatusLabel(ev: ActivityEvent): string {
    switch (ev.type) {
      case "pile_on_touch_sent":
      case "win_back_touch_sent":
        return "sent";
      case "win_back_enrolled":
        return "enrolled";
      case "win_back_rebooked":
        return "rebooked";
      case "win_back_lost":
        return "lost";
      case "win_back_reply_exited":
        return "exited";
      case "win_back_corrected":
        return "corrected";
      case "leak_map_audit":
        return TONE_TO_SEVERITY_LABEL[ev.tone] ?? ev.tone;
      default:
        return ev.tone;
    }
  }

  const unifiedListRows = useMemo<UnifiedListRow[]>(() => {
    const callRows: UnifiedListRow[] = filteredEntries.map((entry) => {
      const parts: string[] = [];
      if (entry.pileOnData) parts.push(`Pile-On: ${entry.pileOnData.stage.replace(/_/g, " ")}`);
      if (entry.winBackData) parts.push(`Win-Back: ${entry.winBackData.status.replace(/_/g, " ")}`);
      return {
        key: `call:${entry.id}`,
        occurredAt: entry.callTime,
        skill: "pre-call-read",
        title: "Call",
        tone: entry.status === "brief_delivered" ? "success" : entry.status === "brief_failed" ? "danger" : "neutral",
        statusLabel: entry.status.replace(/_/g, " "),
        detail: parts.length > 0 ? parts.join(" · ") : null,
        prospectName: entry.prospectName,
        prospectEmail: entry.prospectEmail,
        onSelect: () => {
          setSelectedEntryId(entry.id);
          setSelectedDate(new Date(entry.callTime));
          setMode("day");
        },
      };
    });

    const activityRows: UnifiedListRow[] = filteredActivity.map((ev) => ({
      key: ev.id,
      occurredAt: ev.occurredAt,
      skill: ev.skill,
      title: ev.title,
      tone: ev.tone,
      statusLabel: activityStatusLabel(ev),
      detail: ev.detail,
      prospectName: ev.prospectName,
      prospectEmail: ev.prospectEmail,
      onSelect: () => {
        setSelectedDate(new Date(ev.occurredAt));
        setMode("day");
      },
    }));

    return [...callRows, ...activityRows].sort(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    );
  }, [filteredEntries, filteredActivity]);

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

  return (
    <div className="space-y-3 font-sans antialiased">
      {/* Explicit Error Banners */}
      {roster.error && <ErrorBanner message={roster.error} onRetry={fetchRoster} />}
      {pileOn.error && (mode === "day" || mode === "board" || mode === "list") && (
        <ErrorBanner message={pileOn.error} onRetry={fetchPileOn} />
      )}
      {winBack.error && (mode === "day" || mode === "board" || mode === "list") && (
        <ErrorBanner message={winBack.error} onRetry={fetchWinBack} />
      )}
      {activity.error && <ErrorBanner message={activity.error} onRetry={fetchActivity} />}

      {/* Toolbar & View Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-2 shadow-sm font-sans">
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-500" />
            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Search bookings, emails, or phone..."
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 py-1.5 pl-8 pr-2.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-700 focus:outline-none font-sans"
            />
          </div>

          <button
            type="button"
            onClick={fetchRoster}
            disabled={roster.loading}
            className="flex items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer font-sans"
          >
            <RefreshCw size={13} className={cn(roster.loading && "animate-spin")} />
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-xl bg-zinc-900 p-1 border border-zinc-800 text-xs font-sans">
          {([["month", CalendarIcon, "Month"], ["day", Clock, "Day View"], ["list", List, "Master List"], ["board", LayoutGrid, "Pipelines Board"]] as const).map(
            ([viewMode, Icon, label]) => (
              <button
                key={viewMode}
                type="button"
                onClick={() => setMode(viewMode)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold transition-colors cursor-pointer font-sans",
                  mode === viewMode ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
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
        <div className="grid grid-cols-7 gap-px rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden font-sans">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="min-h-[105px] bg-zinc-950 animate-pulse" />
          ))}
        </div>
      )}

      {/* 1. Month View */}
      {mode === "month" && !roster.loading && (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl font-sans">
          <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer font-sans">
                <ChevronLeft size={15} />
              </button>
              <button type="button" onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer font-sans">
                <ChevronRight size={15} />
              </button>
              <h3 className="text-sm font-bold text-white min-w-[130px] font-sans">{monthName} {year}</h3>
              <button
                type="button"
                onClick={() => { setCurrentDate(new Date()); setSelectedDate(new Date()); }}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-[11px] font-semibold text-zinc-200 hover:bg-zinc-700 cursor-pointer font-sans"
              >
                Today
              </button>
            </div>
            <div className="text-xs font-mono text-zinc-500">
              {roster.data.length} booking{roster.data.length === 1 ? "" : "s"}
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-zinc-800 bg-zinc-900/40 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-500 font-sans">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="border-r border-zinc-800/60 py-2 last:border-r-0">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 auto-rows-fr bg-zinc-950 font-sans">
            {gridDays.map(({ date, isCurrentMonth }, idx) => {
              const k = dateKey(date);
              const metric = dayMetrics[k];
              const isToday = dateKey(new Date()) === k;

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => { setSelectedDate(date); setMode("day"); }}
                  className={cn(
                    "group relative flex min-h-[105px] flex-col justify-between border-b border-r border-zinc-800/60 p-2 text-left transition-all hover:bg-zinc-900/60 cursor-pointer font-sans",
                    !isCurrentMonth && "bg-zinc-900/20 opacity-40"
                  )}
                >
                  <div className="flex items-start justify-between gap-1 w-full">
                    <span className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full font-mono text-[11px] font-semibold shrink-0",
                      isToday ? "bg-emerald-500 text-zinc-950 font-bold" : "text-zinc-400"
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

                  {/* Other-skill activity this day — the fix for "Leak-Map ran
                      today but the card looks empty": these render even when
                      totalCalls is 0, since Pile-On/Win-Back/Leak-Map activity
                      is never booking-anchored. */}
                  {metric && (["pile-on", "win-back", "leak-map"] as ActivitySkill[]).some((s) => metric.activityBySkill[s] > 0) && (
                    <div className="flex items-center gap-1 flex-wrap px-0.5">
                      {(["pile-on", "win-back", "leak-map"] as ActivitySkill[]).map(
                        (s) =>
                          metric.activityBySkill[s] > 0 && (
                            <div key={s} className="relative">
                              <SquishySkillBadge skill={s} size={14} enabled={true} />
                              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-zinc-700 text-[7px] font-bold text-white font-mono">
                                {metric.activityBySkill[s]}
                              </span>
                            </div>
                          )
                      )}
                    </div>
                  )}

                  <div className="my-auto py-1 font-sans">
                    {metric && metric.totalCalls > 0 ? (
                      <div className="rounded-lg bg-sky-950/40 border border-sky-800/50 px-2 py-1 text-sky-200">
                        <span className="text-[11px] font-bold block leading-none font-sans">
                          {metric.totalCalls} call{metric.totalCalls === 1 ? "" : "s"}
                        </span>
                        <span className="text-[9.5px] text-sky-400/80 font-mono mt-0.5 block">
                          {metric.briefDelivered}/{metric.totalCalls} briefed
                        </span>
                      </div>
                    ) : metric && (["pile-on", "win-back", "leak-map"] as ActivitySkill[]).some((s) => metric.activityBySkill[s] > 0) ? (
                      <span className="text-[10px] text-zinc-400 font-mono block">
                        {(["pile-on", "win-back", "leak-map"] as ActivitySkill[])
                          .filter((s) => metric.activityBySkill[s] > 0)
                          .map((s) => `${metric.activityBySkill[s]} ${ACTIVITY_SKILL_LABEL[s]}`)
                          .join(" · ")}
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-600 font-mono italic block">No activity</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Apple/Google Style Day View */}
      {mode === "day" && !roster.loading && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 font-sans">
          {/* LEFT 7 COLUMNS: HOURLY TIMELINE GRID */}
          <div className="lg:col-span-7 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl flex flex-col font-sans">
            <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-4 py-3 font-sans">
              <div className="flex items-center gap-2 font-sans">
                <button type="button" onClick={() => setSelectedDate(new Date(selectedDate.getTime() - 86400000))} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer font-sans">
                  <ChevronLeft size={15} />
                </button>
                <button type="button" onClick={() => setSelectedDate(new Date(selectedDate.getTime() + 86400000))} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer font-sans">
                  <ChevronRight size={15} />
                </button>
                <h3 className="text-sm font-bold text-white font-sans">
                  {selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                </h3>
              </div>

              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                <span className="text-zinc-400 font-semibold">{selectedDayEntries.length} meeting{selectedDayEntries.length === 1 ? "" : "s"}</span>
                {selectedDayMetric.briefDelivered > 0 && (
                  <span className="text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-1.5 py-0.5 rounded text-[10px]">
                    {selectedDayMetric.briefDelivered} briefed
                  </span>
                )}
                {selectedDayMetric.winBackActive > 0 && (
                  <span className="text-amber-400 bg-amber-950/60 border border-amber-800/50 px-1.5 py-0.5 rounded text-[10px]">
                    {selectedDayMetric.winBackActive} win-back
                  </span>
                )}
              </div>
            </div>

            {/* Skill Activity Strip — Pile-On touches, Win-Back lifecycle
                events, and Leak-Map audits for this day. These never have
                a call tied to them (that's the whole point — a Win-Back
                touch fires precisely because the prospect hasn't
                rebooked), so they render independently of whether any
                meetings are on the timeline below. */}
            {selectedDayActivity.length > 0 && (
              <div className="border-b border-zinc-800/80 bg-zinc-900/30 p-2 space-y-1.5 font-sans">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 block px-1">
                  Skill Activity
                </span>
                <div className="flex flex-wrap gap-1.5 font-sans">
                  {selectedDayActivity.map((ev) => (
                    <Link
                      key={ev.id}
                      href={`/dashboard/engagements/${engagementId}/skills/${ev.skill}`}
                      className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-xs text-zinc-200 hover:border-zinc-700 transition-colors font-sans"
                    >
                      <SquishySkillBadge skill={ev.skill} size={14} enabled={true} />
                      <span className="font-bold">
                        {ev.prospectName ?? ev.prospectEmail ?? ACTIVITY_SKILL_LABEL[ev.skill]}
                      </span>
                      <span className="text-zinc-400">{ev.title}</span>
                      <StatusPill tone={ev.tone}>{timeStr(ev.occurredAt)}</StatusPill>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Hourly Timeline */}
            <div className="divide-y divide-zinc-900 overflow-y-auto max-h-[620px] p-2 font-sans">
              {HOURS.map((hour) => {
                const hourEntries = selectedDayEntries.filter((e) => new Date(e.callTime).getHours() === hour);
                return (
                  <div key={hour} className="flex min-h-[60px] gap-3 py-1.5 border-b border-zinc-900/80 last:border-b-0 font-sans">
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
                              "w-full rounded-xl border p-2.5 text-left transition-all cursor-pointer flex items-start justify-between gap-2 shadow-xs font-sans",
                              isSelected
                                ? "border-sky-500 bg-sky-950/40 ring-1 ring-sky-500/50"
                                : "border-sky-800/60 bg-sky-950/20 hover:border-sky-700"
                            )}
                          >
                            <div className="space-y-1 min-w-0 font-sans">
                              <div className="flex items-center gap-2 font-sans">
                                <span className="font-bold text-white text-xs font-sans">{entry.prospectName ?? "Unnamed"}</span>
                                <span className="text-[10px] font-mono text-sky-400 bg-sky-950 px-1.5 py-0.5 rounded border border-sky-800/50">
                                  {timeStr(entry.callTime)}
                                </span>
                              </div>
                              <p className="text-[11px] font-mono text-zinc-400 truncate">{entry.prospectEmail}</p>

                              <div className="flex flex-wrap gap-1 pt-1 font-sans">
                                <StatusPill tone={entry.status === "brief_delivered" ? "success" : entry.status === "brief_failed" ? "danger" : "neutral"}>
                                  Brief: {entry.status.replace("_", " ")}
                                </StatusPill>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyText(entry.prospectEmail ?? "", "email");
                              }}
                              className="rounded-lg border border-zinc-800 bg-zinc-900 p-1.5 text-zinc-400 hover:text-white shrink-0 font-sans"
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
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 space-y-2 shadow-lg font-sans">
              <span className="text-[11px] font-bold text-white block px-1 font-sans">{monthName} {year}</span>
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
                        isSelected ? "bg-emerald-500 text-zinc-950 font-bold" : isCurrentMonth ? "text-zinc-300 hover:bg-zinc-800" : "text-zinc-700"
                      )}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* FULL PROSPECT INSPECTOR PANEL */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-4 shadow-xl font-sans">
              {selectedEntry ? (
                <>
                  <div className="space-y-2 border-b border-zinc-800 pb-3 font-sans">
                    <div className="flex items-center justify-between font-sans">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-sky-400 font-bold flex items-center gap-1 font-sans">
                        <Building2 size={12} /> {selectedEntry.bookingPlatform ?? "Calendar"}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyText(selectedEntry.prospectEmail ?? "", "email")}
                        className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:text-white font-sans"
                      >
                        {copiedEmail ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                        <span>Copy Email</span>
                      </button>
                    </div>

                    <h4 className="text-base font-bold text-white font-sans">{selectedEntry.prospectName ?? "Unnamed Prospect"}</h4>

                    <div className="space-y-1 font-mono text-xs text-zinc-400">
                      <div className="flex items-center gap-2">
                        <Mail size={12} className="text-zinc-500 shrink-0" />
                        <span className="truncate">{selectedEntry.prospectEmail ?? "No email provided"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone size={12} className="text-zinc-500 shrink-0" />
                        <span>{selectedEntry.prospectPhone ?? "No phone recorded"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-zinc-300 pt-0.5">
                        <Clock size={12} className="text-sky-400 shrink-0" />
                        <span>{new Date(selectedEntry.callTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 rounded-xl bg-zinc-900 p-1 border border-zinc-800 text-xs font-sans">
                    <button
                      type="button"
                      onClick={() => setActiveTab("brief")}
                      className={cn(
                        "flex-1 py-1 rounded-lg font-semibold transition-colors cursor-pointer text-center text-[11px] font-sans",
                        activeTab === "brief" ? "bg-zinc-800 text-white shadow-xs" : "text-zinc-400 hover:text-zinc-200"
                      )}
                    >
                      Brief
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("pile_on")}
                      className={cn(
                        "flex-1 py-1 rounded-lg font-semibold transition-colors cursor-pointer text-center text-[11px] font-sans",
                        activeTab === "pile_on" ? "bg-zinc-800 text-white shadow-xs" : "text-zinc-400 hover:text-zinc-200"
                      )}
                    >
                      Pile-On
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("win_back")}
                      className={cn(
                        "flex-1 py-1 rounded-lg font-semibold transition-colors cursor-pointer text-center text-[11px] font-sans",
                        activeTab === "win_back" ? "bg-zinc-800 text-white shadow-xs" : "text-zinc-400 hover:text-zinc-200"
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

                      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 space-y-2 font-sans">
                        <div className="flex items-center justify-between text-[11px] font-sans">
                          <span className="text-zinc-400 font-semibold">Delivered via</span>
                          <span className="font-mono text-white capitalize">{selectedEntry.destinationDelivered ?? "Slack"}</span>
                        </div>

                        <div className="pt-2 border-t border-zinc-800/80 space-y-1 font-sans">
                          <span className="text-[10px] font-mono text-zinc-500 uppercase block">Brief Content</span>
                          <p className="text-zinc-300 leading-relaxed font-sans whitespace-pre-wrap max-h-[160px] overflow-y-auto text-[11.5px]">
                            {selectedEntry.briefText ?? "No brief text synthesized for this call yet."}
                          </p>
                        </div>
                      </div>

                      {selectedEntry.runId && (
                        <a
                          href={`/dashboard/runs/${selectedEntry.runId}`}
                          className="inline-flex items-center gap-1.5 text-[11px] font-mono text-sky-400 hover:underline pt-1"
                        >
                          <span>View research execution run</span>
                          <ExternalLink size={11} />
                        </a>
                      )}
                      <Link
                        href={`/dashboard/engagements/${engagementId}/skills/pre-call-read`}
                        className="flex items-center gap-1.5 text-[11px] font-mono text-sky-400 hover:underline pt-1"
                      >
                        <span>View full Pre-Call Read history for this client</span>
                        <ExternalLink size={11} />
                      </Link>
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

                          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 space-y-2 font-sans">
                            <div className="flex items-center justify-between text-[11px] font-sans">
                              <span className="text-zinc-400 font-semibold">Email 1 Method</span>
                              <span className="font-mono text-white capitalize">{selectedEntry.pileOnData.sentVia ?? "hybrid"}</span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] font-sans">
                              <span className="text-zinc-400 font-semibold">Current Stage</span>
                              <span className="font-mono text-amber-400 capitalize">{selectedEntry.pileOnData.stage.replace("_", " ")}</span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <p className="text-zinc-500 italic text-[11px] py-4 text-center font-sans">No active Pile-On speed-to-lead sequence for this booking.</p>
                      )}
                      <Link
                        href={`/dashboard/engagements/${engagementId}/skills/pile-on`}
                        className="inline-flex items-center gap-1.5 text-[11px] font-mono text-sky-400 hover:underline pt-1"
                      >
                        <span>View full Pile-On history for this client</span>
                        <ExternalLink size={11} />
                      </Link>
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

                          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 space-y-2 font-sans">
                            <div className="flex items-center justify-between text-[11px] font-sans">
                              <span className="text-zinc-400 font-semibold">Touches Sent</span>
                              <span className="font-mono text-white">{selectedEntry.winBackData.touchesSent} / {selectedEntry.winBackData.touchesTotal}</span>
                            </div>
                            {selectedEntry.winBackData.exitReason && (
                              <div className="flex items-center justify-between text-[11px] font-sans">
                                <span className="text-zinc-400 font-semibold">Exit Reason</span>
                                <span className="font-mono text-zinc-300">{selectedEntry.winBackData.exitReason}</span>
                              </div>
                            )}
                          </div>

                          {selectedEntry.winBackData.freshRescheduleLink && (
                            <button
                              type="button"
                              onClick={() => handleCopyText(selectedEntry.winBackData!.freshRescheduleLink!, "link")}
                              className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-amber-800/50 bg-amber-950/30 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-900/40 cursor-pointer transition-colors font-sans"
                            >
                              {copiedLink ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                              <span>{copiedLink ? "Link Copied!" : "Copy Fresh Reschedule Link"}</span>
                            </button>
                          )}
                        </>
                      ) : (
                        <p className="text-zinc-500 italic text-[11px] py-4 text-center font-sans">Prospect is active/scheduled — not enrolled in Win-Back recovery.</p>
                      )}
                      <Link
                        href={`/dashboard/engagements/${engagementId}/skills/win-back`}
                        className="inline-flex items-center gap-1.5 text-[11px] font-mono text-sky-400 hover:underline pt-1"
                      >
                        <span>View full Win-Back history for this client</span>
                        <ExternalLink size={11} />
                      </Link>
                    </div>
                  )}
                </>
              ) : selectedDayActivity.length > 0 ? (
                <div className="py-6 space-y-2 font-sans">
                  <p className="text-[11px] text-zinc-500 text-center font-sans">
                    No call today, but {selectedDayActivity.length} other skill event{selectedDayActivity.length === 1 ? "" : "s"} happened — see the Skill Activity strip above.
                  </p>
                  <div className="flex items-center justify-center gap-2 pt-1">
                    {Array.from(new Set(selectedDayActivity.map((e) => e.skill))).map((s) => (
                      <Link
                        key={s}
                        href={`/dashboard/engagements/${engagementId}/skills/${s}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-[11px] text-zinc-300 hover:border-zinc-700 transition-colors"
                      >
                        <SquishySkillBadge skill={s} size={13} enabled={true} />
                        {ACTIVITY_SKILL_LABEL[s]}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-zinc-500 space-y-2 font-sans">
                  <Clock size={24} className="mx-auto text-zinc-600" />
                  <p className="text-xs font-sans">No call or skill activity for this day.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. Master List View (Chronological Multi-Skill Audit Trail) */}
      {mode === "list" && !roster.loading && (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl font-sans">
          <table className="w-full text-left text-xs font-sans">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/60 text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
                <th className="px-4 py-2.5">Date & Time</th>
                <th className="px-4 py-2.5">Skill</th>
                <th className="px-4 py-2.5">Prospect</th>
                <th className="px-4 py-2.5">Event</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-sans">
              {unifiedListRows.map((row) => (
                <tr
                  key={row.key}
                  onClick={row.onSelect}
                  className="hover:bg-zinc-900/40 cursor-pointer transition-colors font-sans"
                >
                  <td className="px-4 py-3 font-mono text-zinc-300 whitespace-nowrap">
                    {new Date(row.occurredAt).toLocaleDateString()} {timeStr(row.occurredAt)}
                  </td>
                  <td className="px-4 py-3">
                    <SquishySkillBadge skill={row.skill} size={18} enabled={true} />
                  </td>
                  <td className="px-4 py-3 font-bold text-white font-sans">
                    {row.prospectName ?? row.prospectEmail ?? <span className="text-zinc-600 font-normal font-mono">—</span>}
                    {row.prospectName && row.prospectEmail && (
                      <span className="block text-[11px] font-normal text-zinc-500 font-mono">{row.prospectEmail}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-sans text-zinc-300">
                    {row.title}
                    {row.detail && <span className="block text-[11px] text-zinc-500 font-mono">{row.detail}</span>}
                  </td>
                  <td className="px-4 py-3 font-sans">
                    <StatusPill tone={row.tone} className="capitalize">{row.statusLabel}</StatusPill>
                  </td>
                </tr>
              ))}
              {unifiedListRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-zinc-500 font-sans text-xs">
                    No calls or skill activity in this month{filterText ? " matching your search" : ""}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 4. DYNAMIC PIPELINE BOARD VIEW (With Pipeline Lenses) */}
      {mode === "board" && !roster.loading && (
        <div className="space-y-3 font-sans">
          {/* LENS SWITCHER TOOLBAR */}
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5 px-1 font-sans">
            <div className="flex items-center gap-1.5 font-sans">
              <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">Pipeline Lens:</span>
              <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-xl border border-zinc-800 font-sans text-xs">
                {([
                  ["all", "All Automations"],
                  ["pile_on", "⚡ Pile-On"],
                  ["win_back", "🔄 Win-Back"],
                  ["leak_map", "🔍 Leak-Map"],
                ] as const).map(([lens, label]) => (
                  <button
                    key={lens}
                    type="button"
                    onClick={() => setBoardLens(lens)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg font-semibold text-[11px] transition-colors cursor-pointer font-sans",
                      boardLens === lens ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-200"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* LENS 1: PILE-ON SPEED-TO-LEAD PIPELINE */}
          {boardLens === "pile_on" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-sans">
              {(["newly_booked", "active_sequence", "sequence_complete", "call_today"] as PileOnStage[]).map((stage) => {
                const stageItems = pileOn.data.filter((i) => i.stage === stage);
                return (
                  <div key={stage} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 space-y-2 font-sans">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2 px-1 font-sans">
                      <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider font-sans">{stage.replace("_", " ")}</span>
                      <span className="rounded-md bg-zinc-900 px-2 py-0.5 text-[10px] font-mono font-bold text-zinc-400">{stageItems.length}</span>
                    </div>
                    <div className="space-y-2 max-h-[500px] overflow-y-auto font-sans">
                      {stageItems.map((item) => (
                        <div key={item.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 space-y-1 font-sans">
                          <span className="font-bold text-white text-xs block truncate font-sans">{item.prospectName ?? item.prospectEmail}</span>
                          <span className="block text-[10.5px] font-mono text-zinc-400 truncate">{item.prospectEmail}</span>
                          <StatusPill tone="info" className="mt-1">
                            {item.touchesSent}/{item.touchesTotal} SMS Touches
                          </StatusPill>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* LENS 2: WIN-BACK RECOVERY CADENCE PIPELINE */}
          {boardLens === "win_back" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 font-sans">
              {(["active", "rebooked", "reply_exited", "lost", "manual_override", "corrected"] as WinBackEnrollmentStatus[]).map((status) => {
                const statusItems = winBack.data.filter((i) => i.status === status);
                return (
                  <div key={status} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 space-y-2 font-sans">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2 px-1 font-sans">
                      <span className="text-[11px] font-bold text-zinc-200 uppercase tracking-wider font-sans">{status.replace("_", " ")}</span>
                      <span className="rounded-md bg-zinc-900 px-1.5 py-0.5 text-[10px] font-mono font-bold text-zinc-400">{statusItems.length}</span>
                    </div>
                    <div className="space-y-2 max-h-[500px] overflow-y-auto font-sans">
                      {statusItems.map((item) => (
                        <div key={item.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-2.5 space-y-1 font-sans">
                          <span className="font-bold text-white text-xs block truncate font-sans">{item.prospectName ?? item.prospectEmail}</span>
                          <span className="block text-[10px] font-mono text-zinc-400">{item.touchesSent}/{item.touchesTotal} touches</span>
                          {item.nextTouchAt && (
                            <span className="block text-[9.5px] font-mono text-amber-400">
                              Next: {new Date(item.nextTouchAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* LENS 3: LEAK-MAP AUDIT SEVERITY PIPELINE */}
          {boardLens === "leak_map" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-sans">
              {([
                { severity: "high" as const, tone: "danger" as const },
                { severity: "medium" as const, tone: "warning" as const },
                { severity: "low" as const, tone: "info" as const },
                { severity: "none" as const, tone: "neutral" as const },
              ]).map(({ severity, tone }) => {
                const audits = activityAll.data.filter((e) => e.skill === "leak-map" && e.tone === tone);
                return (
                  <div key={severity} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 space-y-2 font-sans">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2 px-1 font-sans">
                      <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider font-sans">{severity === "none" ? "Clean" : `${severity} severity`}</span>
                      <span className="rounded-md bg-zinc-900 px-2 py-0.5 text-[10px] font-mono font-bold text-zinc-400">{audits.length}</span>
                    </div>
                    <div className="space-y-2 max-h-[500px] overflow-y-auto font-sans">
                      {audits.map((item) => (
                        <div key={item.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 space-y-1 font-sans">
                          <span className="font-bold text-white text-xs block capitalize font-sans">{item.title}</span>
                          <span className="block text-[10px] font-mono text-zinc-400">
                            {new Date(item.occurredAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                          <StatusPill tone={item.tone} className="mt-1">
                            {item.detail}
                          </StatusPill>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* LENS 4: ALL AUTOMATIONS OVERVIEW PIPELINE */}
          {boardLens === "all" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 font-sans">
              {[
                {
                  id: "newly_booked" as const,
                  label: "Newly Booked",
                  color: "border-sky-800/40",
                  filter: (e: EnrichedEntry) => !e.pileOnData && e.status === "scheduled",
                },
                {
                  id: "active_sequence" as const,
                  label: "Pile-On Active",
                  color: "border-amber-800/40",
                  filter: (e: EnrichedEntry) => e.pileOnData?.stage === "active_sequence",
                },
                {
                  id: "briefed" as const,
                  label: "Briefed & Ready",
                  color: "border-emerald-800/40",
                  filter: (e: EnrichedEntry) => e.status === "brief_delivered" && !e.winBackData,
                },
                {
                  id: "win_back" as const,
                  label: "Win-Back Active",
                  color: "border-indigo-800/40",
                  filter: (e: EnrichedEntry) => e.winBackData?.status === "active",
                },
              ].map((col) => {
                const colEntries = filteredEntries.filter(col.filter);
                return (
                  <div key={col.id} className={cn("rounded-2xl border bg-zinc-950 p-3 space-y-2 font-sans", col.color)}>
                    <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2 px-1 font-sans">
                      <span className="text-xs font-bold text-zinc-200 font-sans">{col.label}</span>
                      <span className="rounded-md bg-zinc-900 px-2 py-0.5 text-[10px] font-mono font-bold text-zinc-400">{colEntries.length}</span>
                    </div>
                    <div className="space-y-2 max-h-[500px] overflow-y-auto font-sans">
                      {colEntries.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => {
                            setSelectedEntryId(entry.id);
                            setSelectedDate(new Date(entry.callTime));
                            setMode("day");
                          }}
                          className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-900/90 p-3 space-y-1 hover:border-zinc-700 transition-all cursor-pointer font-sans"
                        >
                          <span className="font-bold text-white text-xs block truncate font-sans">{entry.prospectName ?? "Unnamed"}</span>
                          <span className="block text-[10.5px] font-mono text-zinc-400 truncate">{entry.prospectEmail}</span>
                          <span className="block text-[10px] font-mono text-zinc-500">{timeStr(entry.callTime)}</span>
                          {entry.prospectPhone && (
                            <span className="block text-[10px] font-mono text-zinc-500">{entry.prospectPhone}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}