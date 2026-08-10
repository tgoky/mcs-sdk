"use client";

// src/app/dashboard/engagements/[id]/win-back-pipeline.tsx
//
// Reads GET /api/engagements/[id]/win-back-pipeline — every enrollment for
// this engagement, not one prospect's run page at a time. Board groups by
// real enrollment.status; Calendar plots each active enrollment's real
// next-unsent touchpoint (computed server-side from winBackSequenceAssetMap
// minus sequenceMessageLog, not a scheduled-date guess); List is
// chronological with real touch progress (X of Y sent).

import { useEffect, useMemo, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, Search, Mail, CalendarX2, Loader2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { ViewSwitcher, type RunViewMode } from "../../runs/[id]/_shared/view-switcher";
import { StatusPill } from "../../runs/[id]/_shared/status-pill";
import { getDaysInMonthGrid, dateKey } from "../../runs/[id]/_shared/calendar-grid";
import { Sheet, SheetContent, SheetHeader, SheetBody, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import type { WinBackPipelineItem, WinBackEnrollmentStatus } from "@/app/api/engagements/[id]/win-back-pipeline/route";

const STATUS_META: Record<WinBackEnrollmentStatus, { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" }> = {
  active: { label: "Active in cadence", tone: "warning" },
  rebooked: { label: "Exited — rebooked", tone: "success" },
  reply_exited: { label: "Exited — replied", tone: "info" },
  manual_override: { label: "Exited — manual override", tone: "neutral" },
  lost: { label: "Exited — window elapsed", tone: "neutral" },
  corrected: { label: "Exited — outcome corrected", tone: "neutral" },
};
const BOARD_COLUMNS: WinBackEnrollmentStatus[] = ["active", "rebooked", "reply_exited", "lost", "manual_override", "corrected"];

export function WinBackPipeline({ engagementId }: { engagementId: string }) {
  const [mode, setMode] = useState<RunViewMode>("board");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [items, setItems] = useState<WinBackPipelineItem[]>([]);
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

  const filtered = useMemo(() => {
    if (!filterText.trim()) return items;
    const q = filterText.toLowerCase();
    return items.filter((i) => (i.prospectName ?? i.prospectEmail).toLowerCase().includes(q));
  }, [items, filterText]);

  const board = useMemo(() => {
    const cols: Record<WinBackEnrollmentStatus, WinBackPipelineItem[]> = {
      active: [], rebooked: [], reply_exited: [], lost: [], manual_override: [], corrected: [],
    };
    for (const i of filtered) cols[i.status].push(i);
    return cols;
  }, [filtered]);

  const byDay = useMemo(() => {
    const map = new Map<string, WinBackPipelineItem[]>();
    for (const i of filtered.filter((i) => i.nextTouchAt)) {
      const k = dateKey(i.nextTouchAt!);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(i);
    }
    return map;
  }, [filtered]);

  const gridDays = useMemo(() => getDaysInMonthGrid(year, month), [year, month]);
  const monthName = currentDate.toLocaleString("default", { month: "long" });
  const selected = useMemo(() => items.find((i) => i.id === selectedId) ?? null, [items, selectedId]);
  const activeCount = filtered.filter((i) => i.status === "active").length;

  return (
    <div className="flex flex-col gap-3 font-sans antialiased">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div>
          <h3 className="text-sm font-bold text-white font-sans">Win-Back Pipeline</h3>
          <p className="text-[11px] text-zinc-500 font-sans mt-0.5">
            Every enrolled prospect across the whole recovery cadence — not one run page at a time.
          </p>
        </div>
        {!loading && <div className="text-[11px] font-mono text-zinc-500 shrink-0">{activeCount} active</div>}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 font-sans">
          {BOARD_COLUMNS.map((status) => (
            <div key={status} className="rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden">
              <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-3 py-2">
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-400 font-sans">{STATUS_META[status].label}</span>
                <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">{board[status].length}</span>
              </div>
              <div className="flex flex-col gap-1.5 p-2 min-h-[80px] max-h-[420px] overflow-y-auto">
                {board[status].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className="flex flex-col gap-1 rounded-lg border border-zinc-800 bg-zinc-900/90 p-2 text-left text-[11px] hover:border-zinc-700 cursor-pointer transition-all font-sans"
                  >
                    <span className="truncate font-bold text-white font-sans">{item.prospectName ?? item.prospectEmail}</span>
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-[9.5px] text-zinc-500">
                        {item.touchesSent}/{item.touchesTotal} touches
                      </span>
                      {item.status === "active" && item.nextTouchAt && (
                        <span className="font-mono text-[9.5px] text-amber-400/80">
                          next {new Date(item.nextTouchAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                      )}
                    </div>
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
              <span className="text-xs">No enrollments yet.</span>
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
                  <span className="font-mono text-[10.5px] text-zinc-500 w-20 shrink-0">
                    {new Date(item.enrolledAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                  <span className="truncate text-xs font-bold text-white font-sans">{item.prospectName ?? item.prospectEmail}</span>
                  <span className="shrink-0 font-mono text-[10px] text-zinc-500">{item.touchesSent}/{item.touchesTotal}</span>
                </div>
                <StatusPill tone={STATUS_META[item.status].tone} className="shrink-0">
                  {STATUS_META[item.status].label}
                </StatusPill>
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
                  <span className={cn("flex h-5 w-5 items-center justify-center rounded-full font-mono text-[11px] font-semibold", isToday ? "bg-emerald-500 text-zinc-950 font-bold" : isCurrentMonth ? "text-zinc-300" : "text-zinc-600")}>
                    {date.getDate()}
                  </span>
                  <div className="mt-1 space-y-1 overflow-y-auto max-h-[65px] [scrollbar-width:none]">
                    {dayItems.map((item) => (
                      <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className="flex w-full flex-col gap-0.5 rounded-lg border border-zinc-800 bg-zinc-900/90 p-1.5 text-left text-[11px] font-sans hover:border-zinc-700 cursor-pointer">
                        <span className="truncate font-bold text-white font-sans">{item.prospectName ?? item.prospectEmail}</span>
                        <span className="font-mono text-[9px] text-amber-400/80">next touch</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <WinBackDrawer item={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function WinBackDrawer({ item, onClose }: { item: WinBackPipelineItem | null; onClose: () => void }) {
  return (
    <Sheet open={!!item} onOpenChange={(open) => !open && onClose()}>
      <SheetContent widthClassName="w-full sm:max-w-md font-sans antialiased text-zinc-100">
        {item && (
          <>
            <SheetHeader className="font-sans">
              <StatusPill tone={STATUS_META[item.status].tone} className="w-fit">{STATUS_META[item.status].label}</StatusPill>
              <SheetTitle className="mt-2 text-lg font-bold font-sans text-white">{item.prospectName ?? item.prospectEmail}</SheetTitle>
              <SheetDescription className="flex items-center gap-1 text-xs text-zinc-400 font-sans">
                Enrolled {new Date(item.enrolledAt).toLocaleString(undefined, { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </SheetDescription>
            </SheetHeader>
            <SheetBody className="space-y-4 font-sans pt-2">
              <div className="flex items-center gap-2 text-xs text-zinc-300 font-sans">
                <Mail size={13} className="text-zinc-500 shrink-0" />
                <span className="truncate">{item.prospectEmail}</span>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs font-sans">
                  <span className="text-zinc-400">Touches sent</span>
                  <span className="font-mono text-white">{item.touchesSent} / {item.touchesTotal}</span>
                </div>
                <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div className="h-full bg-amber-500" style={{ width: `${item.touchesTotal ? (item.touchesSent / item.touchesTotal) * 100 : 0}%` }} />
                </div>
                <div className="flex items-center justify-between text-xs font-sans pt-1">
                  <span className="text-zinc-400">Recovery window</span>
                  <span className="font-mono text-white">{item.recoveryWindowDays} days</span>
                </div>
                {item.status === "active" && item.nextTouchAt && (
                  <div className="flex items-center justify-between text-xs font-sans">
                    <span className="text-zinc-400">Next touch</span>
                    <span className="font-mono text-amber-400">{new Date(item.nextTouchAt).toLocaleDateString(undefined, { month: "long", day: "numeric" })}</span>
                  </div>
                )}
                {item.exitedAt && (
                  <div className="flex items-center justify-between text-xs font-sans">
                    <span className="text-zinc-400">Exited</span>
                    <span className="font-mono text-white">{new Date(item.exitedAt).toLocaleDateString(undefined, { month: "long", day: "numeric" })}{item.exitReason ? ` · ${item.exitReason}` : ""}</span>
                  </div>
                )}
              </div>

              {item.runId && (
                <a href={`/dashboard/runs/${item.runId}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-300 hover:text-white font-sans">
                  View the run that created this enrollment <ExternalLink size={11} />
                </a>
              )}
            </SheetBody>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
