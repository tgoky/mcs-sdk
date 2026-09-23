"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Mail,
  MessageSquare,
  Link2,
  Wand2,
  UserCheck,
  Clock3,
  Search,
  Check,
  Copy,
  AlertCircle,
  SquareX,
  ChevronDown,
  Radio,
  ExternalLink,
  Pencil,
  Loader2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusPill } from "../_shared/status-pill";
import { formatDiaryDate } from "@/lib/format-datetime";
import { emailPlatformLabel } from "@/lib/copy";
import { missingWinBackMetaFor } from "@/lib/win-back-platform-readiness";
import type { WinBackDetail } from "../_shared/types";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

interface Touchpoint {
  key: string;
  /** The raw id inside winBackSequenceAssetMap.emails/.sms — what the
   * save endpoint matches against, separate from `key` (which is prefixed
   * to stay unique across both arrays combined). */
  id: string;
  type: "email" | "sms";
  offsetDays: number;
  subject?: string;
  body: string;
  date: Date;
}

const ENROLLMENT_META: Record<string, { label: string; tone: Tone }> = {
  active: { label: "Active in cadence", tone: "warning" },
  rebooked: { label: "Exited — rebooked", tone: "success" },
  reply_exited: { label: "Exited — replied", tone: "info" },
  manual_override: { label: "Exited — manual override", tone: "neutral" },
  lost: { label: "Exited — window elapsed", tone: "neutral" },
  corrected: { label: "Exited — outcome corrected", tone: "neutral" },
};

function dayLabel(offsetDays: number) {
  return offsetDays === 0 ? "Day 1 (immediate)" : `Day ${offsetDays + 1}`;
}

export function WinBackView({ detail }: { detail: WinBackDetail }) {
  const { run, enrollment, sendLog } = detail;
  // Which touchpoint's message body is expanded inline, if any — no more
  // slide-over drawer for this; a preview like this doesn't need its own
  // navigable surface, just to be readable in place.
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [manualExited, setManualExited] = useState<boolean>(false);

  // Local override so a saved edit shows immediately without needing the
  // parent run-detail fetch to re-run — starts as whatever the run
  // actually loaded, replaced wholesale once a save round-trips.
  const [assetMapOverride, setAssetMapOverride] = useState<typeof run.winBackSequenceAssetMap>(null);
  const assetMap = assetMapOverride ?? run.winBackSequenceAssetMap;

  // Delivery status — this run's `stack` already carries everything needed
  // to answer "where does this cadence actually go" (no separate fetch):
  // email_platform + email_platform_credentials_ref is set once, live-
  // verified, at engagement setup or Edit Stack Settings (see
  // use-email-integrations.ts and edit-stack-settings.tsx), and is exactly
  // what enrollProspectInWinBack (chat-winback.ts) and the real
  // cancellation-triggered enrollment path (pile-on/enrollment-service.ts)
  // both read before ever calling GHLCRMClient/HubSpotClient/etc. This view
  // used to show none of that — a fully wired, live CRM/ESP push looked
  // identical to a client with nothing connected at all.
  const stack = run.stack;
  const platform = stack?.email_platform ?? null;
  const isConnected = Boolean(platform && stack?.email_platform_credentials_ref);
  const isSmtp = platform === "smtp";
  // Same readiness check chat-winback.ts and enrollment-service.ts's real
  // call sites run before ever enrolling anyone — a connected platform
  // isn't enough on its own for Klaviyo/ActiveCampaign/GHL, each needs
  // its own list/workflow id set too. Not GHL-specific: every platform
  // with a real meta requirement gets the same check here.
  const missingMeta = platform && !isSmtp ? missingWinBackMetaFor(platform, stack ?? {}) : null;
  const stackSettingsHref = `/dashboard/engagements/${run.engagementId}?fixSection=email#stack-settings`;
  // Whether a new enrollment (the real cancellation-webhook path, via
  // gateOrExecute in approval-gate.ts) pushes to the CRM/ESP the moment
  // it's detected, or waits in the Queue for a human to approve first —
  // the same Autopilot/Co-Pilot toggle the Autopilot page's right rail
  // exposes per client (stack.require_approval_for_side_effects +
  // require_approval_action_types). Worth surfacing here too: this is
  // exactly the page where "does this actually push automatically"
  // confusion shows up.
  const requiresApproval =
    Boolean(stack?.require_approval_for_side_effects) &&
    (!stack?.require_approval_action_types?.length || stack.require_approval_action_types.includes("webhook_enrollment"));

  // Fall back to today's date if no enrollment exists yet (Preview / Template Mode)
  const enrolledAt = useMemo(() => {
    return enrollment?.enrolledAt ? new Date(enrollment.enrolledAt) : new Date();
  }, [enrollment]);

  const recoveryWindowDays = enrollment?.recoveryWindowDays ?? assetMap?.windowDays ?? 30;

  // Build touchpoint schedule from assetMap
  const touchpoints: Touchpoint[] = useMemo(() => {
    if (!assetMap) return [];
    const fromEmails: Touchpoint[] = (assetMap.emails ?? []).map((e) => ({
      key: `email-${e.id}`,
      id: e.id,
      type: "email" as const,
      offsetDays: e.offsetDays,
      subject: e.subject,
      body: e.body,
      date: new Date(enrolledAt.getTime() + e.offsetDays * 86_400_000),
    }));
    const fromSms: Touchpoint[] = (assetMap.sms ?? []).map((s) => ({
      key: `sms-${s.id}`,
      id: s.id,
      type: "sms" as const,
      offsetDays: s.offsetDays,
      body: s.body,
      date: new Date(enrolledAt.getTime() + s.offsetDays * 86_400_000),
    }));
    return [...fromEmails, ...fromSms].sort((a, b) => a.offsetDays - b.offsetDays);
  }, [assetMap, enrolledAt]);

  const filteredTouchpoints = useMemo(() => {
    if (!filterText.trim()) return touchpoints;
    const q = filterText.toLowerCase();
    return touchpoints.filter(
      (tp) =>
        dayLabel(tp.offsetDays).toLowerCase().includes(q) ||
        (tp.subject ?? "").toLowerCase().includes(q) ||
        tp.body.toLowerCase().includes(q)
    );
  }, [touchpoints, filterText]);

  const exitedOffsetDays = useMemo(() => {
    if (manualExited) return 0; // Stopped manually today
    if (!enrollment?.exitedAt) return null;
    const enrolledTime = new Date(enrollment.enrolledAt).getTime();
    return Math.floor((new Date(enrollment.exitedAt).getTime() - enrolledTime) / 86_400_000);
  }, [enrollment, manualExited]);

  function statusFor(tp: Touchpoint): { label: string; tone: Tone } {
    if (!enrollment) return { label: "Template step", tone: "neutral" };
    if (exitedOffsetDays != null && tp.offsetDays > exitedOffsetDays) {
      return { label: "Skipped — cadence exited", tone: "neutral" };
    }
    if (tp.offsetDays === 0) {
      const dayZeroLog = sendLog[0];
      if (dayZeroLog?.error) return { label: "Send failed", tone: "danger" };
      if (dayZeroLog?.sentVia === "hybrid") return { label: "Sent — personalized", tone: "success" };
      return { label: "Sent — template", tone: "success" };
    }
    return { label: tp.date.getTime() <= Date.now() ? "Scheduled" : "Upcoming", tone: "info" };
  }

  const currentStatusKey = manualExited ? "manual_override" : (enrollment?.status ?? "active");
  const meta = enrollment ? (ENROLLMENT_META[currentStatusKey] ?? ENROLLMENT_META.active) : null;
  const windowEnd = new Date(enrolledAt.getTime() + recoveryWindowDays * 86_400_000);

  const handleManualStopCadence = () => {
    if (confirm("Stop the win-back messages for this prospect? Use this if they've already rebooked another way, or you'd rather follow up yourself.")) {
      setManualExited(true);
    }
  };

  // Real editability — winBackSequenceAssetMap is read fresh at send time
  // for SMTP (processWinBackEmailSmtpSequence), so a save here changes
  // exactly what future scheduled touchpoints send. For an ESP platform
  // (Klaviyo/HubSpot/ActiveCampaign/GHL), day-N content lives in that
  // platform's own workflow, built by the buyer — this only updates the
  // reference copy shown here and in the export bundle, not what their
  // workflow sends. Said plainly in the edit form itself (editNote below).
  async function handleSaveTouchpoint(type: "email" | "sms", id: string, subject: string | undefined, body: string): Promise<string | null> {
    try {
      const res = await fetch(`/api/engagements/${run.engagementId}/win-back/edit-cadence`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id, subject, body }),
      });
      const data = await res.json();
      if (!res.ok) return data.error ?? "Couldn't save.";

      setAssetMapOverride((prev) => {
        const current = prev ?? assetMap;
        if (!current) return prev;
        if (type === "email") {
          return { ...current, emails: current.emails.map((e) => (e.id === id ? { ...e, subject, body } : e)) };
        }
        return { ...current, sms: current.sms.map((s) => (s.id === id ? { ...s, body } : s)) };
      });
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Couldn't save.";
    }
  }

  const editNote = isSmtp
    ? "Saving updates what actually sends — this app reads this content fresh at send time."
    : platform
      ? `Saving updates your reference copy only — ${emailPlatformLabel(platform)}'s own workflow sends whatever you built there, not this text.`
      : "Saving updates your reference copy for this cadence.";

  return (
    <div className="flex flex-col gap-3 font-sans antialiased">
      {/* ----------------------------------------------------------------- */}
      {/* 0. DELIVERY STATUS — which platform (if any) actually sends this  */}
      {/* cadence. Shown regardless of enrollment state, since "is this     */}
      {/* even connected to anything" is a question worth answering before  */}
      {/* a single prospect ever enrolls.                                   */}
      {/* ----------------------------------------------------------------- */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs font-sans",
          isConnected
            ? missingMeta
              ? "border-amber-300 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/10 text-amber-900 dark:text-amber-200"
              : "border-zinc-200 dark:border-zinc-800 bg-transparent text-zinc-600 dark:text-zinc-400"
            : "border-amber-300 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/10 text-amber-900 dark:text-amber-200"
        )}
      >
        {isConnected ? (
          <>
            {isSmtp ? <Mail size={13} className="shrink-0" /> : <Radio size={13} className="shrink-0" />}
            <span>
              {isSmtp ? (
                <>Sending directly via {emailPlatformLabel(platform)} — this app owns the send schedule, no external CRM/ESP is involved.</>
              ) : missingMeta ? (
                <>
                  <strong className="font-semibold">{emailPlatformLabel(platform)} connected, but not ready</strong> — {missingMeta}
                </>
              ) : (
                <>Delivering live via <strong className="font-semibold">{emailPlatformLabel(platform)}</strong> — enrolling actually pushes this prospect into that platform&apos;s own automation.</>
              )}
            </span>
            <span
              title={
                requiresApproval
                  ? "New enrollments wait in the Queue for a human to approve before they push to the CRM/ESP. Change this under Modify → Automation mode on the client page."
                  : "New enrollments push to the CRM/ESP automatically, no approval step. Change this under Modify → Automation mode on the client page."
              }
              className={cn(
                "shrink-0 text-[10.5px] font-mono font-semibold px-1.5 py-0.5 rounded-md border",
                requiresApproval
                  ? "border-amber-300 dark:border-amber-800/60 text-amber-700 dark:text-amber-400"
                  : "border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400"
              )}
            >
              {requiresApproval ? "Co-Pilot — approval required" : "Autopilot"}
            </span>
            <Link
              href={stackSettingsHref}
              className="ml-auto inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:no-underline shrink-0"
            >
              Review connection <ExternalLink size={11} />
            </Link>
          </>
        ) : (
          <>
            <AlertCircle size={13} className="shrink-0" />
            <span>No email or SMS platform connected for this client yet — this cadence has nowhere to actually send beyond what&apos;s previewed below.</span>
            <Link
              href={stackSettingsHref}
              className="ml-auto inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:no-underline shrink-0"
            >
              Connect one <ExternalLink size={11} />
            </Link>
          </>
        )}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 1. CADENCE LIFECYCLE BANNER                                       */}
      {/* ----------------------------------------------------------------- */}
      {enrollment ? (
        <div className="font-sans">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 shrink-0">
                <UserCheck size={16} />
              </div>
              <div>
                {/* Both name and email, not just whichever one happened to
                    be set — this banner exists to answer "who is this,"
                    and an email-only fallback silently hid the name when
                    both were on file. */}
                <p className="flex items-center gap-1.5 flex-wrap font-sans">
                  <span className="text-base font-bold text-zinc-900 dark:text-white">
                    {enrollment.prospectName ?? "Unnamed prospect"}
                  </span>
                  {enrollment.prospectEmail && (
                    <span className="font-mono text-xs text-zinc-500 dark:text-zinc-500">{enrollment.prospectEmail}</span>
                  )}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-500 font-sans">
                  Enrolled {formatDiaryDate(enrollment.enrolledAt)} · {recoveryWindowDays}-day window ends {formatDiaryDate(windowEnd)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 font-sans">
              {meta && <StatusPill tone={meta.tone}>{meta.label}</StatusPill>}

              {enrollment.status === "active" && !manualExited && (
                <button
                  type="button"
                  onClick={handleManualStopCadence}
                  className="flex items-center gap-1.5 rounded-lg border border-rose-300 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40 cursor-pointer transition-colors font-sans shadow-elevation-1 hover:shadow-elevation-2 hover-lift press-settle"
                  title="Stop the automated sequence — use this if the prospect already rebooked elsewhere or replied directly"
                >
                  <SquareX size={12} /> Stop Cadence
                </button>
              )}

              {enrollment.freshRescheduleLink && (
                <a
                  href={enrollment.freshRescheduleLink}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors font-sans"
                >
                  <Link2 size={11} /> Reschedule link
                </a>
              )}
            </div>
          </div>

          {/* Fix: enrollment used to just report a status with no
              explanation of what the status actually means or what
              happens next — a reader had to already know what "Win-Back"
              does to make sense of "Active in cadence." Spelled out in
              plain language, and made status-aware so it stays accurate
              once the cadence exits instead of always describing "active." */}
          <p className="border-t border-zinc-200 dark:border-zinc-800 pt-2.5 text-xs text-zinc-600 dark:text-zinc-400 font-sans leading-relaxed">
            {manualExited || enrollment.status === "manual_override" ? (
              <>You stopped this sequence manually — no further messages will go out to this prospect.</>
            ) : enrollment.status === "rebooked" ? (
              <>This sequence stopped automatically because the prospect rebooked — no further messages went out after that.</>
            ) : enrollment.status === "reply_exited" ? (
              <>This sequence stopped automatically because the prospect replied — no further messages went out after that.</>
            ) : enrollment.status === "lost" ? (
              <>This sequence ran its full {recoveryWindowDays}-day window without the prospect rebooking or replying, so it closed out.</>
            ) : (
              <>
                What happens next: over the next {recoveryWindowDays} days, we&apos;ll automatically send this prospect the scheduled emails/texts below trying to get them rebooked. It stops the moment they reply or book again — or you can stop it yourself anytime with <span className="font-semibold text-zinc-700 dark:text-zinc-300">Stop Cadence</span> above.
              </>
            )}
          </p>
        </div>
      ) : (
        // Fix: same light-theme contrast bug as the run-failure banner
        // (bare dark colors with no `dark:` counterpart rendered as a
        // barely-visible pale box in light mode) — and the copy didn't
        // actually answer "is this mock data," it just used a label
        // ("Preview mode") that reads like a dev/test state. It isn't:
        // this run generated the real 30-day cadence content, it's just
        // not tied to a specific prospect yet — that only happens once
        // someone actually enrolls. Said plainly instead.
        <div className="flex items-center gap-2.5 rounded-2xl border border-amber-300 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/10 p-3.5 text-xs text-amber-950 dark:text-amber-200 font-sans">
          <Wand2 size={15} className="text-amber-600 dark:text-amber-400 shrink-0" />
          <span>
            <strong className="font-semibold text-amber-800 dark:text-amber-300">This is real, generated content — not a mock.</strong>{" "}
            No prospect has been enrolled in this cadence yet, so it&apos;s showing the standard 30-day sequence this run generated, unattached to anyone. It&apos;ll show a specific prospect once Win-Back actually enrolls one.
          </span>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* 2. SEARCH                                                         */}
      {/* ----------------------------------------------------------------- */}
      <div className="relative w-64">
        <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-500 dark:text-zinc-500" />
        <input
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Search touchpoint copy or day..."
          className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-1.5 pl-8 pr-2.5 text-xs text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-400 dark:focus:border-zinc-700 focus:outline-none font-sans"
        />
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 3. CHRONOLOGICAL CADENCE TIMELINE                                 */}
      {/* ----------------------------------------------------------------- */}
      {/* Fix: this used to be a full month-grid calendar with prev/next
          navigation — built for browsing many bookings across an entire
          engagement (see MasterRosterCalendar), not for one prospect's
          linear ~4-8-touchpoint, 30-day sequence. A month grid mostly
          showed empty cells and made you page through months to see a
          cadence you could read top-to-bottom in one screen. Replaced
          with a straight chronological list, same pattern as the
          pre-call-read view's day timeline. */}
      <CadenceTimeline
        enrolledAt={enrolledAt}
        windowDays={recoveryWindowDays}
        touchpoints={filteredTouchpoints}
        statusFor={statusFor}
        expandedKey={expandedKey}
        onToggle={(key) => setExpandedKey((prev) => (prev === key ? null : key))}
        hasEnrollment={!!enrollment}
        sendLog={sendLog}
        exitedOffsetDays={exitedOffsetDays}
        deliveryNote={
          !isConnected
            ? "No platform connected — later messages have nowhere to send yet."
            : isSmtp
              ? "The first message is confirmed sent directly. Later messages are queued in this app's own scheduler and sent directly (SMTP/Resend) — the dates above are when they're scheduled to send."
              : `The first message is confirmed sent directly. Later messages are queued in ${emailPlatformLabel(platform)}'s own automation to go out automatically — the dates above are when they're scheduled to send.`
        }
        editNote={editNote}
        onSaveTouchpoint={handleSaveTouchpoint}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CHRONOLOGICAL CADENCE TIMELINE — replaces the old month-grid calendar.
// Each row expands its message body inline below itself instead of
// opening a slide-over drawer — a preview like this doesn't need its own
// navigable surface, and a drawer was overkill for reading one message.
// ---------------------------------------------------------------------------
function CadenceTimeline({
  enrolledAt,
  windowDays,
  touchpoints,
  statusFor,
  expandedKey,
  onToggle,
  hasEnrollment,
  sendLog,
  exitedOffsetDays,
  deliveryNote,
  editNote,
  onSaveTouchpoint,
}: {
  enrolledAt: Date;
  windowDays: number;
  touchpoints: Touchpoint[];
  statusFor: (tp: Touchpoint) => { label: string; tone: Tone };
  expandedKey: string | null;
  onToggle: (key: string) => void;
  hasEnrollment: boolean;
  sendLog: WinBackDetail["sendLog"];
  exitedOffsetDays: number | null;
  deliveryNote: string;
  editNote: string;
  onSaveTouchpoint: (type: "email" | "sms", id: string, subject: string | undefined, body: string) => Promise<string | null>;
}) {
  const windowEnd = new Date(enrolledAt.getTime() + windowDays * 86_400_000);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const dayZeroLog = sendLog[0];

  // Inline edit state — one touchpoint editable at a time, same "expand
  // in place, no drawer" philosophy the rest of this view already uses.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function startEditing(tp: Touchpoint) {
    setEditingKey(tp.key);
    setDraftSubject(tp.subject ?? "");
    setDraftBody(tp.body);
    setSaveError(null);
  }

  function cancelEditing() {
    setEditingKey(null);
    setSaveError(null);
  }

  async function saveEditing(tp: Touchpoint) {
    if (!draftBody.trim()) {
      setSaveError("Message body can't be empty.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    const error = await onSaveTouchpoint(tp.type, tp.id, tp.type === "email" ? draftSubject.trim() : undefined, draftBody.trim());
    setSaving(false);
    if (error) {
      setSaveError(error);
      return;
    }
    setEditingKey(null);
  }

  function handleCopy(tp: Touchpoint) {
    const textToCopy = tp.subject ? `Subject: ${tp.subject}\n\n${tp.body}` : tp.body;
    navigator.clipboard.writeText(textToCopy);
    setCopiedKey(tp.key);
    setTimeout(() => setCopiedKey((k) => (k === tp.key ? null : k)), 2000);
  }

  return (
    <div className="font-sans">
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2.5 font-sans">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-sans">
          {hasEnrollment ? "Recovery cadence" : "Standard cadence template"}
        </h3>
        <span className="flex items-center gap-1 text-[11px] font-mono text-zinc-500 dark:text-zinc-500">
          <Clock3 size={11} /> {formatDiaryDate(enrolledAt)} – {formatDiaryDate(windowEnd)} ({windowDays}d)
        </span>
      </div>

      {touchpoints.length === 0 ? (
        <div className="p-8 text-center text-xs text-zinc-500 dark:text-zinc-500 italic font-sans">
          No recovery cadence content has been generated for this engagement yet.
        </div>
      ) : (
        <div className="flex flex-col py-3">
          {touchpoints.map((tp, i) => {
            const status = statusFor(tp);
            const isLast = i === touchpoints.length - 1;
            const expanded = expandedKey === tp.key;
            const copied = copiedKey === tp.key;
            const skipped = exitedOffsetDays != null && tp.offsetDays > exitedOffsetDays;
            return (
              <div key={tp.key} className="flex items-stretch gap-3">
                <div className="flex w-2.5 shrink-0 flex-col items-center">
                  <div
                    className={cn(
                      "mt-4 h-2 w-2 shrink-0 rounded-full transition-colors",
                      status.tone === "success"
                        ? "bg-[#424d77] dark:bg-[#c5b7ea]"
                        : status.tone === "danger"
                        ? "bg-rose-500"
                        : status.tone === "neutral"
                        ? "bg-zinc-300 dark:bg-zinc-700"
                        : "bg-zinc-300 dark:bg-zinc-600"
                    )}
                  />
                  {!isLast && <div className="w-px flex-1 bg-zinc-100 dark:bg-zinc-800" />}
                </div>
                <div className="mb-2 flex-1">
                  <button
                    type="button"
                    onClick={() => onToggle(tp.key)}
                    aria-expanded={expanded}
                    className="group flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors cursor-pointer hover-lift press-settle"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      {tp.type === "email" ? (
                        <Mail size={13} className="shrink-0 text-zinc-500 dark:text-zinc-500" />
                      ) : (
                        <MessageSquare size={13} className="shrink-0 text-zinc-500 dark:text-zinc-500" />
                      )}
                      <span className="truncate text-xs font-bold text-zinc-900 dark:text-white font-sans">{dayLabel(tp.offsetDays)}</span>
                      <span className="font-mono text-[10.5px] text-zinc-500 dark:text-zinc-500 shrink-0">{formatDiaryDate(tp.date)}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusPill tone={status.tone}>{status.label}</StatusPill>
                      <ChevronDown size={13} className={cn("text-zinc-400 transition-transform", expanded && "rotate-180")} />
                    </div>
                  </button>

                  {expanded && (
                    <div className="px-3 pb-3 pl-[1.9rem] space-y-3 font-sans">
                      {tp.offsetDays === 0 && dayZeroLog?.personalizedOpening && (
                        <div className="space-y-1.5 font-sans">
                          <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-amber-600 dark:text-amber-400">
                            <Wand2 size={11} /> AI-personalized opening actually delivered
                          </span>
                          <div className="rounded-lg border border-amber-300 dark:border-amber-900/40 bg-transparent p-3 text-xs leading-relaxed text-zinc-800 dark:text-zinc-200 font-sans">
                            {dayZeroLog.personalizedOpening}
                          </div>
                        </div>
                      )}

                      <div className="space-y-2 rounded-lg border border-zinc-200/60 dark:border-zinc-800/60 bg-transparent p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                            {tp.offsetDays === 0 ? "Standard Message" : "Message Content"}
                          </span>
                          {editingKey !== tp.key && (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => startEditing(tp)}
                                className="flex items-center gap-1 px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white text-[10.5px] cursor-pointer transition-colors font-sans"
                              >
                                <Pencil size={11} />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCopy(tp)}
                                className="flex items-center gap-1 px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white text-[10.5px] cursor-pointer transition-colors font-sans"
                              >
                                {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                                {copied ? "Copied" : "Copy"}
                              </button>
                            </div>
                          )}
                        </div>

                        {editingKey === tp.key ? (
                          <div className="space-y-2">
                            {tp.type === "email" && (
                              <input
                                value={draftSubject}
                                onChange={(e) => setDraftSubject(e.target.value)}
                                placeholder="Subject"
                                className="w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200 focus:border-zinc-400 dark:focus:border-zinc-600 focus:outline-none font-sans"
                              />
                            )}
                            <textarea
                              value={draftBody}
                              onChange={(e) => setDraftBody(e.target.value)}
                              rows={6}
                              className="w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300 focus:border-zinc-400 dark:focus:border-zinc-600 focus:outline-none font-sans resize-y"
                            />
                            <p className="text-[10.5px] text-zinc-500 dark:text-zinc-500 font-sans">{editNote}</p>
                            {saveError && <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 font-sans">⚠ {saveError}</p>}
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={cancelEditing}
                                disabled={saving}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[10.5px] font-semibold cursor-pointer transition-colors font-sans disabled:opacity-40"
                              >
                                <X size={11} /> Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => saveEditing(tp)}
                                disabled={saving}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:opacity-90 text-[10.5px] font-semibold cursor-pointer transition-colors font-sans disabled:opacity-40"
                              >
                                {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {tp.subject && <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 font-sans">Subject: {tp.subject}</p>}
                            <div className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-700 dark:text-zinc-300 font-sans">{tp.body}</div>
                          </>
                        )}
                      </div>

                      {skipped && (
                        <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-500 font-sans">
                          <AlertCircle size={13} className="text-zinc-600 dark:text-zinc-400 shrink-0" />
                          This touch was skipped — the prospect exited the cadence on Day {exitedOffsetDays! + 1}.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="border-t border-zinc-200 dark:border-zinc-800 pt-2 text-[10px] text-zinc-500 dark:text-zinc-500 font-sans">
        {deliveryNote}
      </p>
    </div>
  );
}