"use client";

// src/app/dashboard/engagements/[id]/win-back-pipeline.tsx
//
// Reads GET /api/engagements/[id]/win-back-pipeline — every enrollment for
// this engagement, not one prospect's run page at a time. Calendar plots
// every real event on an enrollment's timeline (enrolled / next touch due /
// exited), not just currently-active next-unsent touchpoints (computed
// server-side from winBackSequenceAssetMap minus sequenceMessageLog, not a
// scheduled-date guess) — a month with only closed-out enrollments used to
// render completely empty. List is chronological with real touch progress
// (X of Y sent). Board was removed: it duplicated List's grouping with
// less information and no real interactivity gain.

import { useEffect, useMemo, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, Search, Mail, CalendarX2, Loader2, ExternalLink, ChevronDown, Copy, Check, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ViewSwitcher, type RunViewMode } from "../../runs/[id]/_shared/view-switcher";
import { StatusPill } from "../../runs/[id]/_shared/status-pill";
import { getDaysInMonthGrid, dateKey } from "../../runs/[id]/_shared/calendar-grid";
import { RunActivityPanel } from "../../runs/[id]/_shared/run-activity-panel";
import { exitReasonLabel } from "@/lib/copy";
import { Sheet, SheetContent, SheetHeader, SheetBody, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import type { WinBackPipelineItem, WinBackEnrollmentStatus } from "@/app/api/engagements/[id]/win-back-pipeline/route";

const STATUS_META: Record<WinBackEnrollmentStatus, { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" }> = {
  active: { label: "Active in cadence", tone: "warning" },
  rebooked: { label: "Exited — rebooked", tone: "success" },
  reply_exited: { label: "Exited — replied", tone: "info" },
  manual_override: { label: "Exited — manual override", tone: "neutral" },
  lost: { label: "Exited — window elapsed", tone: "neutral" },
  corrected: { label: "Exited — outcome corrected", tone: "neutral" },
};

// Board view removed — grouping by status added a third view that
// duplicated List with less information. Calendar/List only now.
const PIPELINE_MODES: RunViewMode[] = ["calendar", "list"];

type WinBackCalendarKind = "enrolled" | "next_touch" | "exited";
const CALENDAR_KIND_LABEL: Record<WinBackCalendarKind, string> = {
  enrolled: "enrolled",
  next_touch: "touch due",
  exited: "exited",
};

export function WinBackPipeline({ engagementId }: { engagementId: string }) {
  const [mode, setMode] = useState<RunViewMode>("calendar");
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

  // Plots real history, not just pending future touches — an enrollment
  // whose cadence has already finished (rebooked/lost/replied, no more
  // future sends) used to never appear on the calendar at all, since
  // nextTouchAt only exists for currently-active enrollments. Every
  // enrollment now shows on the day it enrolled, on its next-touch day if
  // one is still pending, and on the day it exited if it has — so a
  // month with real activity actually shows something.
  const byDay = useMemo(() => {
    const map = new Map<string, { item: WinBackPipelineItem; kind: WinBackCalendarKind }[]>();
    const add = (iso: string, item: WinBackPipelineItem, kind: WinBackCalendarKind) => {
      const k = dateKey(iso);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push({ item, kind });
    };
    for (const i of filtered) {
      add(i.enrolledAt, i, "enrolled");
      if (i.nextTouchAt) add(i.nextTouchAt, i, "next_touch");
      if (i.exitedAt) add(i.exitedAt, i, "exited");
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
        <div className="flex items-center gap-2.5">
          <SquishySkillBadge skill="win-back" size={28} enabled={true} />
          <div>
            <h3 className="text-sm font-bold text-white font-sans">Win-Back Pipeline</h3>
            <p className="text-[11px] text-zinc-500 font-sans mt-0.5">
              Every enrolled prospect across the whole recovery cadence — not one run page at a time.
            </p>
          </div>
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
        <ViewSwitcher value={mode} onChange={setMode} modes={PIPELINE_MODES} />
      </div>

      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300 font-sans">{error}</div>
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
                  <div className="flex items-start justify-between gap-1 w-full">
                    <span className={cn("flex h-5 w-5 items-center justify-center rounded-full font-mono text-[11px] font-semibold shrink-0", isToday ? "bg-emerald-500 text-zinc-950 font-bold" : isCurrentMonth ? "text-zinc-300" : "text-zinc-600")}>
                      {date.getDate()}
                    </span>
                    {dayItems.length > 0 && (
                      <div className="relative shrink-0">
                        <SquishySkillBadge skill="win-back" size={16} enabled={true} />
                        <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-rose-500 text-[8px] font-bold text-zinc-950 font-mono">
                          {dayItems.length}
                        </span>
                      </div>
                    )}
                  </div>
                  {dayItems.length > 1 && (() => {
                    const touchesDue = dayItems.filter((d) => d.kind === "next_touch").length;
                    return (
                      <div className="mt-1 rounded-lg bg-rose-950/40 border border-rose-800/50 px-2 py-1 text-rose-200">
                        <span className="text-[11px] font-bold block leading-none font-sans">
                          {dayItems.length} event{dayItems.length === 1 ? "" : "s"}
                        </span>
                        <span className="text-[9.5px] text-rose-400/80 font-mono mt-0.5 block">
                          {touchesDue > 0 ? `${touchesDue} touch${touchesDue === 1 ? "" : "es"} due` : "enrollment activity"}
                        </span>
                      </div>
                    );
                  })()}
                  <div className="mt-1 space-y-1 overflow-y-auto max-h-[65px] [scrollbar-width:none]">
                    {dayItems.map(({ item, kind }, idx) => (
                      <button key={`${item.id}-${kind}-${idx}`} type="button" onClick={() => setSelectedId(item.id)} className="flex w-full flex-col gap-0.5 rounded-lg border border-zinc-800 bg-zinc-900/90 p-1.5 text-left text-[11px] font-sans hover:border-zinc-700 cursor-pointer">
                        <span className="truncate font-bold text-white font-sans">{item.prospectName ?? item.prospectEmail}</span>
                        <span className={cn("font-mono text-[9px]", kind === "next_touch" ? "text-amber-400/80" : kind === "exited" ? "text-emerald-400/80" : "text-sky-400/80")}>
                          {CALENDAR_KIND_LABEL[kind]}
                        </span>
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
  const [copied, setCopied] = useState(false);
  const [showRunActivity, setShowRunActivity] = useState(false);

  useEffect(() => {
    setCopied(false);
    setShowRunActivity(false);
  }, [item?.id]);

  const copyLink = useCallback(() => {
    if (!item?.freshRescheduleLink) return;
    navigator.clipboard.writeText(item.freshRescheduleLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [item]);

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
                    <span className="font-mono text-white">{new Date(item.exitedAt).toLocaleDateString(undefined, { month: "long", day: "numeric" })}{item.exitReason ? ` · ${exitReasonLabel(item.exitReason)}` : ""}</span>
                  </div>
                )}
              </div>

              {item.freshRescheduleLink && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 space-y-1.5">
                  <span className="flex items-center gap-1.5 text-[10.5px] font-mono text-zinc-500 uppercase">
                    <Link2 size={11} /> Single-use reschedule link
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 truncate rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[11px] font-mono text-zinc-300">
                      {item.freshRescheduleLink}
                    </span>
                    <button
                      type="button"
                      onClick={copyLink}
                      className="shrink-0 rounded-lg border border-zinc-800 bg-zinc-900 p-1.5 text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors cursor-pointer"
                    >
                      {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                    </button>
                  </div>
                </div>
              )}

              {item.runId && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowRunActivity((p) => !p)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left cursor-pointer hover:bg-zinc-900 transition-colors"
                  >
                    <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-300">
                      <SquishySkillBadge skill="win-back" size={14} enabled={true} />
                      Run activity
                    </span>
                    <ChevronDown size={13} className={cn("text-zinc-500 transition-transform", showRunActivity && "rotate-180")} />
                  </button>
                  {showRunActivity && (
                    <div className="px-3 pb-3 pt-1 border-t border-zinc-800/60">
                      <RunActivityPanel runId={item.runId} />
                      <a
                        href={`/dashboard/runs/${item.runId}`}
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
