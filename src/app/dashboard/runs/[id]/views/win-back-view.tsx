"use client";

import { useMemo, useState } from "react";
import {
  Mail,
  MessageSquare,
  Link2,
  Sparkles,
  UserCheck,
  Clock3,
  Search,
  Check,
  Copy,
  AlertCircle,
  SquareX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusPill } from "../_shared/status-pill";
import { Sheet, SheetContent, SheetHeader, SheetBody, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import type { WinBackDetail } from "../_shared/types";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

interface Touchpoint {
  key: string;
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
  const [selected, setSelected] = useState<Touchpoint | null>(null);
  const [filterText, setFilterText] = useState("");
  const [manualExited, setManualExited] = useState<boolean>(false);

  const assetMap = run.winBackSequenceAssetMap;

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
      type: "email" as const,
      offsetDays: e.offsetDays,
      subject: e.subject,
      body: e.body,
      date: new Date(enrolledAt.getTime() + e.offsetDays * 86_400_000),
    }));
    const fromSms: Touchpoint[] = (assetMap.sms ?? []).map((s) => ({
      key: `sms-${s.id}`,
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

  return (
    <div className="flex flex-col gap-3 font-sans antialiased">
      {/* ----------------------------------------------------------------- */}
      {/* 1. CADENCE LIFECYCLE BANNER                                       */}
      {/* ----------------------------------------------------------------- */}
      {enrollment ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 p-4 font-sans">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 shrink-0">
              <UserCheck size={16} />
            </div>
            <div>
              <p className="text-sm font-bold text-zinc-900 dark:text-white font-sans">{enrollment.prospectName ?? enrollment.prospectEmail}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-500 font-sans">
                Enrolled {new Date(enrollment.enrolledAt).toLocaleDateString()} · {recoveryWindowDays}-day window ends {windowEnd.toLocaleDateString()}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 font-sans">
            {meta && <StatusPill tone={meta.tone}>{meta.label}</StatusPill>}
            
            {enrollment.status === "active" && !manualExited && (
              <button
                type="button"
                onClick={handleManualStopCadence}
                className="flex items-center gap-1.5 rounded-lg border border-rose-300 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40 cursor-pointer transition-colors font-sans"
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
          <Sparkles size={15} className="text-amber-600 dark:text-amber-400 shrink-0" />
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
        onSelect={setSelected}
        hasEnrollment={!!enrollment}
      />

      {/* ----------------------------------------------------------------- */}
      {/* 4. SLIDE-OVER TOUCHPOINT DETAIL DRAWER                            */}
      {/* ----------------------------------------------------------------- */}
      <TouchpointDrawer
        touchpoint={selected}
        onClose={() => setSelected(null)}
        sendLog={sendLog}
        exitedOffsetDays={exitedOffsetDays}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CHRONOLOGICAL CADENCE TIMELINE — replaces the old month-grid calendar
// ---------------------------------------------------------------------------
function CadenceTimeline({
  enrolledAt,
  windowDays,
  touchpoints,
  statusFor,
  onSelect,
  hasEnrollment,
}: {
  enrolledAt: Date;
  windowDays: number;
  touchpoints: Touchpoint[];
  statusFor: (tp: Touchpoint) => { label: string; tone: Tone };
  onSelect: (tp: Touchpoint) => void;
  hasEnrollment: boolean;
}) {
  const windowEnd = new Date(enrolledAt.getTime() + windowDays * 86_400_000);

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 shadow-xl font-sans">
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/60 px-4 py-2.5 font-sans">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-sans">
          {hasEnrollment ? "Recovery cadence" : "Standard cadence template"}
        </h3>
        <span className="flex items-center gap-1 text-[11px] font-mono text-zinc-500 dark:text-zinc-500">
          <Clock3 size={11} /> {enrolledAt.toLocaleDateString()} – {windowEnd.toLocaleDateString()} ({windowDays}d)
        </span>
      </div>

      {touchpoints.length === 0 ? (
        <div className="p-8 text-center text-xs text-zinc-500 dark:text-zinc-500 italic font-sans">
          No recovery cadence content has been generated for this engagement yet.
        </div>
      ) : (
        <div className="flex flex-col px-4 py-3">
          {touchpoints.map((tp, i) => {
            const status = statusFor(tp);
            const isLast = i === touchpoints.length - 1;
            return (
              <button
                key={tp.key}
                type="button"
                onClick={() => onSelect(tp)}
                className="group flex items-stretch gap-3 text-left cursor-pointer"
              >
                <div className="flex w-2.5 shrink-0 flex-col items-center">
                  <div
                    className={cn(
                      "mt-4 h-2 w-2 shrink-0 rounded-full transition-colors",
                      status.tone === "success"
                        ? "bg-emerald-500"
                        : status.tone === "danger"
                        ? "bg-rose-500"
                        : status.tone === "neutral"
                        ? "bg-zinc-300 dark:bg-zinc-700"
                        : "bg-zinc-300 dark:bg-zinc-600 group-hover:bg-amber-500"
                    )}
                  />
                  {!isLast && <div className="w-px flex-1 bg-zinc-100 dark:bg-zinc-800" />}
                </div>
                <div className="mb-2 flex flex-1 items-center justify-between gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/60 px-3 py-2 transition-colors group-hover:border-zinc-400 dark:group-hover:border-zinc-700">
                  <div className="flex min-w-0 items-center gap-2.5">
                    {tp.type === "email" ? (
                      <Mail size={13} className="shrink-0 text-zinc-500 dark:text-zinc-500" />
                    ) : (
                      <MessageSquare size={13} className="shrink-0 text-zinc-500 dark:text-zinc-500" />
                    )}
                    <span className="truncate text-xs font-bold text-zinc-900 dark:text-white font-sans">{dayLabel(tp.offsetDays)}</span>
                    <span className="font-mono text-[10.5px] text-zinc-500 dark:text-zinc-500 shrink-0">{tp.date.toLocaleDateString()}</span>
                  </div>
                  <StatusPill tone={status.tone} className="shrink-0">
                    {status.label}
                  </StatusPill>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <p className="border-t border-zinc-200 dark:border-zinc-800 bg-white/30 dark:bg-zinc-900/30 px-4 py-2 text-[10px] text-zinc-500 dark:text-zinc-500 font-sans">
        The first message is confirmed sent directly. Later messages are queued in your email/SMS platform to go out automatically — the dates above are when they&apos;re scheduled to send.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TOUCHPOINT DRAWER (EXPLICIT FONT PERSISTENCE ON PORTAL ROOT)
// ---------------------------------------------------------------------------
function TouchpointDrawer({
  touchpoint,
  onClose,
  sendLog,
  exitedOffsetDays,
}: {
  touchpoint: Touchpoint | null;
  onClose: () => void;
  sendLog: WinBackDetail["sendLog"];
  exitedOffsetDays: number | null;
}) {
  const [prevTpKey, setPrevTpKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Normalize undefined to null so (null !== null) is false when drawer is closed
  const currentTpKey = touchpoint?.key ?? null;
  if (currentTpKey !== prevTpKey) {
    setPrevTpKey(currentTpKey);
    setCopied(false);
  }

  const handleCopyText = () => {
    if (!touchpoint) return;
    const textToCopy = touchpoint.subject
      ? `Subject: ${touchpoint.subject}\n\n${touchpoint.body}`
      : touchpoint.body;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const dayZeroLog = sendLog[0];

  return (
    <Sheet open={!!touchpoint} onOpenChange={(open) => !open && onClose()}>
      {/* Explicit font-sans antialiased text-zinc-900 dark:text-zinc-100 on the portal root prevents font mismatch */}
      <SheetContent widthClassName="w-full sm:max-w-lg font-sans antialiased text-zinc-900 dark:text-zinc-100">
        {touchpoint && (
          <div className="flex flex-col h-full font-sans antialiased">
            <SheetHeader className="font-sans">
              <div className="flex items-center justify-between font-sans">
                <div className="flex items-center gap-2 text-amber-400 font-sans">
                  {touchpoint.type === "email" ? <Mail size={15} /> : <MessageSquare size={15} />}
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 font-mono">
                    {touchpoint.type === "email" ? "Recovery Email" : "Recovery Text Message"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyText}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white text-xs cursor-pointer transition-colors font-sans"
                >
                  {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  <span className="font-sans">{copied ? "Copied" : "Copy"}</span>
                </button>
              </div>

              <SheetTitle className="mt-1.5 text-base font-bold text-zinc-900 dark:text-white font-sans">{dayLabel(touchpoint.offsetDays)}</SheetTitle>
              <SheetDescription className="text-xs text-zinc-600 dark:text-zinc-400 font-sans">
                Scheduled to send {touchpoint.date.toLocaleDateString()}
              </SheetDescription>
            </SheetHeader>

            <SheetBody className="space-y-4 font-sans pt-2">
              {touchpoint.offsetDays === 0 && dayZeroLog?.personalizedOpening && (
                <div className="space-y-1.5 font-sans">
                  <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-amber-400">
                    <Sparkles size={11} /> AI-personalized opening actually delivered
                  </span>
                  <div className="rounded-xl border border-amber-900/40 bg-amber-950/10 p-3 text-xs leading-relaxed text-zinc-800 dark:text-zinc-200 font-sans">
                    {dayZeroLog.personalizedOpening}
                  </div>
                </div>
              )}

              <div className="space-y-2 font-sans">
                <span className="block text-[10px] font-mono uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                  {touchpoint.offsetDays === 0 ? "Standard Message" : "Message Content"}
                </span>
                {touchpoint.subject && (
                  <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 font-sans">Subject: {touchpoint.subject}</p>
                )}
                <div className="whitespace-pre-wrap rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/60 p-3.5 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300 font-sans">
                  {touchpoint.body}
                </div>
              </div>

              {exitedOffsetDays != null && touchpoint.offsetDays > exitedOffsetDays && (
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/40 p-2.5 text-[11px] text-zinc-500 dark:text-zinc-500 flex items-center gap-2 font-sans">
                  <AlertCircle size={13} className="text-zinc-600 dark:text-zinc-400 shrink-0" />
                  <span className="font-sans">This touch was skipped — the prospect exited the cadence on Day {exitedOffsetDays + 1}.</span>
                </div>
              )}
            </SheetBody>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}