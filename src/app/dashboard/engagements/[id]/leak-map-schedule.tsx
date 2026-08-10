"use client";

// src/app/dashboard/engagements/[id]/leak-map-schedule.tsx
//
// Reads GET /api/engagements/[id]/leak-map-schedule. Different shape from
// the other three pipelines — Leak-Map is cron-scheduled, not
// booking-driven — so instead of a prospect pipeline this shows: the real
// next-scheduled audit dates (computed off the same matcher the actual
// cron uses), audit history grouped by severity, and any alerts currently
// firing. This is the "no scheduled next audit visible anywhere" gap
// closing, not a frozen-run fix.

import { useEffect, useMemo, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, Search, CalendarClock, AlertTriangle, Loader2, ExternalLink, CalendarX2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ViewSwitcher, type RunViewMode } from "../../runs/[id]/_shared/view-switcher";
import { StatusPill, toneFromSeverity } from "../../runs/[id]/_shared/status-pill";
import { getDaysInMonthGrid, dateKey } from "../../runs/[id]/_shared/calendar-grid";
import { Sheet, SheetContent, SheetHeader, SheetBody, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import type { AuditHistoryItem, ScheduledAudit, ActiveAlertItem } from "@/app/api/engagements/[id]/leak-map-schedule/route";

const SEVERITY_COLUMNS: Array<"high" | "medium" | "low" | "none"> = ["high", "medium", "low", "none"];
const SEVERITY_LABEL: Record<string, string> = { high: "High severity", medium: "Medium severity", low: "Low severity", none: "No issues found" };

export function LeakMapSchedule({ engagementId }: { engagementId: string }) {
  const [mode, setMode] = useState<RunViewMode>("list");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [history, setHistory] = useState<AuditHistoryItem[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledAudit[]>([]);
  const [alerts, setAlerts] = useState<ActiveAlertItem[]>([]);
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

  const filtered = useMemo(() => {
    if (!filterText.trim()) return history;
    const q = filterText.toLowerCase();
    return history.filter((h) => h.runType.toLowerCase().includes(q));
  }, [history, filterText]);

  const board = useMemo(() => {
    const cols: Record<string, AuditHistoryItem[]> = { high: [], medium: [], low: [], none: [] };
    for (const h of filtered) cols[h.overallSeverity].push(h);
    return cols;
  }, [filtered]);

  const byDay = useMemo(() => {
    const map = new Map<string, AuditHistoryItem[]>();
    for (const h of filtered) {
      const k = dateKey(h.createdAt);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(h);
    }
    return map;
  }, [filtered]);

  const gridDays = useMemo(() => getDaysInMonthGrid(year, month), [year, month]);
  const monthName = currentDate.toLocaleString("default", { month: "long" });
  const selected = useMemo(() => history.find((h) => h.id === selectedId) ?? null, [history, selectedId]);

  return (
    <div className="flex flex-col gap-3 font-sans antialiased">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div>
          <h3 className="text-sm font-bold text-white font-sans">Leak-Map Audits</h3>
          <p className="text-[11px] text-zinc-500 font-sans mt-0.5">
            Every audit that's run, plus exactly when the next one fires — not buried in a run list.
          </p>
        </div>
      </div>

      {/* Next-scheduled strip — real dates from the same matcher the cron
          itself uses, not an estimate. */}
      {!loading && (
        <div className="flex flex-wrap gap-2">
          {scheduled.map((s) => (
            <div key={s.auditType} className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 font-sans">
              <CalendarClock size={14} className="text-emerald-400 shrink-0" />
              <div className="flex flex-col leading-tight">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  Next {s.auditType} audit
                </span>
                <span className="text-xs font-semibold text-white">
                  {new Date(s.nextRunAt).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  <span className="text-zinc-500 font-normal ml-1">({s.timezone})</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && alerts.length > 0 && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-3 font-sans">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-red-400 mb-2">
            <AlertTriangle size={12} /> {alerts.length} alert{alerts.length === 1 ? "" : "s"} currently active
          </div>
          <div className="flex flex-col gap-1.5">
            {alerts.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-zinc-200 font-semibold">{a.metricName}</span>
                <span className="font-mono text-[10.5px] text-zinc-400">
                  {a.comparison} {a.threshold}
                  {a.lastFiredAt && ` · fired ${new Date(a.lastFiredAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-950 p-1.5 border border-zinc-800">
        <div className="relative w-64">
          <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-500" />
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Search weekly / monthly..."
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-1.5 pl-8 pr-2.5 text-xs text-zinc-200 font-sans placeholder:text-zinc-500 focus:border-zinc-700 focus:outline-none"
          />
        </div>
        <ViewSwitcher value={mode} onChange={setMode} />
      </div>

      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300 font-sans">{error}</div>
      )}

      {mode === "list" && (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl font-sans">
          {filtered.length === 0 && !loading ? (
            <div className="flex flex-col items-center gap-2 py-12 text-zinc-600 font-sans">
              <CalendarX2 size={22} />
              <span className="text-xs">No audits have run yet.</span>
            </div>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-zinc-900/50 cursor-pointer border-b border-zinc-900/60 last:border-b-0 font-sans"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-[10.5px] text-zinc-500 w-24 shrink-0">
                    {new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                  <span className="truncate text-xs font-bold text-white font-sans capitalize">{item.runType} audit</span>
                  <span className="shrink-0 font-mono text-[10px] text-zinc-500">
                    {item.topIssueCount} issue{item.topIssueCount === 1 ? "" : "s"} · {item.alertsFiredCount} alert{item.alertsFiredCount === 1 ? "" : "s"}
                  </span>
                </div>
                <StatusPill tone={toneFromSeverity(item.overallSeverity)} className="shrink-0 capitalize">
                  {item.overallSeverity === "none" ? "Clean" : item.overallSeverity}
                </StatusPill>
              </button>
            ))
          )}
        </div>
      )}

      {mode === "board" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-sans">
          {SEVERITY_COLUMNS.map((sev) => (
            <div key={sev} className="rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden">
              <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-3 py-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 font-sans">{SEVERITY_LABEL[sev]}</span>
                <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">{board[sev].length}</span>
              </div>
              <div className="flex flex-col gap-1.5 p-2 min-h-[80px] max-h-[420px] overflow-y-auto">
                {board[sev].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className="flex flex-col gap-1 rounded-lg border border-zinc-800 bg-zinc-900/90 p-2 text-left text-[11px] hover:border-zinc-700 cursor-pointer transition-all font-sans capitalize"
                  >
                    <span className="truncate font-bold text-white font-sans">{item.runType} audit</span>
                    <span className="font-mono text-[9.5px] text-zinc-500 normal-case">
                      {new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  </button>
                ))}
                {board[sev].length === 0 && (
                  <div className="flex items-center justify-center py-6 text-[10.5px] text-zinc-700 font-sans">Nothing here</div>
                )}
              </div>
            </div>
          ))}
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
              const isNextScheduled = scheduled.some((s) => dateKey(s.nextRunAt) === k);

              return (
                <div key={idx} className={cn("flex min-h-[90px] flex-col border-b border-r border-zinc-800/60 p-1.5 font-sans", !isCurrentMonth && "bg-zinc-900/20 text-zinc-600", isCurrentMonth && "hover:bg-zinc-900/30")}>
                  <div className="flex items-center justify-between">
                    <span className={cn("flex h-5 w-5 items-center justify-center rounded-full font-mono text-[11px] font-semibold", isToday ? "bg-emerald-500 text-zinc-950 font-bold" : isCurrentMonth ? "text-zinc-300" : "text-zinc-600")}>
                      {date.getDate()}
                    </span>
                    {isNextScheduled && <CalendarClock size={11} className="text-emerald-400" />}
                  </div>
                  <div className="mt-1 space-y-1 overflow-y-auto max-h-[60px] [scrollbar-width:none]">
                    {dayItems.map((item) => (
                      <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className="flex w-full flex-col gap-0.5 rounded-lg border border-zinc-800 bg-zinc-900/90 p-1.5 text-left text-[11px] font-sans hover:border-zinc-700 cursor-pointer capitalize">
                        <span className="truncate font-bold text-white font-sans">{item.runType} audit</span>
                        <StatusPill tone={toneFromSeverity(item.overallSeverity)} className="w-fit normal-case">
                          {item.overallSeverity === "none" ? "Clean" : item.overallSeverity}
                        </StatusPill>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <AuditDrawer item={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function AuditDrawer({ item, onClose }: { item: AuditHistoryItem | null; onClose: () => void }) {
  return (
    <Sheet open={!!item} onOpenChange={(open) => !open && onClose()}>
      <SheetContent widthClassName="w-full sm:max-w-md font-sans antialiased text-zinc-100">
        {item && (
          <>
            <SheetHeader className="font-sans">
              <StatusPill tone={toneFromSeverity(item.overallSeverity)} className="w-fit capitalize">
                {item.overallSeverity === "none" ? "Clean" : item.overallSeverity}
              </StatusPill>
              <SheetTitle className="mt-2 text-lg font-bold font-sans text-white capitalize">{item.runType} Audit</SheetTitle>
              <SheetDescription className="flex items-center gap-1 text-xs text-zinc-400 font-sans">
                {new Date(item.createdAt).toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </SheetDescription>
            </SheetHeader>
            <SheetBody className="space-y-4 font-sans pt-2">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs font-sans">
                  <span className="text-zinc-400">Issues found</span>
                  <span className="font-mono text-white">{item.topIssueCount}</span>
                </div>
                <div className="flex items-center justify-between text-xs font-sans">
                  <span className="text-zinc-400">Alerts fired</span>
                  <span className="font-mono text-white">{item.alertsFiredCount}</span>
                </div>
                <div className="flex items-center justify-between text-xs font-sans">
                  <span className="text-zinc-400">Gaps identified</span>
                  <span className="font-mono text-white">{item.gapsCount}</span>
                </div>
              </div>

              {item.runId && (
                <a href={`/dashboard/runs/${item.runId}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-300 hover:text-white font-sans">
                  View the full report <ExternalLink size={11} />
                </a>
              )}
            </SheetBody>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
