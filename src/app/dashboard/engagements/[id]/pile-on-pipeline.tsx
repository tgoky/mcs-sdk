"use client";

// src/app/dashboard/engagements/[id]/pile-on-pipeline.tsx

import { useEffect, useMemo, useState, useCallback } from "react";
import { 
  ChevronLeft, 
  ChevronRight, 
  Search, 
  Mail, 
  CalendarX2, 
  Loader2, 
  ExternalLink, 
  PhoneCall, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  ChevronDown, 
  Sparkles,
  Calendar as CalendarIcon,
  List as ListIcon,
  LayoutGrid,
  Copy,
  Check,
  Clock
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RunViewMode } from "../../runs/[id]/_shared/view-switcher";
import { getDaysInMonthGrid, dateKey } from "../../runs/[id]/_shared/calendar-grid";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import { RunActivityPanel } from "../../runs/[id]/_shared/run-activity-panel";
import { classifyRunError } from "@/lib/error-classification";
import { sentViaLabel } from "@/lib/copy";
import type { PileOnPipelineItem, PileOnStage, PileOnWeeklyTrend } from "@/app/api/engagements/[id]/pile-on-pipeline/route";

const STAGE_META: Record<PileOnStage, { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" }> = {
  newly_booked: { label: "Newly booked", tone: "info" },
  active_sequence: { label: "Active sequence", tone: "warning" },
  sequence_complete: { label: "Sequence complete", tone: "success" },
  call_today: { label: "Call today", tone: "danger" },
};
const BOARD_COLUMNS: PileOnStage[] = ["newly_booked", "active_sequence", "sequence_complete", "call_today"];

type PileOnCalendarKind = "booked" | "call";

function StatusPill({
  tone,
  children,
  className,
}: {
  tone: "success" | "warning" | "danger" | "info" | "neutral" | string;
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

export function PileOnPipeline({ engagementId }: { engagementId: string }) {
  const [mode, setMode] = useState<RunViewMode>("calendar");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [items, setItems] = useState<PileOnPipelineItem[]>([]);
  const [weeklyTrend, setWeeklyTrend] = useState<PileOnWeeklyTrend | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [showRunActivity, setShowRunActivity] = useState(false);

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
      if (loadedItems.length > 0 && !selectedId) {
        setSelectedId(loadedItems[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pipeline.");
    } finally {
      setLoading(false);
    }
  }, [engagementId, selectedId]);

  useEffect(() => {
    load();
  }, [load]);

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

  const board = useMemo(() => {
    const cols: Record<PileOnStage, PileOnPipelineItem[]> = { newly_booked: [], active_sequence: [], sequence_complete: [], call_today: [] };
    for (const i of filtered) cols[i.stage].push(i);
    for (const key of Object.keys(cols) as PileOnStage[]) {
      cols[key].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return cols;
  }, [filtered]);

  const byDay = useMemo(() => {
    const map = new Map<string, { item: PileOnPipelineItem; kind: PileOnCalendarKind }[]>();
    const add = (iso: string, item: PileOnPipelineItem, kind: PileOnCalendarKind) => {
      const k = dateKey(iso);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push({ item, kind });
    };
    for (const i of filtered) {
      add(i.createdAt, i, "booked");
      if (i.callTime) add(i.callTime, i, "call");
    }
    return map;
  }, [filtered]);

  const listByDate = useMemo(() => {
    const map = new Map<string, PileOnPipelineItem[]>();
    for (const item of filtered) {
      const k = dateKey(item.createdAt);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(item);
    }
    return Array.from(map.entries()).sort(
      ([a], [b]) => new Date(b).getTime() - new Date(a).getTime()
    );
  }, [filtered]);

  const gridDays = useMemo(() => getDaysInMonthGrid(year, month), [year, month]);
  const monthName = currentDate.toLocaleString("default", { month: "long" });
  const selected = useMemo(() => items.find((i) => i.id === selectedId) ?? filtered[0] ?? null, [items, selectedId, filtered]);
  const callTodayCount = filtered.filter((i) => i.stage === "call_today").length;

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
              onClick={() => setCurrentDate(new Date())}
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

          {!loading && callTodayCount > 0 && (
            <span className="flex items-center gap-1 text-xs font-semibold text-rose-950 dark:text-rose-200 bg-[#ffcfd2] dark:bg-rose-950/60 px-2.5 py-1 rounded-full shrink-0">
              <PhoneCall size={12} /> {callTodayCount} call{callTodayCount === 1 ? "" : "s"} today
            </span>
          )}
        </div>

        {/* Theme-aware view switcher */}
        <div className="flex items-center gap-1 rounded-xl bg-zinc-200/60 dark:bg-zinc-900 p-1 border border-zinc-200 dark:border-zinc-800 text-xs font-sans">
          {([["calendar", CalendarIcon, "Calendar"], ["list", ListIcon, "List"], ["board", LayoutGrid, "Board"]] as const).map(
            ([viewMode, Icon, label]) => (
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
            )
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300 dark:border-rose-800/50 bg-rose-100 dark:bg-rose-950/20 px-3 py-2 text-xs text-rose-800 dark:text-rose-300 font-sans">{error}</div>
      )}

      {/* 1. BOARD VIEW */}
      {mode === "board" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-sans">
          {BOARD_COLUMNS.map((stage) => (
            <div key={stage} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 overflow-hidden shadow-sm">
              <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/80 dark:bg-zinc-900/60 px-3 py-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 font-sans">{STAGE_META[stage].label}</span>
                <span className="rounded-md bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 text-[10px] font-mono font-bold text-zinc-700 dark:text-zinc-400">{board[stage].length}</span>
              </div>
              <div className="flex flex-col gap-1.5 p-2 min-h-[80px] max-h-[500px] overflow-y-auto">
                {board[stage].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className="flex flex-col gap-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 p-2.5 text-left text-[11px] hover:border-zinc-300 dark:hover:border-zinc-700 cursor-pointer transition-all font-sans shadow-xs"
                  >
                    <div className="flex items-center justify-between gap-1 w-full">
                      <span className="truncate font-bold text-zinc-900 dark:text-white font-sans">{item.prospectName ?? item.prospectEmail}</span>
                      <span className="font-mono text-[9px] text-zinc-400 shrink-0">
                        {new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        {item.callTime && ` · ${formatTimeBadge(item.callTime)}`}
                      </span>
                    </div>
                    <span className="font-mono text-[9.5px] text-zinc-500 dark:text-zinc-400">
                      {item.touchesTotal > 0 ? `${item.touchesSent}/${item.touchesTotal} SMS touches` : "No SMS sequence configured"}
                    </span>
                  </button>
                ))}
                {board[stage].length === 0 && (
                  <div className="flex items-center justify-center py-6 text-[10.5px] text-zinc-400 dark:text-zinc-600 font-sans">Nothing here</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 2. SPLIT-PANE LIST VIEW (LIST + PERSISTENT INSPECTOR PANEL) */}
      {mode === "list" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 font-sans">
          {/* LEFT 7 COLUMNS: LIST FEED WITH STICKY HEADERS */}
          <div className="lg:col-span-7 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 shadow-xl font-sans">
            {listByDate.length === 0 && !loading ? (
              <div className="flex flex-col items-center gap-2 py-12 text-zinc-400 dark:text-zinc-600 font-sans">
                <CalendarX2 size={22} />
                <span className="text-xs">No bookings yet.</span>
              </div>
            ) : (
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800/60 max-h-[620px] overflow-y-auto">
                {listByDate.map(([dateStr, dayItems]) => (
                  <div key={dateStr} className="space-y-0 font-sans">
                    {/* Sticky Day Header */}
                    <div className="sticky top-0 z-10 flex items-center justify-between bg-zinc-100/95 dark:bg-zinc-900/95 backdrop-blur-xs px-4 py-1.5 border-b border-zinc-200/80 dark:border-zinc-800/80 text-[10.5px] font-mono font-bold uppercase tracking-wider text-zinc-500">
                      <span>{formatDayHeader(dateStr)}</span>
                      <span className="text-zinc-400 font-normal">
                        {dayItems.length} booking{dayItems.length === 1 ? "" : "s"}
                      </span>
                    </div>

                    {/* Day Items Feed */}
                    <div className="divide-y divide-zinc-200/60 dark:divide-zinc-800/40">
                      {dayItems.map((item) => {
                        const isSelected = selected?.id === item.id;
                        const hasError = !!item.sendError;
                        const appointmentHour = formatTimeBadge(item.callTime ?? item.createdAt);

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setSelectedId(item.id)}
                            className={cn(
                              "flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors cursor-pointer font-sans border-0",
                              hasError && "bg-[#ffcfd2]/40 dark:bg-rose-950/30",
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
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT 5 COLUMNS: PERSISTENT PROSPECT INSPECTOR PANEL */}
          <div className="lg:col-span-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 p-4 space-y-4 shadow-xl font-sans">
            {selected ? (
              <>
                <div className="space-y-2 border-b border-zinc-200 dark:border-zinc-800 pb-3 font-sans">
                  <div className="flex items-center justify-between font-sans">
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

                  <h4 className="text-base font-bold text-zinc-900 dark:text-white font-sans">
                    {selected.prospectName ?? selected.prospectEmail}
                  </h4>

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
                          <span>Open full run details</span>
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
                <p className="text-xs font-sans">Select a lead from the list to inspect sequence details.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. CALENDAR VIEW WITH HIGH-VOLUME OVERFLOW & TIME BADGES */}
      {mode === "calendar" && (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 shadow-xl font-sans">
          <div className="grid grid-cols-7 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-900/40 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-500 font-sans">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="border-r border-zinc-200 dark:border-zinc-800/60 py-2 last:border-r-0">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 auto-rows-fr bg-[#f8f7fa] dark:bg-zinc-950 font-sans">
            {gridDays.map(({ date, isCurrentMonth }, idx) => {
              const k = dateKey(date);
              const dayItems = byDay.get(k) ?? [];

              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const cellDate = new Date(date);
              cellDate.setHours(0, 0, 0, 0);

              const isToday = cellDate.getTime() === today.getTime();
              const isPast = cellDate < today;

              return (
                <div key={idx} className={cn(
                  "flex min-h-[95px] flex-col border-b border-r border-zinc-200 dark:border-zinc-800/60 p-1.5 font-sans transition-all",
                  !isCurrentMonth && "bg-zinc-100/50 dark:bg-zinc-900/20 text-zinc-400 dark:text-zinc-600 opacity-40",
                  isCurrentMonth && isPast && "bg-zinc-200/35 dark:bg-zinc-900/60",
                  isCurrentMonth && !isPast && !isToday && "bg-white dark:bg-zinc-950",
                  isCurrentMonth && "hover:bg-zinc-200/60 dark:hover:bg-zinc-800/80"
                )}>
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
                    {dayItems.length > 0 && (
                      <div className="relative shrink-0">
                        <SquishySkillBadge skill="pile-on" size={16} enabled={true} />
                        <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-purple-500 text-[8px] font-bold text-zinc-950 font-mono">
                          {dayItems.length}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-1 space-y-1 overflow-hidden font-sans">
                    {/* Render capped top 2 items with appointment time badge */}
                    {dayItems.slice(0, 2).map(({ item, kind }, idx) => (
                      <button
                        key={`${item.id}-${kind}-${idx}`}
                        type="button"
                        onClick={() => setSelectedId(item.id)}
                        className="flex w-full flex-col gap-0.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 p-1.5 text-left text-[11px] font-sans hover:border-zinc-300 dark:hover:border-zinc-700 cursor-pointer shadow-xs"
                      >
                        <span className="truncate font-bold text-zinc-900 dark:text-white font-sans">
                          {item.prospectName ?? item.prospectEmail}
                        </span>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[9.5px] font-mono text-zinc-950 bg-[#ffcfd2] px-1 py-0.2 rounded font-bold border-0">
                            {formatTimeBadge(item.callTime ?? item.createdAt)}
                          </span>
                          <StatusPill tone={STAGE_META[item.stage].tone} className="w-fit">{STAGE_META[item.stage].label}</StatusPill>
                        </div>
                      </button>
                    ))}

                    {/* High Volume Overflow Pill */}
                    {dayItems.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setMode("list")}
                        className="w-full text-center py-1 text-[10px] font-bold font-mono text-zinc-700 dark:text-zinc-300 bg-zinc-200/60 dark:bg-zinc-800/80 rounded-md hover:bg-zinc-300/60 dark:hover:bg-zinc-700 cursor-pointer transition-colors"
                      >
                        +{dayItems.length - 2} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}