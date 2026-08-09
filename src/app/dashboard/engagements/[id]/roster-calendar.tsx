"use client";

// src/app/dashboard/engagements/[id]/roster-calendar.tsx
//
// The engagement-level fix for the "black box" problem: unlike
// runs/[id]/views/pre-call-read-view.tsx (frozen to one nightly run's
// results), this reads GET /api/engagements/[id]/roster — every booking
// this engagement has, from the moment it's made, regardless of whether
// any run has processed it yet. Opening this at any point shows every
// upcoming call and its real lifecycle status.
//
// Reuses the exact grid math from runs/[id]/_shared/calendar-grid.ts and
// visually matches pre-call-read-view.tsx's calendar so it reads as the
// same product, not a bolted-on second calendar.

import { useEffect, useMemo, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, Search, Phone, Mail, ExternalLink, CalendarX2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ViewSwitcher, type RunViewMode } from "../../runs/[id]/_shared/view-switcher";
import { StatusPill } from "../../runs/[id]/_shared/status-pill";
import { getDaysInMonthGrid, dateKey, timeStr } from "../../runs/[id]/_shared/calendar-grid";
import { Sheet, SheetContent, SheetHeader, SheetBody, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { bookingPlatformLabel } from "@/lib/copy";
import type { RosterEntry, RosterStatus } from "@/app/api/engagements/[id]/roster/route";

const STATUS_META: Record<RosterStatus, { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" }> = {
  scheduled: { label: "Scheduled for briefing", tone: "warning" },
  brief_delivered: { label: "Brief delivered", tone: "success" },
  brief_failed: { label: "Brief failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function RosterCalendar({ engagementId }: { engagementId: string }) {
  const [mode, setMode] = useState<RunViewMode>("calendar");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const monthParam = `${year}-${String(month + 1).padStart(2, "0")}`;
      const res = await fetch(`/api/engagements/${engagementId}/roster?month=${monthParam}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Failed to load roster.");
      const body = await res.json();
      setEntries(body.entries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load roster.");
    } finally {
      setLoading(false);
    }
  }, [engagementId, year, month]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!filterText.trim()) return entries;
    const q = filterText.toLowerCase();
    return entries.filter((e) => (e.prospectName ?? "").toLowerCase().includes(q));
  }, [entries, filterText]);

  const byDate = useMemo(() => {
    const map: Record<string, RosterEntry[]> = {};
    for (const e of filtered) (map[dateKey(e.callTime)] ??= []).push(e);
    return map;
  }, [filtered]);

  const byDay = useMemo(() => {
    const map = new Map<string, RosterEntry[]>();
    for (const e of filtered) {
      const k = dateKey(e.callTime);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const board = useMemo(() => {
    const cols: Record<RosterStatus, RosterEntry[]> = { scheduled: [], brief_delivered: [], brief_failed: [], cancelled: [] };
    for (const e of filtered) cols[e.status].push(e);
    return cols;
  }, [filtered]);

  const gridDays = useMemo(() => getDaysInMonthGrid(year, month), [year, month]);
  const monthName = currentDate.toLocaleString("default", { month: "long" });
  const selected = useMemo(() => entries.find((e) => e.id === selectedId) ?? null, [entries, selectedId]);

  const upcomingCount = filtered.filter((e) => e.status === "scheduled").length;

  return (
    <div className="flex flex-col gap-3 font-sans antialiased">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div>
          <h3 className="text-sm font-bold text-white font-sans">Upcoming Calls</h3>
          <p className="text-[11px] text-zinc-500 font-sans mt-0.5">
            Every booked call for this client, the moment it's booked — not just what last night's run found.
          </p>
        </div>
        {!loading && (
          <div className="text-[11px] font-mono text-zinc-500 shrink-0">
            {upcomingCount} upcoming this month
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
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300 font-sans">
          {error}
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
              const dayEntries = byDate[k] ?? [];
              const isToday = dateKey(new Date()) === k;
              const isPast = date < new Date(new Date().setHours(0, 0, 0, 0));

              return (
                <div
                  key={idx}
                  className={cn(
                    "flex min-h-[95px] flex-col border-b border-r border-zinc-800/60 p-1.5 transition-colors font-sans",
                    !isCurrentMonth && "bg-zinc-900/20 text-zinc-600",
                    isCurrentMonth && "hover:bg-zinc-900/30"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full font-mono text-[11px] font-semibold",
                      isToday ? "bg-emerald-500 text-zinc-950 font-bold" : isCurrentMonth ? "text-zinc-300" : "text-zinc-600"
                    )}>
                      {date.getDate()}
                    </span>
                  </div>

                  <div className="mt-1 space-y-1 overflow-y-auto max-h-[75px] [scrollbar-width:none]">
                    {dayEntries.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => setSelectedId(entry.id)}
                        className="flex w-full flex-col gap-0.5 rounded-lg border border-zinc-800 bg-zinc-900/90 p-1.5 text-left text-[11px] font-sans hover:border-zinc-700 cursor-pointer transition-all"
                      >
                        <div className="flex items-center justify-between gap-1 font-sans">
                          <span className="truncate font-bold text-white font-sans">{entry.prospectName ?? "Unnamed prospect"}</span>
                          <span className="shrink-0 font-mono text-[9.5px] text-zinc-400">{timeStr(entry.callTime)}</span>
                        </div>
                        <StatusPill tone={STATUS_META[entry.status].tone} className="w-fit">
                          {STATUS_META[entry.status].label}
                        </StatusPill>
                      </button>
                    ))}

                    {/* Non-lazy empty state — a day with genuinely zero
                        bookings says so explicitly instead of just being
                        blank, so a blank cell always means "confirmed
                        nothing", never "maybe didn't load." Skipped for
                        past/adjacent-month days and today, where an empty
                        cell reads fine on its own. */}
                    {dayEntries.length === 0 && isCurrentMonth && !isPast && !isToday && (
                      <div className="flex items-center gap-1 rounded-lg border border-dashed border-zinc-800/80 px-1.5 py-1 text-[9.5px] text-zinc-600 font-sans">
                        <CalendarX2 size={10} />
                        <span>No calls</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {mode === "list" && (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl font-sans">
          {byDay.length === 0 && !loading ? (
            <div className="flex flex-col items-center gap-2 py-12 text-zinc-600 font-sans">
              <CalendarX2 size={22} />
              <span className="text-xs">No bookings this month.</span>
            </div>
          ) : (
            byDay.map(([day, dayEntries]) => (
              <div key={day} className="border-b border-zinc-800/60 last:border-b-0">
                <div className="bg-zinc-900/40 px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 font-sans">
                  {new Date(day).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                </div>
                {dayEntries.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setSelectedId(entry.id)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-zinc-900/50 cursor-pointer border-b border-zinc-900/60 last:border-b-0 font-sans"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-[11px] text-zinc-500 w-14 shrink-0">{timeStr(entry.callTime)}</span>
                      <span className="truncate text-xs font-bold text-white font-sans">{entry.prospectName ?? "Unnamed prospect"}</span>
                    </div>
                    <StatusPill tone={STATUS_META[entry.status].tone} className="shrink-0">
                      {STATUS_META[entry.status].label}
                    </StatusPill>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}

      {mode === "board" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-sans">
          {(Object.keys(board) as RosterStatus[]).map((status) => (
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
                    className="flex flex-col gap-0.5 rounded-lg border border-zinc-800 bg-zinc-900/90 p-2 text-left text-[11px] hover:border-zinc-700 cursor-pointer transition-all font-sans"
                  >
                    <span className="truncate font-bold text-white font-sans">{entry.prospectName ?? "Unnamed prospect"}</span>
                    <span className="font-mono text-[10px] text-zinc-500">
                      {new Date(entry.callTime).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {timeStr(entry.callTime)}
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

      <RosterDrawer entry={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function RosterDrawer({ entry, onClose }: { entry: RosterEntry | null; onClose: () => void }) {
  return (
    <Sheet open={!!entry} onOpenChange={(open) => !open && onClose()}>
      <SheetContent widthClassName="w-full sm:max-w-md font-sans antialiased text-zinc-100">
        {entry && (
          <>
            <SheetHeader className="font-sans">
              <StatusPill tone={STATUS_META[entry.status].tone} className="w-fit">
                {STATUS_META[entry.status].label}
              </StatusPill>
              <SheetTitle className="mt-2 text-lg font-bold font-sans text-white">
                {entry.prospectName ?? "Unnamed prospect"}
              </SheetTitle>
              <SheetDescription className="flex items-center gap-1 text-xs text-zinc-400 font-sans">
                {new Date(entry.callTime).toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </SheetDescription>
            </SheetHeader>

            <SheetBody className="space-y-4 font-sans pt-2">
              <div className="space-y-2">
                {entry.prospectEmail && (
                  <div className="flex items-center gap-2 text-xs text-zinc-300 font-sans">
                    <Mail size={13} className="text-zinc-500 shrink-0" />
                    <span className="truncate">{entry.prospectEmail}</span>
                  </div>
                )}
                {entry.prospectPhone && (
                  <div className="flex items-center gap-2 text-xs text-zinc-300 font-sans">
                    <Phone size={13} className="text-zinc-500 shrink-0" />
                    <span>{entry.prospectPhone}</span>
                  </div>
                )}
                {entry.bookingPlatform && (
                  <div className="flex items-center gap-2 text-xs text-zinc-300 font-sans">
                    <ExternalLink size={13} className="text-zinc-500 shrink-0" />
                    <span>Booked via {bookingPlatformLabel(entry.bookingPlatform)}</span>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 text-xs text-zinc-400 font-sans">
                {entry.status === "scheduled" && "Caught and queued — Pre-Call Read will research and brief this call before it happens."}
                {entry.status === "brief_delivered" && `Brief delivered${entry.briefDeliveredAt ? ` ${new Date(entry.briefDeliveredAt).toLocaleString()}` : ""}${entry.destinationDelivered ? ` to ${entry.destinationDelivered}` : ""}.`}
                {entry.status === "brief_failed" && "The research or brief-synthesis step failed for this call — check the run for details."}
                {entry.status === "cancelled" && "This booking was cancelled."}
              </div>

              {entry.runId && (
                <a
                  href={`/dashboard/runs/${entry.runId}`}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-300 hover:text-white font-sans"
                >
                  View the run that processed this call <ExternalLink size={11} />
                </a>
              )}
            </SheetBody>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
