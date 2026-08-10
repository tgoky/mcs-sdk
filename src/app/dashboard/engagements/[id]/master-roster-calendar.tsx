// src/app/dashboard/engagements/[id]/master-roster-calendar.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  Sparkles,
  Building2,
  FileText,
  Send,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/app/dashboard/runs/[id]/_shared/status-pill";
import { getDaysInMonthGrid, dateKey, timeStr } from "@/app/dashboard/runs/[id]/_shared/calendar-grid";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import type { RosterEntry } from "@/app/api/engagements/[id]/roster/route";
import type { PileOnPipelineItem } from "@/app/api/engagements/[id]/pile-on-pipeline/route";
import type { WinBackPipelineItem } from "@/app/api/engagements/[id]/win-back-pipeline/route";
import type { AuditHistoryItem, ScheduledAudit, ActiveAlertItem } from "@/app/api/engagements/[id]/leak-map-schedule/route";

type ViewMode = "month" | "day" | "list" | "board";

const HOURS = Array.from({ length: 15 }, (_, i) => i + 8); // 8:00 AM to 10:00 PM

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
    <div className="flex items-center justify-between rounded-xl border border-rose-800/50 bg-rose-950/20 px-4 py-2.5 text-xs text-rose-300">
      <span>{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg border border-rose-700 bg-rose-900/50 px-2.5 py-1 font-semibold text-rose-200 hover:bg-rose-800 cursor-pointer"
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
  const [filterText, setFilterText] = useState("");
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeTab, setActiveTab] = useState<"brief" | "pile_on" | "win_back">("brief");

  // Per-Stream State
  const [roster, setRoster] = useState<StreamState<RosterEntry>>(emptyStream());
  const [pileOn, setPileOn] = useState<StreamState<PileOnPipelineItem>>(emptyStream());
  const [winBack, setWinBack] = useState<StreamState<WinBackPipelineItem>>(emptyStream());
  const [leakMap, setLeakMap] = useState<{
    history: AuditHistoryItem[];
    scheduled: ScheduledAudit[];
    alerts: ActiveAlertItem[];
  } | null>(null);
  const [leakMapLoading, setLeakMapLoading] = useState(false);
  const [leakMapError, setLeakMapError] = useState<string | null>(null);

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

  // Lazy Fetch: Leak-Map
  const fetchLeakMap = useCallback(async () => {
    if (leakMap !== null || leakMapLoading) return;
    setLeakMapLoading(true);
    setLeakMapError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/leak-map-schedule`);
      if (!res.ok) throw new Error(`Leak-map fetch failed: ${res.status}`);
      const data = await res.json();
      setLeakMap(data);
      setLeakMapLoading(false);
    } catch (err) {
      setLeakMapError(err instanceof Error ? err.message : "Failed to load audit history");
      setLeakMapLoading(false);
    }
  }, [engagementId, leakMap, leakMapLoading]);

  // Effects
  useEffect(() => {
    fetchRoster();
    setPileOn(emptyStream());
    setWinBack(emptyStream());
    setLeakMap(null);
  }, [fetchRoster]);

  useEffect(() => {
    if (mode === "day" || mode === "board") {
      fetchPileOn();
      fetchWinBack();
    }
    if (mode === "day") {
      fetchLeakMap();
    }
  }, [mode, fetchPileOn, fetchWinBack, fetchLeakMap]);

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

  const dayMetrics = useMemo(() => {
    const metrics: Record<string, {
      totalCalls: number;
      pileOnActive: number;
      winBackActive: number;
      briefDelivered: number;
    }> = {};

    for (const entry of filteredEntries) {
      const k = dateKey(new Date(entry.callTime));
      if (!metrics[k]) {
        metrics[k] = { totalCalls: 0, pileOnActive: 0, winBackActive: 0, briefDelivered: 0 };
      }
      metrics[k].totalCalls++;
      if (entry.pileOnData) metrics[k].pileOnActive++;
      if (entry.winBackData?.status === "active") metrics[k].winBackActive++;
      if (entry.status === "brief_delivered") metrics[k].briefDelivered++;
    }

    return metrics;
  }, [filteredEntries]);

  const selectedDayKey = dateKey(selectedDate);
  const selectedDayEntries = entriesByDate[selectedDayKey] ?? [];

  // Auto-select the first call when switching days
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

  const selectedDayAudits = useMemo(() => {
    if (!leakMap) return [];
    return leakMap.history.filter((a) => dateKey(new Date(a.createdAt)) === selectedDayKey);
  }, [leakMap, selectedDayKey]);

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
      {pileOn.error && (mode === "day" || mode === "board") && (
        <ErrorBanner message={pileOn.error} onRetry={fetchPileOn} />
      )}
      {winBack.error && (mode === "day" || mode === "board") && (
        <ErrorBanner message={winBack.error} onRetry={fetchWinBack} />
      )}
      {leakMapError && mode === "day" && (
        <ErrorBanner message={leakMapError} onRetry={fetchLeakMap} />
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-2 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-500" />
            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Search bookings, emails, or phone..."
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 py-1.5 pl-8 pr-2.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-700 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={fetchRoster}
            disabled={roster.loading}
            className="flex items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <RefreshCw size={13} className={cn(roster.loading && "animate-spin")} />
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-xl bg-zinc-900 p-1 border border-zinc-800 text-xs">
          {([["month", CalendarIcon, "Month"], ["day", Clock, "Day View"], ["list", List, "List"], ["board", LayoutGrid, "Board"]] as const).map(
            ([viewMode, Icon, label]) => (
              <button
                key={viewMode}
                type="button"
                onClick={() => setMode(viewMode)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold transition-colors cursor-pointer",
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
        <div className="grid grid-cols-7 gap-px rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="min-h-[105px] bg-zinc-950 animate-pulse" />
          ))}
        </div>
      )}

      {/* 1. Month View */}
      {mode === "month" && !roster.loading && (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl">
          <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer">
                <ChevronLeft size={15} />
              </button>
              <button type="button" onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer">
                <ChevronRight size={15} />
              </button>
              <h3 className="text-sm font-bold text-white min-w-[130px]">{monthName} {year}</h3>
              <button
                type="button"
                onClick={() => { setCurrentDate(new Date()); setSelectedDate(new Date()); }}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-[11px] font-semibold text-zinc-200 hover:bg-zinc-700 cursor-pointer"
              >
                Today
              </button>
            </div>
            <div className="text-xs font-mono text-zinc-500">
              {roster.data.length} booking{roster.data.length === 1 ? "" : "s"}
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-zinc-800 bg-zinc-900/40 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="border-r border-zinc-800/60 py-2 last:border-r-0">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 auto-rows-fr bg-zinc-950">
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
                    "group relative flex min-h-[105px] flex-col justify-between border-b border-r border-zinc-800/60 p-2 text-left transition-all hover:bg-zinc-900/60 cursor-pointer",
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

                  <div className="my-auto py-1">
                    {metric && metric.totalCalls > 0 ? (
                      <div className="rounded-lg bg-sky-950/40 border border-sky-800/50 px-2 py-1 text-sky-200">
                        <span className="text-[11px] font-bold block leading-none">
                          {metric.totalCalls} call{metric.totalCalls === 1 ? "" : "s"}
                        </span>
                        <span className="text-[9.5px] text-sky-400/80 font-mono mt-0.5 block">
                          {metric.briefDelivered}/{metric.totalCalls} briefed
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-zinc-600 font-mono italic block">No calls</span>
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* LEFT 7 COLUMNS: HOURLY TIMELINE GRID */}
          <div className="lg:col-span-7 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-4 py-3">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setSelectedDate(new Date(selectedDate.getTime() - 86400000))} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer">
                  <ChevronLeft size={15} />
                </button>
                <button type="button" onClick={() => setSelectedDate(new Date(selectedDate.getTime() + 86400000))} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer">
                  <ChevronRight size={15} />
                </button>
                <h3 className="text-sm font-bold text-white">
                  {selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                </h3>
              </div>

              {/* COMPACT ACTIVE SUMMARY STRIP (REPLACES STANDALONE DAY TELEMETRY) */}
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

            {/* System Events Strip (Leak-Map) */}
            {selectedDayAudits.length > 0 && (
              <div className="border-b border-zinc-800/80 bg-zinc-900/30 p-2 space-y-1.5">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 block px-1">
                  System Events
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedDayAudits.map((audit) => (
                    <div key={audit.id} className="flex items-center gap-1.5 rounded-lg border border-emerald-900/50 bg-emerald-950/30 px-2 py-1 text-xs text-emerald-300">
                      <SquishySkillBadge skill="leak-map" size={14} enabled={true} />
                      <span className="font-bold">{audit.runType} Audit</span>
                      <StatusPill tone={audit.overallSeverity === "high" ? "danger" : audit.overallSeverity === "medium" ? "warning" : "neutral"}>
                        {audit.topIssueCount} issue{audit.topIssueCount === 1 ? "" : "s"}
                      </StatusPill>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Hourly Timeline */}
            <div className="divide-y divide-zinc-900 overflow-y-auto max-h-[620px] p-2">
              {HOURS.map((hour) => {
                const hourEntries = selectedDayEntries.filter((e) => new Date(e.callTime).getHours() === hour);
                return (
                  <div key={hour} className="flex min-h-[60px] gap-3 py-1.5 border-b border-zinc-900/80 last:border-b-0">
                    <span className="w-14 shrink-0 font-mono text-[11px] text-zinc-500 text-right pt-0.5">
                      {hour.toString().padStart(2, "0")}:00
                    </span>
                    <div className="flex-1 space-y-1.5">
                      {hourEntries.map((entry) => {
                        const isSelected = selectedEntry?.id === entry.id;
                        return (
                          <button
                            key={entry.id}
                            type="button"
                            onClick={() => setSelectedEntryId(entry.id)}
                            className={cn(
                              "w-full rounded-xl border p-2.5 text-left transition-all cursor-pointer flex items-start justify-between gap-2 shadow-xs",
                              isSelected
                                ? "border-sky-500 bg-sky-950/40 ring-1 ring-sky-500/50"
                                : "border-sky-800/60 bg-sky-950/20 hover:border-sky-700"
                            )}
                          >
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white text-xs">{entry.prospectName ?? "Unnamed"}</span>
                                <span className="text-[10px] font-mono text-sky-400 bg-sky-950 px-1.5 py-0.5 rounded border border-sky-800/50">
                                  {timeStr(entry.callTime)}
                                </span>
                              </div>
                              <p className="text-[11px] font-mono text-zinc-400 truncate">{entry.prospectEmail}</p>

                              <div className="flex flex-wrap gap-1 pt-1">
                                <StatusPill tone={entry.status === "brief_delivered" ? "success" : entry.status === "brief_failed" ? "danger" : "neutral"}>
                                  Brief: {entry.status.replace("_", " ")}
                                </StatusPill>
                                {entry.pileOnData && (
                                  <StatusPill tone="info">
                                    Pile-On: {entry.pileOnData.stage.replace("_", " ")}
                                  </StatusPill>
                                )}
                                {entry.winBackData && (
                                  <StatusPill tone="warning">
                                    Win-Back: {entry.winBackData.status.replace("_", " ")}
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
                              className="rounded-lg border border-zinc-800 bg-zinc-900 p-1.5 text-zinc-400 hover:text-white shrink-0"
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
          <div className="lg:col-span-5 space-y-3">
            {/* MINI CALENDAR NAVIGATOR */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 space-y-2 shadow-lg">
              <span className="text-[11px] font-bold text-white block px-1">{monthName} {year}</span>
              <div className="grid grid-cols-7 text-center text-[9px] font-mono text-zinc-500 font-bold uppercase">
                {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <div key={i}>{d}</div>)}
              </div>
              <div className="grid grid-cols-7 text-center text-xs gap-1">
                {gridDays.map(({ date, isCurrentMonth }, idx) => {
                  const isSelected = dateKey(date) === selectedDayKey;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedDate(date)}
                      className={cn(
                        "h-6 w-6 mx-auto flex items-center justify-center rounded-full font-mono text-[10px] transition-colors cursor-pointer",
                        isSelected ? "bg-emerald-500 text-zinc-950 font-bold" : isCurrentMonth ? "text-zinc-300 hover:bg-zinc-800" : "text-zinc-700"
                      )}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* FULL PROSPECT INSPECTOR PANEL (REPLACES STATIC TELEMETRY) */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-4 shadow-xl">
              {selectedEntry ? (
                <>
                  {/* PROSPECT HEADER */}
                  <div className="space-y-2 border-b border-zinc-800 pb-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-sky-400 font-bold flex items-center gap-1">
                        <Building2 size={12} /> {selectedEntry.bookingPlatform ?? "Calendar"}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyText(selectedEntry.prospectEmail ?? "", "email")}
                        className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:text-white"
                      >
                        {copiedEmail ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                        <span>Copy Email</span>
                      </button>
                    </div>

                    <h4 className="text-base font-bold text-white">{selectedEntry.prospectName ?? "Unnamed Prospect"}</h4>

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

                  {/* MULTI-SKILL TAB HEADERS */}
                  <div className="flex items-center gap-1 rounded-xl bg-zinc-900 p-1 border border-zinc-800 text-xs">
                    <button
                      type="button"
                      onClick={() => setActiveTab("brief")}
                      className={cn(
                        "flex-1 py-1 rounded-lg font-semibold transition-colors cursor-pointer text-center text-[11px]",
                        activeTab === "brief" ? "bg-zinc-800 text-white shadow-xs" : "text-zinc-400 hover:text-zinc-200"
                      )}
                    >
                      Brief
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("pile_on")}
                      className={cn(
                        "flex-1 py-1 rounded-lg font-semibold transition-colors cursor-pointer text-center text-[11px]",
                        activeTab === "pile_on" ? "bg-zinc-800 text-white shadow-xs" : "text-zinc-400 hover:text-zinc-200"
                      )}
                    >
                      Pile-On
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("win_back")}
                      className={cn(
                        "flex-1 py-1 rounded-lg font-semibold transition-colors cursor-pointer text-center text-[11px]",
                        activeTab === "win_back" ? "bg-zinc-800 text-white shadow-xs" : "text-zinc-400 hover:text-zinc-200"
                      )}
                    >
                      Win-Back
                    </button>
                  </div>

                  {/* TAB 1: PRE-CALL BRIEF */}
                  {activeTab === "brief" && (
                    <div className="space-y-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[10.5px] font-mono text-zinc-500 uppercase">Status & Channel</span>
                        <StatusPill tone={selectedEntry.status === "brief_delivered" ? "success" : selectedEntry.status === "brief_failed" ? "danger" : "neutral"}>
                          {selectedEntry.status.replace("_", " ")}
                        </StatusPill>
                      </div>

                      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 space-y-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-zinc-400 font-semibold">Delivered via</span>
                          <span className="font-mono text-white capitalize">{selectedEntry.destinationDelivered ?? "Slack"}</span>
                        </div>

                        <div className="pt-2 border-t border-zinc-800/80 space-y-1">
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
                    </div>
                  )}

                  {/* TAB 2: PILE-ON SEQUENCE */}
                  {activeTab === "pile_on" && (
                    <div className="space-y-3 text-xs">
                      {selectedEntry.pileOnData ? (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-[10.5px] font-mono text-zinc-500 uppercase">Sequence Progress</span>
                            <StatusPill tone="info">
                              {selectedEntry.pileOnData.touchesSent}/{selectedEntry.pileOnData.touchesTotal} SMS Touches
                            </StatusPill>
                          </div>

                          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 space-y-2">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-zinc-400 font-semibold">Email 1 Method</span>
                              <span className="font-mono text-white capitalize">{selectedEntry.pileOnData.sentVia ?? "hybrid"}</span>
                            </div>
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-zinc-400 font-semibold">Current Stage</span>
                              <span className="font-mono text-amber-400 capitalize">{selectedEntry.pileOnData.stage.replace("_", " ")}</span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <p className="text-zinc-500 italic text-[11px] py-4 text-center">No active Pile-On speed-to-lead sequence for this booking.</p>
                      )}
                    </div>
                  )}

                  {/* TAB 3: WIN-BACK CADENCE */}
                  {activeTab === "win_back" && (
                    <div className="space-y-3 text-xs">
                      {selectedEntry.winBackData ? (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-[10.5px] font-mono text-zinc-500 uppercase">Recovery Status</span>
                            <StatusPill tone="warning" className="capitalize">
                              {selectedEntry.winBackData.status}
                            </StatusPill>
                          </div>

                          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 space-y-2">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-zinc-400 font-semibold">Touches Sent</span>
                              <span className="font-mono text-white">{selectedEntry.winBackData.touchesSent} / {selectedEntry.winBackData.touchesTotal}</span>
                            </div>
                            {selectedEntry.winBackData.exitReason && (
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-zinc-400 font-semibold">Exit Reason</span>
                                <span className="font-mono text-zinc-300">{selectedEntry.winBackData.exitReason}</span>
                              </div>
                            )}
                          </div>

                          {selectedEntry.winBackData.freshRescheduleLink && (
                            <button
                              type="button"
                              onClick={() => handleCopyText(selectedEntry.winBackData!.freshRescheduleLink!, "link")}
                              className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-amber-800/50 bg-amber-950/30 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-900/40 cursor-pointer transition-colors"
                            >
                              {copiedLink ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                              <span>{copiedLink ? "Link Copied!" : "Copy Fresh Reschedule Link"}</span>
                            </button>
                          )}
                        </>
                      ) : (
                        <p className="text-zinc-500 italic text-[11px] py-4 text-center">Prospect is active/scheduled — not enrolled in Win-Back recovery.</p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="py-12 text-center text-zinc-500 space-y-2">
                  <Clock size={24} className="mx-auto text-zinc-600" />
                  <p className="text-xs">No call selected for this day.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. List View */}
      {mode === "list" && !roster.loading && (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/60 text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
                <th className="px-4 py-2.5">Date & Time</th>
                <th className="px-4 py-2.5">Prospect</th>
                <th className="px-4 py-2.5">Phone</th>
                <th className="px-4 py-2.5">Brief</th>
                <th className="px-4 py-2.5">Pile-On</th>
                <th className="px-4 py-2.5">Win-Back</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filteredEntries.map((entry) => (
                <tr
                  key={entry.id}
                  onClick={() => {
                    setSelectedEntryId(entry.id);
                    setSelectedDate(new Date(entry.callTime));
                    setMode("day");
                  }}
                  className="hover:bg-zinc-900/40 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-zinc-300 whitespace-nowrap">
                    {new Date(entry.callTime).toLocaleDateString()} {timeStr(entry.callTime)}
                  </td>
                  <td className="px-4 py-3 font-bold text-white">
                    {entry.prospectName ?? "Unnamed"}
                    <span className="block text-[11px] font-normal text-zinc-500 font-mono">{entry.prospectEmail}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-zinc-400">
                    {entry.prospectPhone ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill tone={entry.status === "brief_delivered" ? "success" : entry.status === "brief_failed" ? "danger" : "neutral"}>
                      {entry.status.replace("_", " ")}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-3">
                    {entry.pileOnData ? (
                      <StatusPill tone="info">{entry.pileOnData.stage.replace("_", " ")}</StatusPill>
                    ) : pileOn.loading ? (
                      <span className="text-zinc-600 font-mono text-[10px]">Loading...</span>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {entry.winBackData ? (
                      <StatusPill tone="warning">{entry.winBackData.status.replace("_", " ")}</StatusPill>
                    ) : winBack.loading ? (
                      <span className="text-zinc-600 font-mono text-[10px]">Loading...</span>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 4. Board View */}
      {mode === "board" && !roster.loading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
              <div key={col.id} className={cn("rounded-2xl border bg-zinc-950 p-3 space-y-2", col.color)}>
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2 px-1">
                  <span className="text-xs font-bold text-zinc-200">{col.label}</span>
                  <span className="rounded-md bg-zinc-900 px-2 py-0.5 text-[10px] font-mono font-bold text-zinc-400">{colEntries.length}</span>
                </div>
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {colEntries.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => {
                        setSelectedEntryId(entry.id);
                        setSelectedDate(new Date(entry.callTime));
                        setMode("day");
                      }}
                      className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-900/90 p-3 space-y-1 hover:border-zinc-700 transition-all cursor-pointer"
                    >
                      <span className="font-bold text-white text-xs block truncate">{entry.prospectName ?? "Unnamed"}</span>
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
  );
}