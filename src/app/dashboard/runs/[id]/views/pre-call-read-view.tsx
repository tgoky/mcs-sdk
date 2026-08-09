"use client";

import { useMemo, useState } from "react";
import {
  Clock,
  Search,
  Sparkles,
  Building2,
  StickyNote,
  CalendarCheck,
  MessageSquare,
  Send,
  Check,
  Copy,
  UserCheck,
  UserX,
  CalendarX,
  Maximize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ViewSwitcher, type RunViewMode } from "../_shared/view-switcher";
import { StatusPill } from "../_shared/status-pill";
import { Sheet, SheetContent, SheetHeader, SheetBody, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import type { BriefedCall, PreCallReadDetail } from "../_shared/types";
import type { RunStep } from "@/models/schema";
import { bookingPlatformLabel } from "@/lib/copy";

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

import { dateKey, timeStr } from "../_shared/calendar-grid";

export function PreCallReadView({
  detail,
  steps,
  onRefreshDetail,
}: {
  detail: PreCallReadDetail;
  steps: RunStep[];
  onRefreshDetail: () => void;
}) {
  const { run, calls } = detail;
  const [mode, setMode] = useState<RunViewMode>("calendar");
  // Tracked by id and re-derived from the live `calls` array (rather than
  // held as a raw snapshot object) so the drawer picks up fresh data —
  // outcome, delivery status — after onRefreshDetail() runs following a
  // mutation made from inside the drawer itself.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => calls.find((c) => c.id === selectedId) ?? null, [calls, selectedId]);
  const [filterText, setFilterText] = useState("");

  const filteredCalls = useMemo(() => {
    if (!filterText.trim()) return calls;
    const q = filterText.toLowerCase();
    return calls.filter((c) =>
      (c.prospectName ?? "").toLowerCase().includes(q)
    );
  }, [calls, filterText]);

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

  // The real log line this run wrote when it fetched its window — surfaced
  // verbatim instead of a fabricated summary, e.g. "2 call(s) found
  // (nightly)". Reverse-search so a later "success"/"skipped" entry wins
  // over an earlier "running" one for the same phase.
  const rosterFetchStep = useMemo(() => [...steps].reverse().find((s) => s.phase === "roster_fetch") ?? null, [steps]);

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
            placeholder="Search prospect name..."
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-1.5 pl-8 pr-2.5 text-xs text-zinc-200 font-sans placeholder:text-zinc-500 focus:border-zinc-700 focus:outline-none"
          />
        </div>

        <ViewSwitcher value={mode} onChange={setMode} />
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 2. DAY READOUT — this run's actual window, not a month grid.       */}
      {/* A single Pre-Call Read run only ever touches one, occasionally    */}
      {/* two, calendar dates (getTomorrowCalls / the dynamic-webhook lead- */}
      {/* time window) — see calendar-grid.ts's callers in booking.ts. A    */}
      {/* 42-cell month grid for that was the wrong shape and read as       */}
      {/* broken when a run found 0 calls. This reads like a printout of    */}
      {/* what the run actually checked: the real roster_fetch log line,   */}
      {/* then one spotlight card per date the run's calls fall on.        */}
      {/* The engagement-wide month calendar lives on the engagement page   */}
      {/* (roster-calendar.tsx) — this stays a single-run audit view.       */}
      {/* ----------------------------------------------------------------- */}
      {mode === "calendar" && (
        <div className="flex flex-col gap-3 font-sans">
          <div className="flex items-center gap-2.5 rounded-xl border border-zinc-800 bg-black/40 px-3 py-2.5 font-mono text-[11px]">
            <div className="h-3.5 w-1 shrink-0 rounded-full bg-emerald-500/80" />
            <span className="text-zinc-600">roster_fetch</span>
            <span className="text-zinc-700">·</span>
            <span className="text-zinc-400">
              {rosterFetchStep?.detail ?? "No roster-fetch step logged for this run"}
            </span>
            {run.stack?.booking_platform && (
              <>
                <span className="text-zinc-700">·</span>
                <span className="text-zinc-600">{bookingPlatformLabel(run.stack.booking_platform)}</span>
              </>
            )}
          </div>

          {callsByDay.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/50 py-14 text-zinc-600 font-sans">
              <CalendarX size={22} />
              <span className="text-xs">This run's window came back empty — nothing to brief.</span>
            </div>
          ) : (
            callsByDay.map(([dayKeyStr, dayCalls]) => {
              const d = new Date(dayKeyStr);
              const isToday = dateKey(new Date()) === dayKeyStr;
              return (
                <div key={dayKeyStr} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl font-sans">
                  <div className="flex items-center gap-4 border-b border-zinc-800 bg-zinc-900/60 px-5 py-4">
                    <div
                      className={cn(
                        "flex flex-col items-center justify-center rounded-xl w-14 h-14 shrink-0 leading-none",
                        isToday ? "bg-emerald-500 text-zinc-950" : "bg-zinc-900 border border-zinc-800 text-zinc-200"
                      )}
                    >
                      <span className="font-mono text-xl font-black">{d.getDate()}</span>
                      <span className="mt-0.5 text-[8.5px] font-bold uppercase tracking-wider opacity-70">
                        {d.toLocaleString("default", { month: "short" })}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-bold text-white font-sans">
                        {d.toLocaleDateString(undefined, { weekday: "long" })}
                        {isToday && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-emerald-400">Today</span>}
                      </span>
                      <span className="text-[11px] font-mono text-zinc-500">
                        {dayCalls.length} call{dayCalls.length === 1 ? "" : "s"} in this run's window
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col px-5 py-3">
                    {dayCalls.map((call, i) => {
                      const status = deriveStatus(call);
                      const isLast = i === dayCalls.length - 1;
                      return (
                        <button
                          key={call.id}
                          type="button"
                          onClick={() => setSelectedId(call.id)}
                          className="group flex items-stretch gap-3 text-left cursor-pointer"
                        >
                          <div className="flex w-2.5 shrink-0 flex-col items-center">
                            <div className="mt-4 h-2 w-2 shrink-0 rounded-full bg-zinc-600 transition-colors group-hover:bg-emerald-500" />
                            {!isLast && <div className="w-px flex-1 bg-zinc-800" />}
                          </div>
                          <div className="mb-2 flex flex-1 items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 transition-colors group-hover:border-zinc-700">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <span className="w-12 shrink-0 font-mono text-[10.5px] text-zinc-500">{timeStr(call.callTime)}</span>
                              <span className="truncate text-xs font-bold text-white font-sans">
                                {call.prospectName ?? "Unnamed prospect"}
                              </span>
                            </div>
                            <StatusPill tone={STATUS_META[status].tone} className="shrink-0">
                              {STATUS_META[status].label}
                            </StatusPill>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* 3. DENSE LIST VIEW                                                */}
      {/* ----------------------------------------------------------------- */}
      {mode === "list" && (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 font-sans">
          {callsByDay.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500 italic font-sans">
              No sales calls scheduled in this briefing window.
            </div>
          ) : (
            callsByDay.map(([day, dayCalls]) => (
              <div key={day}>
                <div className="border-b border-t border-zinc-800 bg-zinc-900/50 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-zinc-400 font-sans">
                  {new Date(day + "T00:00:00").toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                </div>
                <table className="w-full text-left text-xs font-sans">
                  <thead>
                    <tr className="border-b border-zinc-800/60 text-[10px] uppercase text-zinc-500 font-sans">
                      <th className="px-4 py-2 font-semibold">Prospect</th>
                      <th className="px-4 py-2 font-semibold">Call Time</th>
                      <th className="px-4 py-2 font-semibold">Match Score</th>
                      <th className="px-4 py-2 font-semibold">Status</th>
                      <th className="px-4 py-2 font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {dayCalls.map((call) => {
                      const status = deriveStatus(call);
                      return (
                        <tr key={call.id} className="border-b border-zinc-900 last:border-b-0 hover:bg-zinc-900/40 font-sans">
                          <td className="px-4 py-2.5 font-medium text-white font-sans">
                            {call.prospectName ?? "Unnamed prospect"}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-zinc-400">{timeStr(call.callTime)}</td>
                          <td className="px-4 py-2.5 text-zinc-400 font-mono">
                            {call.personMatchScore != null ? `${call.personMatchScore}/100` : "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            <StatusPill tone={STATUS_META[status].tone}>{STATUS_META[status].label}</StatusPill>
                          </td>
                          <td className="px-4 py-2.5 text-right font-sans">
                            <button
                              type="button"
                              onClick={() => setSelectedId(call.id)}
                              className="rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 hover:bg-zinc-800 cursor-pointer font-sans"
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
      {/* 4. ASANA-GRADE KANBAN BOARD VIEW                                  */}
      {/* ----------------------------------------------------------------- */}
      {mode === "board" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 font-sans">
          {(Object.keys(board) as CallStatus[]).map((status) => (
            <div key={status} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 flex flex-col gap-2 font-sans">
              <div className="mb-1 flex items-center justify-between px-1">
                <span className="text-xs font-bold text-zinc-300 font-sans">{STATUS_META[status].label}</span>
                <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded-md font-bold">
                  {board[status].length}
                </span>
              </div>

              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-0.5">
                {board[status].map((call) => {
                  const DestIcon = (call && DESTINATION_ICON[call.destinationDelivered ?? ""]) || MessageSquare;
                  const initials = (call.prospectName ?? "UN").slice(0, 2).toUpperCase();

                  return (
                    <button
                      key={call.id}
                      type="button"
                      onClick={() => setSelectedId(call.id)}
                      className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-900/90 hover:border-zinc-700 p-3 transition-all cursor-pointer group shadow-sm flex flex-col gap-2 font-sans"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold font-mono text-zinc-300 shrink-0">
                            {initials}
                          </div>
                          <div className="min-w-0 font-sans">
                            <p className="text-xs font-bold text-white group-hover:text-amber-400 transition-colors truncate font-sans">
                              {call.prospectName ?? "Unnamed prospect"}
                            </p>
                          </div>
                        </div>

                        <Maximize2 size={12} className="text-zinc-600 group-hover:text-zinc-300 shrink-0 mt-0.5" />
                      </div>

                      <div className="flex items-center gap-1 text-[10.5px] text-zinc-400 font-mono">
                        <Clock size={11} className="text-zinc-500 shrink-0" />
                        <span>{timeStr(call.callTime)}</span>
                        <span className="text-zinc-600">·</span>
                        <span>{new Date(call.callTime).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-zinc-800/80">
                        {call.personMatchScore != null && (
                          <span className="inline-flex items-center rounded-md bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 text-[9.5px] font-mono font-bold text-emerald-400">
                            {call.personMatchScore}/100 Match
                          </span>
                        )}

                        <span className="inline-flex items-center gap-1 rounded-md bg-zinc-800 px-1.5 py-0.5 text-[9.5px] font-mono text-zinc-300">
                          <DestIcon size={10} className="text-zinc-400" />
                          {call.destinationDelivered ?? run.stack?.brief_landing_destination ?? "Slack"}
                        </span>
                      </div>
                    </button>
                  );
                })}

                {board[status].length === 0 && (
                  <div className="rounded-xl border border-dashed border-zinc-900 p-4 text-center text-[10px] text-zinc-600 font-sans">
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
        onClose={() => setSelectedId(null)}
        destinationLabel={run.stack?.brief_landing_destination}
        onRefreshDetail={onRefreshDetail}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FULLY INTERACTIVE BRIEF DRAWER (STRICT FONT PERSISTENCE)
// ---------------------------------------------------------------------------
function BriefDrawer({
  call,
  onClose,
  destinationLabel,
  onRefreshDetail,
}: {
  call: BriefedCall | null;
  onClose: () => void;
  destinationLabel?: string;
  onRefreshDetail: () => void;
}) {
  const [prevCallId, setPrevCallId] = useState<string | null>(null);
  const [editableText, setEditableText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  const [loggedOutcome, setLoggedOutcome] = useState<"showed" | "no_show" | "rescheduled" | null>(null);
  const [outcomeSubmitting, setOutcomeSubmitting] = useState<"showed" | "no_show" | "rescheduled" | null>(null);
  const [outcomeError, setOutcomeError] = useState<string | null>(null);

  const [deliveryState, setDeliveryState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [deliveryError, setDeliveryError] = useState<string | null>(null);

  // Normalize undefined to null so (null !== null) is false when the drawer is closed
  const currentCallId = call?.id ?? null;
  if (currentCallId !== prevCallId) {
    setPrevCallId(currentCallId);
    setEditableText(call?.briefText ?? "");
    setIsEditing(false);
    // Seed from the server-confirmed value on the fresh call, not always
    // null — a call reopened after being outcome-logged (from here or
    // from Slack) should show that outcome, not reset to blank.
    setLoggedOutcome(call?.outcome ?? null);
    setOutcomeSubmitting(null);
    setOutcomeError(null);
    setDeliveryState("idle");
    setDeliveryError(null);
  }

  const handleCopyText = () => {
    navigator.clipboard.writeText(editableText || call?.briefText || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogOutcome = async (outcome: "showed" | "no_show" | "rescheduled") => {
    if (!call || outcomeSubmitting) return;
    setOutcomeSubmitting(outcome);
    setOutcomeError(null);
    try {
      const res = await fetch(`/api/pre-call-read/calls/${call.id}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to log outcome.");
      }
      setLoggedOutcome(outcome);
      onRefreshDetail();
    } catch (err) {
      setOutcomeError(err instanceof Error ? err.message : "Failed to log outcome.");
    } finally {
      setOutcomeSubmitting(null);
    }
  };

  const handleResendToSlack = async () => {
    if (!call || deliveryState === "sending") return;
    setDeliveryState("sending");
    setDeliveryError(null);
    try {
      const res = await fetch(`/api/pre-call-read/calls/${call.id}/resend`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to resend brief to Slack.");
      }
      setDeliveryState("sent");
      onRefreshDetail();
      setTimeout(() => setDeliveryState("idle"), 2500);
    } catch (err) {
      setDeliveryState("error");
      setDeliveryError(err instanceof Error ? err.message : "Failed to resend brief to Slack.");
    }
  };

  const DestIcon = (call && DESTINATION_ICON[call.destinationDelivered ?? ""]) || MessageSquare;

  return (
    <Sheet open={!!call} onOpenChange={(open) => !open && onClose()}>
      {/* Explicit font-sans antialiased text-zinc-100 on the portal root prevents font mismatch */}
      <SheetContent widthClassName="w-full sm:max-w-xl font-sans antialiased text-zinc-100">
        {call && (
          <div className="flex flex-col h-full font-sans antialiased">
            <SheetHeader className="font-sans">
              <div className="flex items-center justify-between font-sans">
                <div className="flex items-center gap-2 text-amber-400">
                  <Sparkles size={15} />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 font-mono">
                    Executive Pre-Call Brief
                  </span>
                </div>
                <div className="flex items-center gap-1 font-sans">
                  <button
                    type="button"
                    onClick={handleCopyText}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white text-xs cursor-pointer transition-colors font-sans"
                  >
                    {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    <span className="font-sans">{copied ? "Copied" : "Copy Brief"}</span>
                  </button>
                </div>
              </div>

              <SheetTitle className="mt-2 text-lg font-bold font-sans text-white">
                {call.prospectName ?? "Unnamed prospect"}
              </SheetTitle>
              <SheetDescription className="flex items-center gap-1 text-xs text-zinc-400 font-sans">
                <Building2 size={12} /> Call time: {timeStr(call.callTime)} on {new Date(call.callTime).toLocaleDateString()}
              </SheetDescription>
            </SheetHeader>

            <SheetBody className="space-y-4 font-sans pt-2">
              {/* Metadata Cards */}
              <div className="grid grid-cols-2 gap-2 text-xs font-sans">
                <div className="space-y-0.5 rounded-xl border border-zinc-800 bg-zinc-900 p-2.5">
                  <span className="block text-[10px] font-mono uppercase text-zinc-500">Identity Match</span>
                  <p className="font-semibold text-zinc-200 font-sans">
                    {call.personMatchScore != null ? `${call.personMatchScore} / 100` : "Not Scored"}
                  </p>
                </div>
                <div className="space-y-0.5 rounded-xl border border-zinc-800 bg-zinc-900 p-2.5">
                  <span className="block text-[10px] font-mono uppercase text-zinc-500">Delivery Channel</span>
                  <p className="flex items-center gap-1 font-semibold text-zinc-200 font-sans">
                    <DestIcon size={12} className="text-zinc-400" />
                    {call.destinationDelivered ?? destinationLabel ?? "Slack"}
                  </p>
                </div>
              </div>

              {/* Editable Brief Document */}
              <div className="space-y-2 font-sans">
                <div className="flex items-center justify-between font-sans">
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
                    className="w-full p-3.5 rounded-xl border border-zinc-700 bg-zinc-900 text-xs font-sans text-zinc-200 focus:outline-none focus:border-zinc-500 leading-relaxed font-sans"
                  />
                ) : (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 text-xs leading-relaxed text-zinc-300 font-sans whitespace-pre-wrap">
                    {editableText || "No brief text generated for this call."}
                  </div>
                )}
              </div>

              {/* Log Call Outcome */}
              <div className="space-y-2 border-t border-zinc-800 pt-3 font-sans">
                <span className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                  Log Sales Call Outcome
                </span>
                <div className="grid grid-cols-3 gap-2 font-sans">
                  <button
                    type="button"
                    onClick={() => handleLogOutcome("showed")}
                    disabled={outcomeSubmitting !== null}
                    className={cn(
                      "flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer font-sans disabled:cursor-not-allowed disabled:opacity-60",
                      loggedOutcome === "showed"
                        ? "bg-emerald-500 text-zinc-950 border-emerald-400 font-bold"
                        : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700"
                    )}
                  >
                    <UserCheck size={13} />
                    <span className="font-sans">{outcomeSubmitting === "showed" ? "Logging…" : "Showed"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleLogOutcome("no_show")}
                    disabled={outcomeSubmitting !== null}
                    className={cn(
                      "flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer font-sans disabled:cursor-not-allowed disabled:opacity-60",
                      loggedOutcome === "no_show"
                        ? "bg-rose-500 text-white border-rose-400 font-bold"
                        : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700"
                    )}
                  >
                    <UserX size={13} />
                    <span className="font-sans">{outcomeSubmitting === "no_show" ? "Logging…" : "No-Show"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleLogOutcome("rescheduled")}
                    disabled={outcomeSubmitting !== null}
                    className={cn(
                      "flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer font-sans disabled:cursor-not-allowed disabled:opacity-60",
                      loggedOutcome === "rescheduled"
                        ? "bg-amber-500 text-zinc-950 border-amber-400 font-bold"
                        : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700"
                    )}
                  >
                    <CalendarX size={13} />
                    <span className="font-sans">{outcomeSubmitting === "rescheduled" ? "Logging…" : "Rescheduled"}</span>
                  </button>
                </div>
                {outcomeError && (
                  <p className="text-[11px] text-rose-400 font-sans">{outcomeError}</p>
                )}
              </div>

              {/* Dispatch Action */}
              <div className="pt-2 font-sans space-y-1.5">
                <button
                  type="button"
                  onClick={handleResendToSlack}
                  disabled={deliveryState === "sending"}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-zinc-100 text-zinc-950 font-bold text-xs hover:bg-white transition-colors cursor-pointer font-sans disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deliveryState === "sent" ? <Check size={13} /> : <Send size={13} />}
                  <span className="font-sans">
                    {deliveryState === "sending"
                      ? "Re-delivering Brief to Slack..."
                      : deliveryState === "sent"
                        ? "Sent to Slack"
                        : "Re-send Brief to Slack"}
                  </span>
                </button>
                {deliveryState === "error" && deliveryError && (
                  <p className="text-[11px] text-rose-400 font-sans text-center">{deliveryError}</p>
                )}
              </div>
            </SheetBody>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}