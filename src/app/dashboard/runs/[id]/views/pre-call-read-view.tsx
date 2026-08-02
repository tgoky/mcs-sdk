"use client";

import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Search,
  Sparkles,
  Building2,
  FileText,
  StickyNote,
  CalendarCheck,
  MessageSquare,
  Send,
  Check,
  Copy,
  UserCheck,
  UserX,
  CalendarX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ViewSwitcher, type RunViewMode } from "../_shared/view-switcher";
import { StatusPill } from "../_shared/status-pill";
import { Sheet, SheetContent, SheetHeader, SheetBody, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import type { BriefedCall, PreCallReadDetail } from "../_shared/types";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";
type CallStatus = "pending" | "brief_ready" | "delivered" | "failed";

function deriveStatus(call: BriefedCall): CallStatus {
  if (call.aiSynthesisStatus === "failed" || call.researchStatus === "failed") return "failed";
  if (call.briefDeliveredAt) return "delivered";
  if (call.aiSynthesisStatus === "completed") return "brief_ready";
  return "pending";
}

const STATUS_META: Record<CallStatus, { label: string; tone: Tone }> = {
  pending: { label: "Pending", tone: "neutral" },
  brief_ready: { label: "Brief ready", tone: "info" },
  delivered: { label: "Delivered", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
};

const DESTINATION_ICON: Record<string, typeof MessageSquare> = {
  slack: MessageSquare,
  crm_note: StickyNote,
  calendar_event: CalendarCheck,
};

function getDaysInMonthGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = (firstDay.getDay() + 6) % 7; // Monday = 0

  const days: { date: Date; isCurrentMonth: boolean }[] = [];
  for (let i = startDayOfWeek; i > 0; i--) days.push({ date: new Date(year, month, 1 - i), isCurrentMonth: false });
  for (let i = 1; i <= lastDay.getDate(); i++) days.push({ date: new Date(year, month, i), isCurrentMonth: true });
  const remaining = (days.length > 35 ? 42 : 35) - days.length;
  for (let i = 1; i <= remaining; i++) days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
  return days;
}

function dateKey(d: Date | string) {
  return new Date(d).toISOString().slice(0, 10);
}

function timeStr(d: string) {
  return new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function PreCallReadView({ detail }: { detail: PreCallReadDetail }) {
  const { run, calls } = detail;
  const [mode, setMode] = useState<RunViewMode>("calendar");
  const [selected, setSelected] = useState<BriefedCall | null>(null);
  const [filterText, setFilterText] = useState("");
  const [currentDate, setCurrentDate] = useState(() => (calls[0] ? new Date(calls[0].callTime) : new Date()));

  const filteredCalls = useMemo(() => {
    if (!filterText.trim()) return calls;
    const q = filterText.toLowerCase();
    return calls.filter((c) => (c.prospectName ?? "").toLowerCase().includes(q));
  }, [calls, filterText]);

  const callsByDate = useMemo(() => {
    const map: Record<string, BriefedCall[]> = {};
    for (const c of filteredCalls) {
      const k = dateKey(c.callTime);
      (map[k] ??= []).push(c);
    }
    return map;
  }, [filteredCalls]);

  const callsByDay = useMemo(() => {
    const map = new Map<string, BriefedCall[]>();
    for (const c of filteredCalls) {
      const k = dateKey(c.callTime);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(c);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filteredCalls]);

  const board = useMemo(() => {
    const cols: Record<CallStatus, BriefedCall[]> = { pending: [], brief_ready: [], delivered: [], failed: [] };
    for (const c of filteredCalls) cols[deriveStatus(c)].push(c);
    return cols;
  }, [filteredCalls]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const gridDays = useMemo(() => getDaysInMonthGrid(year, month), [year, month]);
  const monthName = currentDate.toLocaleString("default", { month: "long" });

  return (
    <div className="flex flex-col gap-3 font-sans antialiased">
      {/* ----------------------------------------------------------------- */}
      {/* 1. ASANA TOOLBAR (PERSISTENT SEARCH + VIEW SWITCHER)              */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-950 p-1.5 border border-zinc-800">
        <div className="relative w-64">
          <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-500" />
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Search prospect or company..."
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-1.5 pl-8 pr-2.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-700 focus:outline-none"
          />
        </div>

        <ViewSwitcher value={mode} onChange={setMode} />
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 2. CALENDAR VIEW                                                  */}
      {/* ----------------------------------------------------------------- */}
      {mode === "calendar" && (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl">
          <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-4 py-2.5">
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

              <h3 className="text-sm font-bold text-white min-w-[120px]">
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

            <div className="text-[11px] font-mono text-zinc-500">
              {calls.length} total call{calls.length === 1 ? "" : "s"}
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
              const dayCalls = callsByDate[k] ?? [];
              const isToday = dateKey(new Date()) === k;

              return (
                <div
                  key={idx}
                  className={cn(
                    "flex min-h-[95px] flex-col border-b border-r border-zinc-800/60 p-1.5 transition-colors",
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

                  <div className="mt-1 space-y-1 overflow-y-auto max-h-[75px] [scrollbar-width:none]">
                    {dayCalls.map((call) => {
                      const status = deriveStatus(call);
                      return (
                        <button
                          key={call.id}
                          type="button"
                          onClick={() => setSelected(call)}
                          className="flex w-full flex-col gap-0.5 rounded-lg border border-zinc-800 bg-zinc-900/90 p-1.5 text-left text-[11px] hover:border-zinc-700 cursor-pointer transition-all"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate font-bold text-white">{call.prospectName ?? "Unnamed prospect"}</span>
                            <span className="shrink-0 font-mono text-[9.5px] text-zinc-400">{timeStr(call.callTime)}</span>
                          </div>
                          <StatusPill tone={STATUS_META[status].tone} className="w-fit">
                            {STATUS_META[status].label}
                          </StatusPill>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* 3. DENSE LIST VIEW                                                */}
      {/* ----------------------------------------------------------------- */}
      {mode === "list" && (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
          {callsByDay.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500 italic">
              No sales calls scheduled in this briefing window.
            </div>
          ) : (
            callsByDay.map(([day, dayCalls]) => (
              <div key={day}>
                <div className="border-b border-t border-zinc-800 bg-zinc-900/50 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-zinc-400">
                  {new Date(day + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                </div>
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800/60 text-[10px] uppercase text-zinc-500">
                      <th className="px-4 py-2 font-semibold">Prospect</th>
                      <th className="px-4 py-2 font-semibold">Call time</th>
                      <th className="px-4 py-2 font-semibold">Match score</th>
                      <th className="px-4 py-2 font-semibold">Status</th>
                      <th className="px-4 py-2 font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {dayCalls.map((call) => {
                      const status = deriveStatus(call);
                      return (
                        <tr key={call.id} className="border-b border-zinc-900 last:border-b-0 hover:bg-zinc-900/40">
                          <td className="px-4 py-2.5 font-medium text-white">{call.prospectName ?? "Unnamed prospect"}</td>
                          <td className="px-4 py-2.5 font-mono text-zinc-400">{timeStr(call.callTime)}</td>
                          <td className="px-4 py-2.5 text-zinc-400">{call.personMatchScore != null ? `${call.personMatchScore}` : "—"}</td>
                          <td className="px-4 py-2.5"><StatusPill tone={STATUS_META[status].tone}>{STATUS_META[status].label}</StatusPill></td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => setSelected(call)}
                              className="rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 hover:bg-zinc-800 cursor-pointer"
                            >
                              Open brief
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* 4. KANBAN BOARD VIEW                                              */}
      {/* ----------------------------------------------------------------- */}
      {mode === "board" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(board) as CallStatus[]).map((status) => (
            <div key={status} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
              <div className="mb-2.5 flex items-center justify-between px-1">
                <span className="text-xs font-bold text-zinc-300">{STATUS_META[status].label}</span>
                <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded-md font-bold">
                  {board[status].length}
                </span>
              </div>

              <div className="space-y-2">
                {board[status].map((call) => (
                  <button
                    key={call.id}
                    type="button"
                    onClick={() => setSelected(call)}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 p-2.5 text-left text-xs hover:border-zinc-700 cursor-pointer transition-all"
                  >
                    <p className="font-semibold text-white">{call.prospectName ?? "Unnamed prospect"}</p>
                    <p className="mt-1 flex items-center gap-1 text-[10px] text-zinc-400">
                      <Clock size={10} /> {timeStr(call.callTime)}
                    </p>
                  </button>
                ))}
                {board[status].length === 0 && (
                  <div className="rounded-xl border border-dashed border-zinc-900 p-4 text-center text-[10px] text-zinc-600">
                    No calls in this stage
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* 5. INTERACTIVE EXECUTIVE BRIEF SLIDE-OVER DRAWER                  */}
      {/* ----------------------------------------------------------------- */}
      <BriefDrawer
        call={selected}
        onClose={() => setSelected(null)}
        destinationLabel={run.stack?.brief_landing_destination}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FULLY INTERACTIVE BRIEF DRAWER (EDITABLE, RE-SENDABLE, OUTCOME LOGGER)
// ---------------------------------------------------------------------------
function BriefDrawer({
  call,
  onClose,
  destinationLabel,
}: {
  call: BriefedCall | null;
  onClose: () => void;
  destinationLabel?: string;
}) {
  const [prevCallId, setPrevCallId] = useState<string | null>(null);
  const [editableText, setEditableText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isDelivering, setIsDelivered] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loggedOutcome, setLoggedOutcome] = useState<"showed" | "no_show" | "rescheduled" | null>(null);

  // Synchronize state DURING render when prop changes (React recommended pattern)
  if (call?.id !== prevCallId) {
    setPrevCallId(call?.id ?? null);
    setEditableText(call?.briefText ?? "");
    setIsEditing(false);
    setLoggedOutcome(null);
  }

  const handleCopyText = () => {
    navigator.clipboard.writeText(editableText || call?.briefText || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogOutcome = (outcome: "showed" | "no_show" | "rescheduled") => {
    setLoggedOutcome(outcome);
    // In production, this fires a POST to /api/webhooks/slack/interactions or logs to briefOutcomeLog
  };

  const DestIcon = (call && DESTINATION_ICON[call.destinationDelivered ?? ""]) || MessageSquare;

  return (
    <Sheet open={!!call} onOpenChange={(open) => !open && onClose()}>
      <SheetContent widthClassName="w-full sm:max-w-xl">
        {call && (
          <>
            <SheetHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-400">
                  <Sparkles size={15} />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 font-mono">
                    Executive Pre-Call Brief
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleCopyText}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white text-xs cursor-pointer"
                  >
                    {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    <span>{copied ? "Copied" : "Copy Brief"}</span>
                  </button>
                </div>
              </div>

              <SheetTitle className="mt-2 text-lg font-bold">{call.prospectName ?? "Unnamed prospect"}</SheetTitle>
              <SheetDescription className="flex items-center gap-1 text-xs text-zinc-400">
                <Building2 size={12} /> Call time: {timeStr(call.callTime)} on {new Date(call.callTime).toLocaleDateString()}
              </SheetDescription>
            </SheetHeader>

            <SheetBody className="space-y-4">
              {/* Metadata Cards */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="space-y-0.5 rounded-xl border border-zinc-800 bg-zinc-900 p-2.5">
                  <span className="block text-[10px] font-mono uppercase text-zinc-500">Identity Match</span>
                  <p className="font-semibold text-zinc-200">
                    {call.personMatchScore != null ? `${call.personMatchScore} / 100` : "Not Scored"}
                  </p>
                </div>
                <div className="space-y-0.5 rounded-xl border border-zinc-800 bg-zinc-900 p-2.5">
                  <span className="block text-[10px] font-mono uppercase text-zinc-500">Delivery Channel</span>
                  <p className="flex items-center gap-1 font-semibold text-zinc-200">
                    <DestIcon size={12} className="text-zinc-400" />
                    {call.destinationDelivered ?? destinationLabel ?? "Slack"}
                  </p>
                </div>
              </div>

              {/* Editable Brief Document */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                    Synthesized Brief Content
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsEditing((p) => !p)}
                    className="text-[11px] font-mono text-zinc-400 hover:text-white underline cursor-pointer"
                  >
                    {isEditing ? "Done Editing" : "Edit Brief Text"}
                  </button>
                </div>

                {isEditing ? (
                  <textarea
                    value={editableText}
                    onChange={(e) => setEditableText(e.target.value)}
                    rows={12}
                    className="w-full p-3.5 rounded-xl border border-zinc-700 bg-zinc-900 text-xs font-sans text-zinc-200 focus:outline-none focus:border-zinc-500 leading-relaxed"
                  />
                ) : (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 text-xs leading-relaxed text-zinc-300 font-sans whitespace-pre-wrap">
                    {editableText || "No brief text generated for this call."}
                  </div>
                )}
              </div>

              {/* Log Call Outcome (Interactivity Integration) */}
              <div className="space-y-2 border-t border-zinc-800 pt-3">
                <span className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                  Log Sales Call Outcome
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleLogOutcome("showed")}
                    className={cn(
                      "flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer",
                      loggedOutcome === "showed"
                        ? "bg-emerald-500 text-zinc-950 border-emerald-400 font-bold"
                        : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700"
                    )}
                  >
                    <UserCheck size={13} />
                    <span>Showed</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleLogOutcome("no_show")}
                    className={cn(
                      "flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer",
                      loggedOutcome === "no_show"
                        ? "bg-rose-500 text-white border-rose-400 font-bold"
                        : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700"
                    )}
                  >
                    <UserX size={13} />
                    <span>No-Show</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleLogOutcome("rescheduled")}
                    className={cn(
                      "flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer",
                      loggedOutcome === "rescheduled"
                        ? "bg-amber-500 text-zinc-950 border-amber-400 font-bold"
                        : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700"
                    )}
                  >
                    <CalendarX size={13} />
                    <span>Rescheduled</span>
                  </button>
                </div>
              </div>

              {/* Dispatch Action */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setIsDelivered(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-zinc-100 text-zinc-950 font-bold text-xs hover:bg-white transition-colors cursor-pointer"
                >
                  <Send size={13} />
                  <span>{isDelivering ? "Re-delivering Brief to Slack..." : "Re-send Brief to Slack"}</span>
                </button>
              </div>
            </SheetBody>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}