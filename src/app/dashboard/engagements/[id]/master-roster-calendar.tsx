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
  Sparkles,
  MessageSquare,
  RefreshCw,
  Send,
  UserCheck,
  UserX,
  CalendarX,
  ExternalLink,
  Check,
  Copy,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/app/dashboard/runs/[id]/_shared/status-pill";
import { Sheet, SheetContent, SheetHeader, SheetBody, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { getDaysInMonthGrid, dateKey, timeStr } from "@/app/dashboard/runs/[id]/_shared/calendar-grid";
import type { MasterRosterEntry } from "@/app/api/engagements/[id]/roster/route";

type ViewMode = "calendar" | "list" | "board";

export function MasterRosterCalendar({ engagementId }: { engagementId: string }) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [entries, setEntries] = useState<MasterRosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ViewMode>("calendar");
  const [filterText, setFilterText] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed
  const monthString = `${year}-${String(month + 1).padStart(2, "0")}`;

  const fetchRoster = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/roster?month=${monthString}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries ?? []);
      }
    } catch {
      // Gracefully handled
    } finally {
      setLoading(false);
    }
  }, [engagementId, monthString]);

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  const filteredEntries = useMemo(() => {
    if (!filterText.trim()) return entries;
    const q = filterText.toLowerCase();
    return entries.filter(
      (e) =>
        (e.prospectName ?? "").toLowerCase().includes(q) ||
        (e.prospectEmail ?? "").toLowerCase().includes(q)
    );
  }, [entries, filterText]);

  const entriesByDate = useMemo(() => {
    const map: Record<string, MasterRosterEntry[]> = {};
    for (const entry of filteredEntries) {
      const k = dateKey(new Date(entry.callTime));
      (map[k] ??= []).push(entry);
    }
    return map;
  }, [filteredEntries]);

  const selectedEntry = useMemo(() => entries.find((e) => e.id === selectedId) ?? null, [entries, selectedId]);
  const gridDays = useMemo(() => getDaysInMonthGrid(year, month), [year, month]);
  const monthName = currentDate.toLocaleString("default", { month: "long" });

  return (
    <div className="space-y-3 font-sans antialiased">
      {/* ----------------------------------------------------------------- */}
      {/* TOOLBAR & VIEW SWITCHER                                           */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-2 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-500" />
            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Search bookings..."
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 py-1.5 pl-8 pr-2.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-700 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={fetchRoster}
            disabled={loading}
            className="flex items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <RefreshCw size={13} className={cn(loading && "animate-spin")} />
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-xl bg-zinc-900 p-1 border border-zinc-800 text-xs">
          <button
            type="button"
            onClick={() => setMode("calendar")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold transition-colors cursor-pointer",
              mode === "calendar" ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <CalendarIcon size={13} />
            <span>Calendar</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("list")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold transition-colors cursor-pointer",
              mode === "list" ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <List size={13} />
            <span>List</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("board")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold transition-colors cursor-pointer",
              mode === "board" ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <LayoutGrid size={13} />
            <span>Pipeline Board</span>
          </button>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 1. MASTER MONTH CALENDAR GRID                                      */}
      {/* ----------------------------------------------------------------- */}
      {mode === "calendar" && (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl">
          <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                type="button"
                onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer"
              >
                <ChevronRight size={15} />
              </button>

              <h3 className="text-sm font-bold text-white min-w-[130px]">
                {monthName} {year}
              </h3>

              <button
                type="button"
                onClick={() => setCurrentDate(new Date())}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-[11px] font-semibold text-zinc-200 hover:bg-zinc-700 cursor-pointer"
              >
                Today
              </button>
            </div>

            <div className="text-xs font-mono text-zinc-500">
              {entries.length} booking{entries.length === 1 ? "" : "s"} on roster
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-zinc-800 bg-zinc-900/40 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="border-r border-zinc-800/60 py-2 last:border-r-0">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 auto-rows-fr bg-zinc-950">
            {gridDays.map(({ date, isCurrentMonth }, idx) => {
              const k = dateKey(date);
              const dayEntries = entriesByDate[k] ?? [];
              const isToday = dateKey(new Date()) === k;

              return (
                <div
                  key={idx}
                  className={cn(
                    "flex min-h-[110px] flex-col border-b border-r border-zinc-800/60 p-1.5 transition-colors",
                    !isCurrentMonth && "bg-zinc-900/20 text-zinc-600",
                    isCurrentMonth && "hover:bg-zinc-900/30"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-full font-mono text-[11px] font-semibold",
                        isToday
                          ? "bg-emerald-500 text-zinc-950 font-bold"
                          : isCurrentMonth
                          ? "text-zinc-300"
                          : "text-zinc-600"
                      )}
                    >
                      {date.getDate()}
                    </span>
                  </div>

                  <div className="mt-1 space-y-1 overflow-y-auto max-h-[90px] [scrollbar-width:none]">
                    {dayEntries.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => setSelectedId(entry.id)}
                        className={cn(
                          "flex w-full flex-col gap-1 rounded-xl border p-1.5 text-left text-[11px] transition-all cursor-pointer",
                          entry.bookingStatus === "cancelled"
                            ? "border-rose-900/50 bg-rose-950/20 opacity-75"
                            : "border-zinc-800 bg-zinc-900/90 hover:border-zinc-700"
                        )}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate font-bold text-white">
                            {entry.prospectName ?? "Unnamed prospect"}
                          </span>
                          <span className="shrink-0 font-mono text-[9.5px] text-zinc-400">
                            {timeStr(entry.callTime)}
                          </span>
                        </div>

                   {/* MULTI-SKILL STATUS PILLS */}
<div className="flex flex-wrap items-center gap-1">
  {entry.bookingStatus === "cancelled" ? (
    <StatusPill tone="danger">Cancelled</StatusPill>
  ) : (
    <>
      {entry.preCallRead.status === "brief_delivered" && <StatusPill tone="success">Brief Sent</StatusPill>}
      {entry.preCallRead.status === "brief_failed" && <StatusPill tone="danger">Brief Failed</StatusPill>}
      {entry.preCallRead.status === "scheduled" && <StatusPill tone="info" className="font-mono">Brief Pending</StatusPill>}

      {entry.pileOn.status === "hybrid_sent" && <StatusPill tone="warning">AI Intro</StatusPill>}
      {entry.pileOn.status === "fallback_sent" && <StatusPill tone="info">Fallback Sent</StatusPill>}
      {entry.pileOn.status === "pending" && <StatusPill tone="neutral">Pile-On Pending</StatusPill>}
      
      {entry.winBack.status === "active" && <StatusPill tone="warning">Win-Back Active</StatusPill>}
      {entry.winBack.status === "rebooked" && <StatusPill tone="success">Rebooked</StatusPill>}
    </>
  )}
</div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* 2. DENSE LIST VIEW                                                */}
      {/* ----------------------------------------------------------------- */}
      {mode === "list" && (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/60 text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
                <th className="px-4 py-2.5">Call Time</th>
                <th className="px-4 py-2.5">Prospect</th>
                <th className="px-4 py-2.5">Platform</th>
                <th className="px-4 py-2.5">Brief Status</th>
                <th className="px-4 py-2.5">Follow-Up / Win-Back</th>
                <th className="px-4 py-2.5 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filteredEntries.map((entry) => (
                <tr key={entry.id} className="hover:bg-zinc-900/40">
                  <td className="px-4 py-3 font-mono text-zinc-300 whitespace-nowrap">
                    {new Date(entry.callTime).toLocaleDateString()} {timeStr(entry.callTime)}
                  </td>
                  <td className="px-4 py-3 font-bold text-white">
                    {entry.prospectName ?? "Unnamed"}
                    <span className="block text-[11px] font-normal text-zinc-500 font-mono">{entry.prospectEmail}</span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400 font-mono uppercase text-[10px]">
                    {entry.bookingPlatform ?? "Webhook"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill
                      tone={
                        entry.preCallRead.status === "brief_delivered"
                          ? "success"
                          : entry.preCallRead.status === "brief_failed"
                          ? "danger"
                          : "neutral"
                      }
                    >
                      {entry.preCallRead.status.replace("_", " ")}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {entry.pileOn.status !== "none" && <StatusPill tone="info">Pile-On Active</StatusPill>}
                      {entry.winBack.status !== "none" && <StatusPill tone="warning">Win-Back: {entry.winBack.status}</StatusPill>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedId(entry.id)}
                      className="rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-[11px] font-semibold text-zinc-200 hover:bg-zinc-700 cursor-pointer"
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* 3. PIPELINE KANBAN BOARD                                          */}
      {/* ----------------------------------------------------------------- */}
      {mode === "board" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { id: "scheduled", label: "Upcoming Calls", color: "border-sky-800/40" },
            { id: "brief_delivered", label: "Briefed & Ready", color: "border-emerald-800/40" },
            { id: "win_back", label: "In Win-Back Recovery", color: "border-amber-800/40" },
            { id: "cancelled", label: "Cancelled / Cold", color: "border-rose-800/40" },
          ].map((col) => {
            const colEntries = filteredEntries.filter((e) => {
              if (col.id === "cancelled") return e.bookingStatus === "cancelled";
              if (col.id === "win_back") return e.winBack.status === "active";
              if (col.id === "brief_delivered") return e.preCallRead.status === "brief_delivered";
              return e.bookingStatus === "scheduled" && e.winBack.status === "none";
            });

            return (
              <div key={col.id} className={cn("rounded-2xl border bg-zinc-950 p-3 space-y-2", col.color)}>
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2 px-1">
                  <span className="text-xs font-bold text-zinc-200">{col.label}</span>
                  <span className="rounded-md bg-zinc-900 px-2 py-0.5 text-[10px] font-mono font-bold text-zinc-400">
                    {colEntries.length}
                  </span>
                </div>

                <div className="space-y-2 max-h-[550px] overflow-y-auto pr-0.5">
                  {colEntries.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setSelectedId(entry.id)}
                      className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-900/90 p-3 hover:border-zinc-700 transition-all cursor-pointer space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white text-xs">{entry.prospectName ?? "Unnamed"}</span>
                        <span className="text-[10px] font-mono text-zinc-500">{timeStr(entry.callTime)}</span>
                      </div>
                      <span className="block text-[10.5px] font-mono text-zinc-400">{entry.prospectEmail}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* UNIFIED PROSPECT INSPECTOR DRAWER                                 */}
      {/* ----------------------------------------------------------------- */}
      <RosterInspectorDrawer entry={selectedEntry} onClose={() => setSelectedId(null)} onRefresh={fetchRoster} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// INSPECTOR SLIDE-OVER DRAWER
// ---------------------------------------------------------------------------
function RosterInspectorDrawer({
  entry,
  onClose,
  onRefresh,
}: {
  entry: MasterRosterEntry | null;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"brief" | "pile_on" | "win_back">("brief");

  if (!entry) return null;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Sheet open={!!entry} onOpenChange={(open) => !open && onClose()}>
      <SheetContent widthClassName="w-full sm:max-w-xl text-zinc-100">
        <div className="flex flex-col h-full space-y-4">
          <SheetHeader>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold">
                Unified Booking Inspector
              </span>
              <button
                type="button"
                onClick={() => handleCopy(entry.prospectEmail ?? "")}
                className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300 hover:text-white"
              >
                {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                <span>Copy Email</span>
              </button>
            </div>

            <SheetTitle className="text-lg font-bold text-white mt-1">{entry.prospectName ?? "Unnamed prospect"}</SheetTitle>
            <SheetDescription className="flex items-center gap-2 text-xs text-zinc-400">
              <Building2 size={13} />
              <span>
                {new Date(entry.callTime).toLocaleDateString()} at {timeStr(entry.callTime)} via {entry.bookingPlatform ?? "Calendar"}
              </span>
            </SheetDescription>
          </SheetHeader>

          {/* TAB HEADERS */}
          <div className="flex items-center gap-1 rounded-xl bg-zinc-900 p-1 border border-zinc-800 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("brief")}
              className={cn(
                "flex-1 py-1.5 rounded-lg font-bold transition-colors cursor-pointer text-center",
                activeTab === "brief" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              Pre-Call Brief
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("pile_on")}
              className={cn(
                "flex-1 py-1.5 rounded-lg font-bold transition-colors cursor-pointer text-center",
                activeTab === "pile_on" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              Pile-On Sequence
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("win_back")}
              className={cn(
                "flex-1 py-1.5 rounded-lg font-bold transition-colors cursor-pointer text-center",
                activeTab === "win_back" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              Win-Back Cadence
            </button>
          </div>

          <SheetBody className="space-y-4 pt-1">
            {activeTab === "brief" && (
              <div className="space-y-3">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
                  {entry.preCallRead.briefText ?? "No brief text synthesized for this call yet."}
                </div>
              </div>
            )}

            {activeTab === "pile_on" && (
              <div className="space-y-3 text-xs">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 space-y-1">
                  <span className="text-[10px] font-mono uppercase text-zinc-500 block">Personalized Intro</span>
                  <p className="text-zinc-200">{entry.pileOn.personalizedIntro ?? "Standard pre-call intro used."}</p>
                </div>
              </div>
            )}

            {activeTab === "win_back" && (
              <div className="space-y-3 text-xs">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 space-y-2">
                  <span className="text-[10px] font-mono uppercase text-zinc-500 block">Win-Back Status</span>
                  <p className="font-bold text-white capitalize">{entry.winBack.status}</p>
                  {entry.winBack.freshRescheduleLink && (
                    <a
                      href={entry.winBack.freshRescheduleLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-emerald-400 hover:underline text-[11px] font-mono"
                    >
                      <span>Open Fresh Reschedule Link</span>
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </div>
            )}
          </SheetBody>
        </div>
      </SheetContent>
    </Sheet>
  );
}