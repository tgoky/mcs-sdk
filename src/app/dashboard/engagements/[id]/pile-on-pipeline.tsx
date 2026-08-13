"use client";

// src/app/dashboard/engagements/[id]/pile-on-pipeline.tsx
//
// Reads GET /api/engagements/[id]/pile-on-pipeline. Board groups by real
// sequence progress + a genuine "Call Today" bucket sourced from
// booking_roster (the only reason that bucket is even possible — before
// the roster table existed, nothing durably tracked a booking's call time
// outside of brief-send-time processing). Calendar plots each booking's
// real call date; List shows real touch counts.

import { useEffect, useMemo, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, Search, Mail, CalendarX2, Loader2, ExternalLink, PhoneCall } from "lucide-react";
import { cn } from "@/lib/utils";
import { ViewSwitcher, type RunViewMode } from "../../runs/[id]/_shared/view-switcher";
import { StatusPill } from "../../runs/[id]/_shared/status-pill";
import { getDaysInMonthGrid, dateKey } from "../../runs/[id]/_shared/calendar-grid";
import { Sheet, SheetContent, SheetHeader, SheetBody, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import type { PileOnPipelineItem, PileOnStage } from "@/app/api/engagements/[id]/pile-on-pipeline/route";

const STAGE_META: Record<PileOnStage, { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" }> = {
  newly_booked: { label: "Newly booked", tone: "info" },
  active_sequence: { label: "Active sequence", tone: "warning" },
  sequence_complete: { label: "Sequence complete", tone: "success" },
  call_today: { label: "Call today", tone: "danger" },
};
const BOARD_COLUMNS: PileOnStage[] = ["newly_booked", "active_sequence", "sequence_complete", "call_today"];

export function PileOnPipeline({ engagementId }: { engagementId: string }) {
  const [mode, setMode] = useState<RunViewMode>("board");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [items, setItems] = useState<PileOnPipelineItem[]>([]);
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
      const res = await fetch(`/api/engagements/${engagementId}/pile-on-pipeline`);
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
    const cols: Record<PileOnStage, PileOnPipelineItem[]> = { newly_booked: [], active_sequence: [], sequence_complete: [], call_today: [] };
    for (const i of filtered) cols[i.stage].push(i);
    return cols;
  }, [filtered]);

  const byDay = useMemo(() => {
    const map = new Map<string, PileOnPipelineItem[]>();
    for (const i of filtered.filter((i) => i.callTime)) {
      const k = dateKey(i.callTime!);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(i);
    }
    return map;
  }, [filtered]);

  const gridDays = useMemo(() => getDaysInMonthGrid(year, month), [year, month]);
  const monthName = currentDate.toLocaleString("default", { month: "long" });
  const selected = useMemo(() => items.find((i) => i.id === selectedId) ?? null, [items, selectedId]);
  const callTodayCount = filtered.filter((i) => i.stage === "call_today").length;

  return (
    <div className="flex flex-col gap-3 font-sans antialiased">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div className="flex items-center gap-2.5">
          <SquishySkillBadge skill="pile-on" size={28} enabled={true} />
          <div>
            <h3 className="text-sm font-bold text-white font-sans">Pile-On Pipeline</h3>
            <p className="text-[11px] text-zinc-500 font-sans mt-0.5">
              Every booked lead's speed-to-lead sequence, in one board — not one run page per booking.
            </p>
          </div>
        </div>
        {!loading && callTodayCount > 0 && (
          <div className="flex items-center gap-1 text-[11px] font-mono text-red-400 shrink-0">
            <PhoneCall size={11} /> {callTodayCount} call{callTodayCount === 1 ? "" : "s"} today
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
          {BOARD_COLUMNS.map((stage) => (
            <div key={stage} className="rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden">
              <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-3 py-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 font-sans">{STAGE_META[stage].label}</span>
                <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">{board[stage].length}</span>
              </div>
              <div className="flex flex-col gap-1.5 p-2 min-h-[80px] max-h-[420px] overflow-y-auto">
                {board[stage].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className="flex flex-col gap-1 rounded-lg border border-zinc-800 bg-zinc-900/90 p-2 text-left text-[11px] hover:border-zinc-700 cursor-pointer transition-all font-sans"
                  >
                    <span className="truncate font-bold text-white font-sans">{item.prospectName ?? item.prospectEmail}</span>
                    <span className="font-mono text-[9.5px] text-zinc-500">
                      {item.touchesTotal > 0 ? `${item.touchesSent}/${item.touchesTotal} SMS touches` : "No SMS sequence configured"}
                    </span>
                  </button>
                ))}
                {board[stage].length === 0 && (
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
              <span className="text-xs">No bookings yet.</span>
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
                    {new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                  <span className="truncate text-xs font-bold text-white font-sans">{item.prospectName ?? item.prospectEmail}</span>
                  <span className="shrink-0 font-mono text-[10px] text-zinc-500">
                    {item.touchesTotal > 0 ? `${item.touchesSent}/${item.touchesTotal}` : "—"}
                  </span>
                </div>
                <StatusPill tone={STAGE_META[item.stage].tone} className="shrink-0">{STAGE_META[item.stage].label}</StatusPill>
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
                        <SquishySkillBadge skill="pile-on" size={16} enabled={true} />
                        <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-purple-500 text-[8px] font-bold text-zinc-950 font-mono">
                          {dayItems.length}
                        </span>
                      </div>
                    )}
                  </div>
                  {dayItems.length > 1 && (
                    <div className="mt-1 rounded-lg bg-purple-950/40 border border-purple-800/50 px-2 py-1 text-purple-200">
                      <span className="text-[11px] font-bold block leading-none font-sans">
                        {dayItems.length} calls
                      </span>
                      <span className="text-[9.5px] text-purple-400/80 font-mono mt-0.5 block">
                        {dayItems.filter((i) => i.stage === "call_today").length} due today
                      </span>
                    </div>
                  )}
                  <div className="mt-1 space-y-1 overflow-y-auto max-h-[65px] [scrollbar-width:none]">
                    {dayItems.map((item) => (
                      <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className="flex w-full flex-col gap-0.5 rounded-lg border border-zinc-800 bg-zinc-900/90 p-1.5 text-left text-[11px] font-sans hover:border-zinc-700 cursor-pointer">
                        <span className="truncate font-bold text-white font-sans">{item.prospectName ?? item.prospectEmail}</span>
                        <StatusPill tone={STAGE_META[item.stage].tone} className="w-fit">{STAGE_META[item.stage].label}</StatusPill>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <PileOnDrawer item={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function PileOnDrawer({ item, onClose }: { item: PileOnPipelineItem | null; onClose: () => void }) {
  return (
    <Sheet open={!!item} onOpenChange={(open) => !open && onClose()}>
      <SheetContent widthClassName="w-full sm:max-w-md font-sans antialiased text-zinc-100">
        {item && (
          <>
            <SheetHeader className="font-sans">
              <StatusPill tone={STAGE_META[item.stage].tone} className="w-fit">{STAGE_META[item.stage].label}</StatusPill>
              <SheetTitle className="mt-2 text-lg font-bold font-sans text-white">{item.prospectName ?? item.prospectEmail}</SheetTitle>
              <SheetDescription className="flex items-center gap-1 text-xs text-zinc-400 font-sans">
                Booked {new Date(item.createdAt).toLocaleString(undefined, { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </SheetDescription>
            </SheetHeader>
            <SheetBody className="space-y-4 font-sans pt-2">
              <div className="flex items-center gap-2 text-xs text-zinc-300 font-sans">
                <Mail size={13} className="text-zinc-500 shrink-0" />
                <span className="truncate">{item.prospectEmail}</span>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs font-sans">
                  <span className="text-zinc-400">Email 1 sent via</span>
                  <span className="font-mono text-white">{item.sentVia}</span>
                </div>
                {item.touchesTotal > 0 && (
                  <>
                    <div className="flex items-center justify-between text-xs font-sans pt-1">
                      <span className="text-zinc-400">SMS touches</span>
                      <span className="font-mono text-white">{item.touchesSent} / {item.touchesTotal}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div className="h-full bg-amber-500" style={{ width: `${(item.touchesSent / item.touchesTotal) * 100}%` }} />
                    </div>
                  </>
                )}
                {item.callTime && (
                  <div className="flex items-center justify-between text-xs font-sans pt-1">
                    <span className="text-zinc-400">Call time</span>
                    <span className="font-mono text-white">{new Date(item.callTime).toLocaleString(undefined, { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                )}
              </div>

              {item.runId && (
                <a
                  href={`/dashboard/runs/${item.runId}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-[11px] text-zinc-300 hover:border-zinc-700 transition-colors w-fit"
                >
                  <SquishySkillBadge skill="pile-on" size={14} enabled={true} />
                  <span>View the run that sent Email 1</span>
                  <ExternalLink size={11} className="text-zinc-500" />
                </a>
              )}
            </SheetBody>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
