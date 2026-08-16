"use client";

// src/app/dashboard/engagements/[id]/pre-call-read-pipeline.tsx
//
// Same structural pattern as pile-on-pipeline.tsx / win-back-pipeline.tsx /
// leak-map-schedule.tsx: own Calendar/List/Board via ViewSwitcher, own
// month navigation independent of the master roster calendar. Reads
// GET /api/engagements/[id]/roster — Calendar fetches one month at a time
// (matches the route's indexed range-scan design), List/Board fetch
// ?all=1 for genuine full-engagement history, since that's what a
// per-client skill page is for.

import { useEffect, useMemo, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, Search, Mail, Phone, CalendarX2, Loader2, ExternalLink, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ViewSwitcher, type RunViewMode } from "../../runs/[id]/_shared/view-switcher";
import { StatusPill } from "../../runs/[id]/_shared/status-pill";
import { getDaysInMonthGrid, dateKey } from "../../runs/[id]/_shared/calendar-grid";
import { RunActivityPanel } from "../../runs/[id]/_shared/run-activity-panel";
import { bookingPlatformLabel, briefDestinationLabel, outcomeSourceLabel } from "@/lib/copy";
import { Sheet, SheetContent, SheetHeader, SheetBody, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import type { RosterEntry, RosterStatus } from "@/app/api/engagements/[id]/roster/route";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const STATUS_META: Record<RosterStatus, { label: string; tone: Tone }> = {
  scheduled: { label: "Scheduled", tone: "info" },
  brief_delivered: { label: "Brief delivered", tone: "success" },
  brief_failed: { label: "Brief failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};
const BOARD_COLUMNS: RosterStatus[] = ["scheduled", "brief_delivered", "brief_failed", "cancelled"];

// Mirrors pre-call-read-view.tsx's matchLabel() so the engagement-level
// roster and the single-run page describe identity verification the same
// way instead of each inventing their own wording.
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

export function PreCallReadPipeline({ engagementId }: { engagementId: string }) {
  const [mode, setMode] = useState<RunViewMode>("calendar");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthString = `${year}-${String(month + 1).padStart(2, "0")}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Calendar only ever needs the visible month; List/Board are meant
      // to show this client's whole Pre-Call Read history, so they opt
      // into the unbounded fetch instead.
      const query = mode === "calendar" ? `month=${monthString}` : `all=1`;
      const res = await fetch(`/api/engagements/${engagementId}/roster?${query}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Failed to load calls.");
      const body = await res.json();
      setEntries(body.entries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load calls.");
    } finally {
      setLoading(false);
    }
  }, [engagementId, mode, monthString]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!filterText.trim()) return entries;
    const q = filterText.toLowerCase();
    return entries.filter((e) => (e.prospectName ?? e.prospectEmail ?? "").toLowerCase().includes(q));
  }, [entries, filterText]);

  const board = useMemo(() => {
    const cols: Record<RosterStatus, RosterEntry[]> = { scheduled: [], brief_delivered: [], brief_failed: [], cancelled: [] };
    for (const e of filtered) cols[e.status].push(e);
    return cols;
  }, [filtered]);

  const byDay = useMemo(() => {
    const map = new Map<string, RosterEntry[]>();
    for (const e of filtered) {
      const k = dateKey(e.callTime);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    return map;
  }, [filtered]);

  const gridDays = useMemo(() => getDaysInMonthGrid(year, month), [year, month]);
  const monthName = currentDate.toLocaleString("default", { month: "long" });
  const selected = useMemo(() => entries.find((e) => e.id === selectedId) ?? null, [entries, selectedId]);
  const briefedCount = filtered.filter((e) => e.status === "brief_delivered").length;

  return (
    <div className="flex flex-col gap-3 font-sans antialiased">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div className="flex items-center gap-2.5">
          <SquishySkillBadge skill="pre-call-read" size={28} enabled={true} />
          <div>
            <h3 className="text-sm font-bold text-white font-sans">Pre-Call Read History</h3>
            <p className="text-[11px] text-zinc-500 font-sans mt-0.5">
              Every call this client has ever had, and whether the brief actually went out.
            </p>
          </div>
        </div>
        {!loading && (
          <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-400 shrink-0">
            {briefedCount}/{filtered.length} briefed
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-950 p-1.5 border border-zinc-800">
        <div className="relative w-64">
          <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-500" />
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Search prospect name..."
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-1.5 pl-8 pr-2.5 text-xs text-zinc-200 font-sans placeholder:text-zinc-500 focus:border-zinc-700 focus:outline-none"
          />
        </div>
        <ViewSwitcher value={mode} onChange={setMode} />
      </div>

      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300 font-sans">{error}</div>
      )}

      {mode === "board" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-sans">
          {BOARD_COLUMNS.map((status) => (
            <div key={status} className="rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden">
              <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-3 py-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 font-sans">{STATUS_META[status].label}</span>
                <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">{board[status].length}</span>
              </div>
              <div className="flex flex-col gap-1.5 p-2 min-h-[80px] max-h-[420px] overflow-y-auto">
                {board[status].map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setSelectedId(entry.id)}
                    className="flex flex-col gap-1 rounded-lg border border-zinc-800 bg-zinc-900/90 p-2 text-left text-[11px] hover:border-zinc-700 cursor-pointer transition-all font-sans"
                  >
                    <span className="truncate font-bold text-white font-sans">{entry.prospectName ?? entry.prospectEmail}</span>
                    <span className="font-mono text-[9.5px] text-zinc-500">
                      {new Date(entry.callTime).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  </button>
                ))}
                {board[status].length === 0 && (
                  <div className="flex items-center justify-center py-6 text-[10.5px] text-zinc-700 font-sans">Nothing here</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {mode === "list" && (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl font-sans">
          {filtered.length === 0 && !loading ? (
            <div className="flex flex-col items-center gap-2 py-12 text-zinc-600 font-sans">
              <CalendarX2 size={22} />
              <span className="text-xs">No calls yet.</span>
            </div>
          ) : (
            [...filtered]
              .sort((a, b) => new Date(b.callTime).getTime() - new Date(a.callTime).getTime())
              .map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setSelectedId(entry.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-zinc-900/50 cursor-pointer border-b border-zinc-900/60 last:border-b-0 font-sans"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-[10.5px] text-zinc-500 w-20 shrink-0">
                      {new Date(entry.callTime).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                    <span className="truncate text-xs font-bold text-white font-sans">{entry.prospectName ?? entry.prospectEmail}</span>
                  </div>
                  <StatusPill tone={STATUS_META[entry.status].tone} className="shrink-0">{STATUS_META[entry.status].label}</StatusPill>
                </button>
              ))
          )}
        </div>
      )}

      {mode === "calendar" && (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl font-sans">
          <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer">
                <ChevronLeft size={15} />
              </button>
              <button type="button" onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer">
                <ChevronRight size={15} />
              </button>
              <h3 className="text-sm font-bold text-white min-w-[120px] font-sans">{monthName} {year}</h3>
              <button type="button" onClick={() => setCurrentDate(new Date())} className="rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-[11px] font-semibold text-zinc-200 hover:bg-zinc-700 cursor-pointer font-sans">
                Today
              </button>
            </div>
            {loading && <Loader2 size={14} className="animate-spin text-zinc-500" />}
          </div>

          <div className="grid grid-cols-7 border-b border-zinc-800 bg-zinc-900/40 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-500 font-sans">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="border-r border-zinc-800/60 py-2 last:border-r-0">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 auto-rows-fr bg-zinc-950 font-sans">
            {gridDays.map(({ date, isCurrentMonth }, idx) => {
              const k = dateKey(date);
              const dayItems = byDay.get(k) ?? [];
              const isToday = dateKey(new Date()) === k;

              return (
                <div key={idx} className={cn("flex min-h-[90px] flex-col border-b border-r border-zinc-800/60 p-1.5 font-sans", !isCurrentMonth && "bg-zinc-900/20 text-zinc-600", isCurrentMonth && "hover:bg-zinc-900/30")}>
                  <div className="flex items-start justify-between gap-1 w-full">
                    <span className={cn("flex h-5 w-5 items-center justify-center rounded-full font-mono text-[11px] font-semibold shrink-0", isToday ? "bg-emerald-500 text-zinc-950 font-bold" : isCurrentMonth ? "text-zinc-300" : "text-zinc-600")}>
                      {date.getDate()}
                    </span>
                    {dayItems.length > 0 && (
                      <div className="relative shrink-0">
                        <SquishySkillBadge skill="pre-call-read" size={16} enabled={true} />
                        <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-sky-500 text-[8px] font-bold text-zinc-950 font-mono">
                          {dayItems.length}
                        </span>
                      </div>
                    )}
                  </div>
                  {dayItems.length > 1 && (
                    <div className="mt-1 rounded-lg bg-sky-950/40 border border-sky-800/50 px-2 py-1 text-sky-200">
                      <span className="text-[11px] font-bold block leading-none font-sans">
                        {dayItems.length} calls
                      </span>
                      <span className="text-[9.5px] text-sky-400/80 font-mono mt-0.5 block">
                        {dayItems.filter((e) => e.status === "brief_delivered").length}/{dayItems.length} briefed
                      </span>
                    </div>
                  )}
                  <div className="mt-1 space-y-1 overflow-y-auto max-h-[65px] [scrollbar-width:none]">
                    {dayItems.map((entry) => (
                      <button key={entry.id} type="button" onClick={() => setSelectedId(entry.id)} className="flex w-full flex-col gap-0.5 rounded-lg border border-zinc-800 bg-zinc-900/90 p-1.5 text-left text-[11px] font-sans hover:border-zinc-700 cursor-pointer">
                        <span className="truncate font-bold text-white font-sans">{entry.prospectName ?? entry.prospectEmail}</span>
                        <StatusPill tone={STATUS_META[entry.status].tone} className="w-fit">{STATUS_META[entry.status].label}</StatusPill>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <PreCallReadDrawer entry={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function PreCallReadDrawer({ entry, onClose }: { entry: RosterEntry | null; onClose: () => void }) {
  const [showRunActivity, setShowRunActivity] = useState(false);

  // Collapse the run-activity panel back down whenever a different entry
  // is opened, so it doesn't stay expanded (and mid-fetch for the wrong
  // run) across selections.
  useEffect(() => {
    setShowRunActivity(false);
  }, [entry?.id]);

  return (
    <Sheet open={!!entry} onOpenChange={(open) => !open && onClose()}>
      <SheetContent widthClassName="w-full sm:max-w-md font-sans antialiased text-zinc-100">
        {entry && (
          <>
            <SheetHeader className="font-sans">
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusPill tone={STATUS_META[entry.status].tone}>{STATUS_META[entry.status].label}</StatusPill>
                <StatusPill tone={matchLabel(entry).tone}>{matchLabel(entry).text}</StatusPill>
                {entry.actualOutcome && (
                  <StatusPill tone={OUTCOME_META[entry.actualOutcome]?.tone ?? "neutral"}>
                    {OUTCOME_META[entry.actualOutcome]?.label ?? entry.actualOutcome}
                  </StatusPill>
                )}
              </div>
              <SheetTitle className="mt-2 text-lg font-bold font-sans text-white">{entry.prospectName ?? entry.prospectEmail}</SheetTitle>
              <SheetDescription className="flex items-center gap-1 text-xs text-zinc-400 font-sans">
                Call {new Date(entry.callTime).toLocaleString(undefined, { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </SheetDescription>
            </SheetHeader>
            <SheetBody className="space-y-4 font-sans pt-2">
              <div className="flex items-center gap-2 text-xs text-zinc-300 font-sans">
                <Mail size={13} className="text-zinc-500 shrink-0" />
                <span className="truncate">{entry.prospectEmail}</span>
              </div>
              {entry.prospectPhone && (
                <div className="flex items-center gap-2 text-xs text-zinc-300 font-sans -mt-2">
                  <Phone size={13} className="text-zinc-500 shrink-0" />
                  <span className="truncate">{entry.prospectPhone}</span>
                </div>
              )}

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs font-sans">
                  <span className="text-zinc-400">Booking platform</span>
                  <span className="font-mono text-white">{entry.bookingPlatform ? bookingPlatformLabel(entry.bookingPlatform) : "—"}</span>
                </div>
                <div className="flex items-center justify-between text-xs font-sans pt-1">
                  <span className="text-zinc-400">Delivered via</span>
                  <span className="font-mono text-white">{entry.destinationDelivered ? briefDestinationLabel(entry.destinationDelivered) : "—"}</span>
                </div>
                {entry.briefDeliveredAt && (
                  <div className="flex items-center justify-between text-xs font-sans pt-1">
                    <span className="text-zinc-400">Brief delivered</span>
                    <span className="font-mono text-white">{new Date(entry.briefDeliveredAt).toLocaleString(undefined, { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                )}
                {entry.personMatchScore !== null && (
                  <div className="flex items-center justify-between text-xs font-sans pt-1">
                    <span className="text-zinc-400">Identity match score</span>
                    <span className="font-mono text-white">{entry.personMatchScore}/100</span>
                  </div>
                )}
                {entry.predictedShowProbability !== null && (
                  <div className="flex items-center justify-between text-xs font-sans pt-1">
                    <span className="text-zinc-400">Predicted to show</span>
                    <span className="font-mono text-white">{entry.predictedShowProbability}%</span>
                  </div>
                )}
                {entry.outcomeSource && (
                  <div className="flex items-center justify-between text-xs font-sans pt-1 gap-3">
                    <span className="text-zinc-400 shrink-0">How we know</span>
                    <span className="text-white text-right">{outcomeSourceLabel(entry.outcomeSource, entry.actualOutcome)}</span>
                  </div>
                )}
              </div>

              {entry.briefText ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 space-y-1.5">
                  <span className="text-[10.5px] font-mono text-zinc-500 uppercase block">Brief Content</span>
                  <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed font-sans">{entry.briefText}</p>
                </div>
              ) : (
                <p className="text-zinc-500 italic text-[11px] font-sans">No brief text on file for this call.</p>
              )}

              {entry.runId && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowRunActivity((p) => !p)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left cursor-pointer hover:bg-zinc-900 transition-colors"
                  >
                    <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-300">
                      <SquishySkillBadge skill="pre-call-read" size={14} enabled={true} />
                      Run activity
                    </span>
                    <ChevronDown size={13} className={cn("text-zinc-500 transition-transform", showRunActivity && "rotate-180")} />
                  </button>
                  {showRunActivity && (
                    <div className="px-3 pb-3 pt-1 border-t border-zinc-800/60">
                      <RunActivityPanel runId={entry.runId} />
                      <a
                        href={`/dashboard/runs/${entry.runId}`}
                        className="mt-3 inline-flex items-center gap-1.5 text-[10.5px] text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        <span>Open the full run page</span>
                        <ExternalLink size={10} />
                      </a>
                    </div>
                  )}
                </div>
              )}
            </SheetBody>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
