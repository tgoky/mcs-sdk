"use client";

import { Fragment, useMemo, useState } from "react";
import {
  Search,
  MessageSquare,
  Send,
  Check,
  Copy,
  UserCheck,
  UserX,
  CalendarX,
  ChevronDown,
  ChevronUp,
  StickyNote,
  CalendarCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ViewSwitcher, type RunViewMode } from "../_shared/view-switcher";
import { StatusPill } from "../_shared/status-pill";
import type { BriefedCall, PreCallReadDetail } from "../_shared/types";
import type { RunStep } from "@/models/schema";
import { bookingPlatformLabel, briefDestinationLabel, phaseLabel } from "@/lib/copy";

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

/**
 * Horror Story #2 fix — a single source of truth for how identity
 * verification is described across the table row, the card badge, and the
 * drawer, replacing three separate "personMatchScore/100" renders. A raw
 * Rule-14 score (e.g. "30/100") reads as a data-quality problem to a rep
 * who doesn't know what Rule 14 is, and the card badge specifically used
 * to render ANY score in green with the word "Match" — actively
 * misleading for a low score that means the opposite of a confirmed
 * match. `tone` lets each call site pick success styling only when
 * verification actually happened.
 */
function matchLabel(call: BriefedCall): { text: string; tone: Tone } {
  if (call.researchStatus === "completed") return { text: "Verified", tone: "success" };
  if (call.researchStatus === "failed") return { text: "Research failed", tone: "warning" };
  if (call.researchStatus === "skipped_low_confidence") return { text: "Not verified", tone: "neutral" };
  return { text: "Not scored", tone: "neutral" };
}

/**
 * The real reason a brief wasn't sent, sourced from the run's own step
 * log instead of a hardcoded fallback string — fix for the drawer/card
 * showing "Brief generation failed" while the step timeline showed the
 * actual reason (e.g. a missing Slack webhook) right next to it. Matched
 * by prospect name since BriefedCall doesn't carry email and logStep's
 * label is `${name} (${email})` — good enough for the realistic case of
 * a handful of calls per run; falls back to null (card shows a generic
 * line) if no name is on the call or no matching step is found.
 */
function findDeliveryFailureDetail(steps: RunStep[], call: BriefedCall): string | null {
  if (!call.prospectName) return null;
  const step = [...steps]
    .reverse()
    .find((s) => s.phase === "delivery" && s.status === "failed" && s.label?.startsWith(call.prospectName!));
  return step?.detail ?? null;
}

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
  const [filterText, setFilterText] = useState("");
  // Only used by the list view's inline expand-in-place row (not a
  // separate overlay/drawer) — clicking a row reveals the same CallCard
  // content directly beneath it in the table's own flow.
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f8f7fa] dark:bg-zinc-950 p-1.5 border border-zinc-200 dark:border-zinc-800">
        <div className="relative w-64">
          <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-500 dark:text-zinc-500" />
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Search prospect name..."
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-1.5 pl-8 pr-2.5 text-xs text-zinc-800 dark:text-zinc-200 font-sans placeholder:text-zinc-500 focus:border-zinc-400 dark:focus:border-zinc-700 focus:outline-none"
          />
        </div>

        <ViewSwitcher value={mode} onChange={setMode} modes={["calendar", "list"]} />
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
        <div key="calendar" className="run-view-content-enter flex flex-col gap-3 font-sans">
          <div className="flex items-center gap-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/40 dark:bg-black/40 px-3 py-2.5 text-[11px] font-sans">
            <div className="h-3.5 w-1 shrink-0 rounded-full bg-emerald-500/80" />
            <span className="text-zinc-600 dark:text-zinc-400 font-semibold">{phaseLabel("roster_fetch")}</span>
            <span className="text-zinc-400 dark:text-zinc-700">·</span>
            <span className="text-zinc-600 dark:text-zinc-400">
              {rosterFetchStep?.detail ?? "We haven't checked for calls on this run yet"}
            </span>
            {run.stack?.booking_platform && (
              <>
                <span className="text-zinc-400 dark:text-zinc-700">·</span>
                <span className="text-zinc-700 dark:text-zinc-600">{bookingPlatformLabel(run.stack.booking_platform)}</span>
              </>
            )}
          </div>

          {callsByDay.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa]/50 dark:bg-zinc-950/50 py-14 text-zinc-700 dark:text-zinc-600 font-sans">
              <CalendarX size={22} />
              <span className="text-xs">This run&apos;s window came back empty — nothing to brief.</span>
            </div>
          ) : (
            callsByDay.map(([dayKeyStr, dayCalls]) => {
              const d = new Date(dayKeyStr);
              const isToday = dateKey(new Date()) === dayKeyStr;
              return (
<div key={dayKeyStr} className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-transparent shadow-xl font-sans">                
                  <div className="flex items-center gap-4 border-b border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/60 px-5 py-4">
                    <div
                      className={cn(
                        "flex flex-col items-center justify-center rounded-xl w-14 h-14 shrink-0 leading-none",
                        isToday ? "bg-emerald-500 text-zinc-950" : "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200"
                      )}
                    >
                      <span className="font-mono text-xl font-black">{d.getDate()}</span>
                      <span className="mt-0.5 text-[8.5px] font-bold uppercase tracking-wider opacity-70">
                        {d.toLocaleString("default", { month: "short" })}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-bold text-zinc-900 dark:text-white font-sans">
                        {d.toLocaleDateString(undefined, { weekday: "long" })}
                        {isToday && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-emerald-400">Today</span>}
                      </span>
                      <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-500">
                        {dayCalls.length} call{dayCalls.length === 1 ? "" : "s"} in this run&apos;s window
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 px-5 py-4">
                    {dayCalls.map((call) => (
                      <CallCard key={call.id} call={call} steps={steps} destinationLabel={run.stack?.brief_landing_destination} onRefreshDetail={onRefreshDetail} />
                    ))}
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
        <div key="list" className="run-view-content-enter overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 font-sans">
          {callsByDay.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500 dark:text-zinc-500 italic font-sans">
              No sales calls scheduled in this briefing window.
            </div>
          ) : (
            callsByDay.map(([day, dayCalls]) => (
              <div key={day}>
                <div className="border-b border-t border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-400 font-sans">
                  {new Date(day + "T00:00:00").toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                </div>
                <table className="w-full text-left text-xs font-sans">
                  <thead>
                    <tr className="border-b border-zinc-200/60 dark:border-zinc-800/60 text-[10px] uppercase text-zinc-500 dark:text-zinc-500 font-sans">
                      <th className="px-4 py-2 font-semibold">Prospect</th>
                      <th className="px-4 py-2 font-semibold">Call Time</th>
                      <th className="px-4 py-2 font-semibold">Identity</th>
                      <th className="px-4 py-2 font-semibold">Status</th>
                      <th className="px-4 py-2 font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {dayCalls.map((call) => {
                      const status = deriveStatus(call);
                      const isExpanded = expandedId === call.id;
                      return (
                        <Fragment key={call.id}>
                          <tr
                            onClick={() => setExpandedId(isExpanded ? null : call.id)}
                            className={cn(
                              "cursor-pointer border-b border-zinc-200 dark:border-zinc-900 hover:bg-zinc-100/40 dark:hover:bg-zinc-900/40 font-sans",
                              isExpanded && "border-b-0 bg-zinc-100/60 dark:bg-zinc-900/60"
                            )}
                          >
                            <td className="px-4 py-2.5 font-medium text-zinc-900 dark:text-white font-sans">
                              {call.prospectName ?? "Unnamed prospect"}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-zinc-600 dark:text-zinc-400">{timeStr(call.callTime)}</td>
                            <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400 font-mono">
                              {matchLabel(call).text}
                            </td>
                            <td className="px-4 py-2.5">
                              <StatusPill tone={STATUS_META[status].tone}>{STATUS_META[status].label}</StatusPill>
                            </td>
                            <td className="px-4 py-2.5 text-right font-sans">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedId(isExpanded ? null : call.id);
                                }}
                                className="inline-flex items-center gap-1 rounded-lg bg-zinc-900 dark:bg-white px-2.5 py-1.5 text-[11px] font-bold text-white dark:text-zinc-950 hover:bg-zinc-700 dark:hover:bg-zinc-200 cursor-pointer font-sans"
                              >
                                {isExpanded ? "Hide" : "View"}
                                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="border-b border-zinc-200 dark:border-zinc-900 last:border-b-0">
                              <td colSpan={5} className="bg-zinc-50/60 dark:bg-black/20 px-4 py-4">
                                <CallCard call={call} steps={steps} destinationLabel={run.stack?.brief_landing_destination} onRefreshDetail={onRefreshDetail} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      )}

      {/* Card-level detail replaces the old slide-over drawer — see CallCard
          below. Nothing rendered here; each call's full info (identity,
          destination, brief text, outcome logging, resend) is already on
          its card in both the calendar and list views above. */}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FULLY INTERACTIVE CALL CARD — everything the old drawer showed, rendered
// directly in place. Fix for "users have to click into a drawer to see
// info that should just be on the card" — identity, destination, the brief
// itself, outcome logging, and resend are all here with no click required
// to reveal them (list view still needs one click to reveal the card at
// all, since a dense table can't show every card at once — but nothing is
// hidden inside it once open).
// ---------------------------------------------------------------------------
function CallCard({
  call,
  steps,
  destinationLabel,
  onRefreshDetail,
}: {
  call: BriefedCall;
  steps: RunStep[];
  destinationLabel?: string;
  onRefreshDetail: () => void;
}) {
  const status = deriveStatus(call);
  const [editableText, setEditableText] = useState(call.briefText ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  const [loggedOutcome, setLoggedOutcome] = useState<"showed" | "no_show" | "rescheduled" | null>(call.outcome ?? null);
  const [outcomeSubmitting, setOutcomeSubmitting] = useState<"showed" | "no_show" | "rescheduled" | null>(null);
  const [outcomeError, setOutcomeError] = useState<string | null>(null);

  const [deliveryState, setDeliveryState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [deliveryError, setDeliveryError] = useState<string | null>(null);

  const handleCopyText = () => {
    navigator.clipboard.writeText(editableText || call.briefText || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogOutcome = async (outcome: "showed" | "no_show" | "rescheduled") => {
    if (outcomeSubmitting) return;
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
    if (deliveryState === "sending") return;
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

  const DestIcon = DESTINATION_ICON[call.destinationDelivered ?? ""] || MessageSquare;
  // Real reason, not a guess — see findDeliveryFailureDetail's comment.
  // Covers both true failures and the "brief exists, wasn't sent" state.
  const stepDetail = status === "failed" || (status === "brief_ready" && !call.briefDeliveredAt)
    ? findDeliveryFailureDetail(steps, call)
    : null;

  return (
   <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-transparent shadow-sm font-sans antialiased overflow-hidden">
      {/* Header: prospect, time, status — all visible with no click */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-zinc-900 dark:text-white">{call.prospectName ?? "Unnamed prospect"}</p>
          <p className="mt-0.5 text-[11px] font-mono text-zinc-500 dark:text-zinc-500">
            {timeStr(call.callTime)} on {new Date(call.callTime).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusPill tone={STATUS_META[status].tone}>{STATUS_META[status].label}</StatusPill>
          <button
            type="button"
            onClick={handleCopyText}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-[11px] font-semibold cursor-pointer transition-colors"
          >
            {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3.5">
        {/* Metadata — sent-to only claims delivery once it actually
            happened. Fix: this used to fall back to the run's configured
            destination even when nothing had been delivered, so a call
            that failed to send still showed "Sent to: Slack message" as
            if it succeeded — the exact mismatch that broke trust. */}
        <div className="grid grid-cols-2 gap-2 text-xs">
         <div className="space-y-0.5 rounded-xl bg-transparent border border-zinc-200/60 dark:border-zinc-800/60 p-2.5">
            <span className="block text-[10px] font-mono uppercase text-zinc-500 dark:text-zinc-500">Prospect identity</span>
            <p className="font-semibold text-zinc-800 dark:text-zinc-200">{matchLabel(call).text}</p>
          </div>
 <div className="space-y-0.5 rounded-xl bg-transparent border border-zinc-200/60 dark:border-zinc-800/60 p-2.5">
            <span className="block text-[10px] font-mono uppercase text-zinc-500 dark:text-zinc-500">Sent to</span>
            {call.briefDeliveredAt ? (
              <p className="flex items-center gap-1 font-semibold text-zinc-800 dark:text-zinc-200">
                <DestIcon size={12} className="text-zinc-600 dark:text-zinc-400" />
                {briefDestinationLabel(call.destinationDelivered ?? destinationLabel ?? "slack")}
              </p>
            ) : (
              <p className="font-semibold text-zinc-500 dark:text-zinc-500">Not sent yet</p>
            )}
          </div>
        </div>

        {/* Brief text — real failure/undelivered reason, never a hardcoded
            fallback string that could disagree with the step timeline. */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="block text-[10px] font-mono uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Call Brief</span>
            {call.briefText && (
              <button
                type="button"
                onClick={() => setIsEditing((p) => !p)}
                className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white underline cursor-pointer"
              >
                {isEditing ? "Done editing" : "Edit brief text"}
              </button>
            )}
          </div>

          {isEditing ? (
            <textarea
              value={editableText}
              onChange={(e) => setEditableText(e.target.value)}
              rows={10}
              className="w-full p-3.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-zinc-500 leading-relaxed"
            />
          ) : editableText ? (
           <div className="rounded-xl bg-transparent border border-zinc-200/60 dark:border-zinc-800/60 p-3.5 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
              {editableText}
            </div>
          ) : (
            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-950 p-3.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              {status === "failed"
                ? stepDetail
                  ? `Brief generation failed: ${stepDetail}`
                  : "Brief generation failed. Try regenerating from the run."
                : `${call.prospectName ?? "This prospect"}'s call hasn't been briefed yet.`}
            </div>
          )}

          {stepDetail && status === "brief_ready" && !call.briefDeliveredAt && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              Brief generated but not sent — {stepDetail}
            </p>
          )}
        </div>

        {/* Log Call Outcome — filled buttons, no borders */}
        <div className="space-y-1.5 border-t border-zinc-100 dark:border-zinc-800 pt-3">
          <span className="block text-[10px] font-mono uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Log Sales Call Outcome</span>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleLogOutcome("showed")}
              disabled={outcomeSubmitting !== null}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60",
                loggedOutcome === "showed"
                  ? "bg-emerald-500 text-zinc-950"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              )}
            >
              <UserCheck size={13} />
              {outcomeSubmitting === "showed" ? "Logging…" : "Showed"}
            </button>

            <button
              type="button"
              onClick={() => handleLogOutcome("no_show")}
              disabled={outcomeSubmitting !== null}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60",
                loggedOutcome === "no_show"
                  ? "bg-rose-500 text-white"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              )}
            >
              <UserX size={13} />
              {outcomeSubmitting === "no_show" ? "Logging…" : "No-Show"}
            </button>

            <button
              type="button"
              onClick={() => handleLogOutcome("rescheduled")}
              disabled={outcomeSubmitting !== null}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60",
                loggedOutcome === "rescheduled"
                  ? "bg-amber-500 text-zinc-950"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              )}
            >
              <CalendarX size={13} />
              {outcomeSubmitting === "rescheduled" ? "Logging…" : "Rescheduled"}
            </button>
          </div>
          {outcomeError && <p className="text-[11px] text-rose-600 dark:text-rose-400">{outcomeError}</p>}
        </div>

        {/* Resend — only offered once there's something to send */}
        {call.briefText && !call.briefDeliveredAt && (
          <div className="space-y-1">
            <button
              type="button"
              onClick={handleResendToSlack}
              disabled={deliveryState === "sending"}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 font-bold text-xs hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deliveryState === "sent" ? <Check size={13} /> : <Send size={13} />}
              {deliveryState === "sending"
                ? "Sending…"
                : deliveryState === "sent"
                  ? "Sent to Slack"
                  : "Send Brief to Slack"}
            </button>
            {deliveryState === "error" && deliveryError && (
              <p className="text-[11px] text-rose-600 dark:text-rose-400 text-center">{deliveryError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}