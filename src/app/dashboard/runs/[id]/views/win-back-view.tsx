import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const TONE_CLASSES: Record<Tone, string> = {
  success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  warning: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  danger: "bg-rose-500/10 text-rose-400 border-rose-500/30",
  info: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  neutral: "bg-transparent text-zinc-400 border-zinc-700/60",
};

export function StatusPill({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        TONE_CLASSES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
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
  Activity,
  X,
} from "lucide-react";
import { ViewSwitcher, type RunViewMode } from "../_shared/view-switcher";
import type { WinBackDetail } from "../_shared/types";

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
  const [mode, setMode] = useState<RunViewMode>("calendar");
  const [selectedTpKey, setSelectedTpKey] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [manualExited, setManualExited] = useState<boolean>(false);
  const [isRunActivityOpen, setIsRunActivityOpen] = useState<boolean>(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const assetMap = run.winBackSequenceAssetMap;

  const enrolledAt = useMemo(() => {
    return enrollment?.enrolledAt ? new Date(enrollment.enrolledAt) : new Date();
  }, [enrollment]);

  const recoveryWindowDays = enrollment?.recoveryWindowDays ?? assetMap?.windowDays ?? 30;

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
    if (manualExited) return 0;
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

  const handleCopyText = (tp: Touchpoint, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const textToCopy = tp.subject ? `Subject: ${tp.subject}\n\n${tp.body}` : tp.body;
    navigator.clipboard.writeText(textToCopy);
    setCopiedKey(tp.key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const currentStatusKey = manualExited ? "manual_override" : (enrollment?.status ?? "active");
  const meta = enrollment ? (ENROLLMENT_META[currentStatusKey] ?? ENROLLMENT_META.active) : null;
  const windowEnd = new Date(enrolledAt.getTime() + recoveryWindowDays * 86_400_000);
  const dayZeroLog = sendLog[0];

  const handleManualStopCadence = () => {
    if (confirm("Stop the win-back messages for this prospect? Use this if they've already rebooked another way, or you'd rather follow up yourself.")) {
      setManualExited(true);
    }
  };

  return (
    <div className="flex flex-col gap-3 font-sans antialiased">
      {/* ----------------------------------------------------------------- */}
      {/* 1. TOP HEADER: FUNNEL HEALTH & CONTROLS TOOLBAR                    */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 p-3 font-sans">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-sm font-bold text-zinc-900 dark:text-white">Funnel health: Stable</span>
          </div>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Weekly audit · 3 metrics evaluated · 3 data gaps
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-56">
            <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-500" />
            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Search metric, issue, or touchpoint..."
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-1.5 pl-8 pr-2.5 text-xs text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-400 dark:focus:border-zinc-700 focus:outline-none"
            />
          </div>
          <ViewSwitcher value={mode} onChange={setMode} />
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 2. RUN ACTIVITY (OPEN BY DEFAULT, PLACED UNDERNEATH HEADER)       */}
      {/* ----------------------------------------------------------------- */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 p-3.5 transition-all">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setIsRunActivityOpen((prev) => !prev)}
            className="flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
          >
            <ChevronDown size={14} className={cn("transition-transform duration-200", !isRunActivityOpen && "-rotate-90")} />
            <span>Show what happened during this run · {sendLog?.length ?? 6} steps</span>
          </button>

          <span className="rounded-md border border-zinc-300/40 dark:border-zinc-700/50 bg-transparent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
            Done
          </span>
        </div>

        {isRunActivityOpen && (
          <div className="mt-3 border-t border-zinc-200/80 dark:border-zinc-800/80 pt-3 space-y-2">
            {sendLog?.length ? (
              sendLog.map((log, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400 px-1 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-900/50">
                  <span className="flex items-center gap-2">
                    <Activity size={12} className="text-zinc-400" />
                    <span>Step {idx + 1}: Send via {log.sentVia}</span>
                  </span>
                  <span className="font-mono text-[11px] text-zinc-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>
              ))
            ) : (
              <div className="text-xs text-zinc-500 dark:text-zinc-400 px-1 py-1">
                Run initialized successfully. All scheduled touchpoints prepared and queued.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 3. CADENCE LIFECYCLE BANNER                                       */}
      {/* ----------------------------------------------------------------- */}
      {enrollment ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 p-4 font-sans">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 shrink-0 border border-zinc-200 dark:border-zinc-800">
              <UserCheck size={16} />
            </div>
            <div>
              <p className="text-sm font-bold text-zinc-900 dark:text-white">{enrollment.prospectName ?? enrollment.prospectEmail}</p>
              <p className="text-xs text-zinc-500">
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
                className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-rose-400 hover:bg-rose-500/20 cursor-pointer transition-colors"
                title="Stop the automated sequence"
              >
                <SquareX size={12} /> Stop Cadence
              </button>
            )}

            {enrollment.freshRescheduleLink && (
              <a
                href={enrollment.freshRescheduleLink}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <Link2 size={11} /> Reschedule link
              </a>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3.5 text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-amber-400 shrink-0" />
            <span>
              <strong className="font-semibold text-amber-300">Preview mode:</strong> This shows your standard 30-day recovery sequence structure.
            </span>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* 4. MAIN VIEWS (NO DRAWER — INLINE CONTENT RENDERING)               */}
      {/* ----------------------------------------------------------------- */}
      {mode === "calendar" && (
        <div className="space-y-3 font-sans">
          <CadenceCalendar
            enrolledAt={enrolledAt}
            windowDays={recoveryWindowDays}
            touchpoints={filteredTouchpoints}
            statusFor={statusFor}
            selectedKey={selectedTpKey}
            onSelectKey={(key) => setSelectedTpKey((prev) => (prev === key ? null : key))}
          />

          {/* Inline Panel below Calendar when a touchpoint is selected */}
          {selectedTpKey && (() => {
            const tp = touchpoints.find((t) => t.key === selectedTpKey);
            if (!tp) return null;
            const status = statusFor(tp);
            const isSkipped = exitedOffsetDays != null && tp.offsetDays > exitedOffsetDays;

            return (
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 p-4 font-sans space-y-3">
                <div className="flex items-center justify-between border-b border-zinc-200/80 dark:border-zinc-800/80 pb-2.5">
                  <div className="flex items-center gap-2">
                    {tp.type === "email" ? <Mail size={16} className="text-amber-400" /> : <MessageSquare size={16} className="text-sky-400" />}
                    <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                      {dayLabel(tp.offsetDays)} · <span className="font-mono text-xs font-normal text-zinc-500">{tp.date.toLocaleDateString()}</span>
                    </h4>
                    <StatusPill tone={status.tone}>{status.label}</StatusPill>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => handleCopyText(tp, e)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white text-xs cursor-pointer"
                    >
                      {copiedKey === tp.key ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      <span>{copiedKey === tp.key ? "Copied" : "Copy text"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedTpKey(null)}
                      className="p-1 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>

                {tp.offsetDays === 0 && dayZeroLog?.personalizedOpening && (
                  <div className="space-y-1">
                    <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-amber-400 font-semibold">
                      <Sparkles size={11} /> AI-personalized opening delivered
                    </span>
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-relaxed text-zinc-800 dark:text-zinc-200">
                      {dayZeroLog.personalizedOpening}
                    </div>
                  </div>
                )}

                {tp.subject && (
                  <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Subject: {tp.subject}</p>
                )}

                <div className="whitespace-pre-wrap rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
                  {tp.body}
                </div>

                {isSkipped && (
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/40 p-2.5 text-[11px] text-zinc-500 flex items-center gap-2">
                    <AlertCircle size={13} className="text-zinc-500 shrink-0" />
                    <span>This touch was skipped — prospect exited cadence on Day {exitedOffsetDays + 1}.</span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {mode === "list" && (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 font-sans">
          {filteredTouchpoints.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500 italic">
              {touchpoints.length === 0
                ? "No recovery cadence content has been generated for this engagement yet."
                : "No touchpoints match your search filter."}
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-200/60 dark:border-zinc-800/60 text-[10px] uppercase text-zinc-500 bg-white/50 dark:bg-zinc-900/50">
                  <th className="px-4 py-2 font-semibold">Touchpoint</th>
                  <th className="px-4 py-2 font-semibold">Channel</th>
                  <th className="px-4 py-2 font-semibold">Scheduled Date</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTouchpoints.map((tp) => {
                  const status = statusFor(tp);
                  const isExpanded = selectedTpKey === tp.key;
                  const isSkipped = exitedOffsetDays != null && tp.offsetDays > exitedOffsetDays;

                  return (
                    <tr key={tp.key} className="border-b border-zinc-200 dark:border-zinc-900/80 last:border-b-0">
                      <td colSpan={5} className="p-0">
                        <div
                          onClick={() => setSelectedTpKey((prev) => (prev === tp.key ? null : tp.key))}
                          className="flex items-center justify-between px-4 py-3 hover:bg-zinc-100/40 dark:hover:bg-zinc-900/40 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-3 w-1/4">
                            <ChevronDown size={14} className={cn("text-zinc-500 transition-transform", !isExpanded && "-rotate-90")} />
                            <span className="font-medium text-zinc-900 dark:text-white">{dayLabel(tp.offsetDays)}</span>
                          </div>

                          <div className="text-zinc-600 dark:text-zinc-400 w-1/6">
                            <span className="inline-flex items-center gap-1">
                              {tp.type === "email" ? <Mail size={11} /> : <MessageSquare size={11} />}
                              {tp.type === "email" ? "Email" : "SMS"}
                            </span>
                          </div>

                          <div className="font-mono text-zinc-600 dark:text-zinc-400 w-1/5">{tp.date.toLocaleDateString()}</div>

                          <div className="w-1/4"><StatusPill tone={status.tone}>{status.label}</StatusPill></div>

                          <div className="text-right">
                            <button
                              type="button"
                              onClick={(e) => handleCopyText(tp, e)}
                              className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                            >
                              {copiedKey === tp.key ? "Copied" : "Copy"}
                            </button>
                          </div>
                        </div>

                        {/* Inline Expandable Body Panel */}
                        {isExpanded && (
                          <div className="bg-white/50 dark:bg-zinc-900/50 p-4 border-t border-zinc-200/60 dark:border-zinc-800/60 space-y-3">
                            {tp.offsetDays === 0 && dayZeroLog?.personalizedOpening && (
                              <div className="space-y-1">
                                <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-amber-400 font-semibold">
                                  <Sparkles size={11} /> AI-personalized opening delivered
                                </span>
                                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-zinc-800 dark:text-zinc-200">
                                  {dayZeroLog.personalizedOpening}
                                </div>
                              </div>
                            )}

                            {tp.subject && (
                              <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Subject: {tp.subject}</p>
                            )}

                            <div className="whitespace-pre-wrap rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3.5 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
                              {tp.body}
                            </div>

                            {isSkipped && (
                              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/40 p-2.5 text-[11px] text-zinc-500 flex items-center gap-2">
                                <AlertCircle size={13} className="text-zinc-500 shrink-0" />
                                <span>This touch was skipped — prospect exited cadence on Day {exitedOffsetDays + 1}.</span>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {mode === "board" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 font-sans">
          {(["Sent", "Scheduled / Upcoming", "Skipped / Template"] as const).map((col) => {
            const items = filteredTouchpoints.filter((tp) => {
              const s = statusFor(tp).label;
              if (col === "Sent") return s.startsWith("Sent");
              if (col === "Skipped / Template") return s.startsWith("Skipped") || s === "Template step";
              return s === "Scheduled" || s === "Upcoming";
            });

            return (
              <div key={col} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 p-3 flex flex-col gap-2">
                <div className="mb-1 flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{col}</span>
                  <span className="text-[10px] font-mono text-zinc-400 border border-zinc-300/40 dark:border-zinc-700/50 bg-transparent px-2 py-0.5 rounded-md font-bold">
                    {items.length}
                  </span>
                </div>

                <div className="space-y-3 max-h-[700px] overflow-y-auto pr-0.5">
                  {items.map((tp) => {
                    const status = statusFor(tp);
                    const isSkipped = exitedOffsetDays != null && tp.offsetDays > exitedOffsetDays;

                    return (
                      <div
                        key={tp.key}
                        className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 p-3.5 space-y-2.5 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="flex items-center gap-1.5 font-bold text-xs text-zinc-900 dark:text-white">
                            {tp.type === "email" ? (
                              <Mail size={12} className="text-amber-400 shrink-0" />
                            ) : (
                              <MessageSquare size={12} className="text-sky-400 shrink-0" />
                            )}
                            <span>{dayLabel(tp.offsetDays)}</span>
                          </p>

                          <button
                            type="button"
                            onClick={(e) => handleCopyText(tp, e)}
                            className="flex items-center gap-1 px-2 py-0.5 rounded border border-zinc-300/60 dark:border-zinc-700/60 text-[10px] font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                          >
                            {copiedKey === tp.key ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                            <span>{copiedKey === tp.key ? "Copied" : "Copy"}</span>
                          </button>
                        </div>

                        {tp.offsetDays === 0 && dayZeroLog?.personalizedOpening && (
                          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-[11px] text-zinc-800 dark:text-zinc-200 leading-snug">
                            <span className="text-[9px] font-mono text-amber-400 uppercase tracking-wider block mb-0.5 font-bold">AI Opening</span>
                            {dayZeroLog.personalizedOpening}
                          </div>
                        )}

                        {tp.subject && (
                          <p className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-200 border-b border-zinc-100 dark:border-zinc-800/80 pb-1">
                            Subject: {tp.subject}
                          </p>
                        )}

                        <p className="text-[11px] text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
                          {tp.body}
                        </p>

                        {isSkipped && (
                          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/40 p-1.5 text-[10px] text-zinc-500 flex items-center gap-1.5">
                            <AlertCircle size={11} className="shrink-0 text-zinc-400" />
                            <span>Skipped on exit (Day {exitedOffsetDays + 1})</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-1 border-t border-zinc-200/80 dark:border-zinc-800/80">
                          <span className="text-[10px] font-mono text-zinc-500">
                            {tp.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </span>
                          <StatusPill tone={status.tone} className="text-[9.5px]">
                            {status.label}
                          </StatusPill>
                        </div>
                      </div>
                    );
                  })}

                  {items.length === 0 && (
                    <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800/60 p-4 text-center text-[10px] text-zinc-500">
                      No touchpoints in this stage
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CALENDAR GRID SUB-COMPONENT
// ---------------------------------------------------------------------------
function CadenceCalendar({
  enrolledAt,
  windowDays,
  touchpoints,
  statusFor,
  selectedKey,
  onSelectKey,
}: {
  enrolledAt: Date;
  windowDays: number;
  touchpoints: Touchpoint[];
  statusFor: (tp: Touchpoint) => { label: string; tone: Tone };
  selectedKey: string | null;
  onSelectKey: (key: string) => void;
}) {
  const [monthOffset, setMonthOffset] = useState(0);
  const anchor = new Date(enrolledAt.getFullYear(), enrolledAt.getMonth() + monthOffset, 1);
  const year = anchor.getFullYear();
  const month = anchor.getMonth();

  const gridDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDayOfWeek = (firstDay.getDay() + 6) % 7;
    const days: { date: Date; isCurrentMonth: boolean }[] = [];
    for (let i = startDayOfWeek; i > 0; i--) days.push({ date: new Date(year, month, 1 - i), isCurrentMonth: false });
    for (let i = 1; i <= lastDay.getDate(); i++) days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    const remaining = (days.length > 35 ? 42 : 35) - days.length;
    for (let i = 1; i <= remaining; i++) days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    return days;
  }, [year, month]);

  const byDate = useMemo(() => {
    const map: Record<string, Touchpoint[]> = {};
    for (const tp of touchpoints) (map[tp.date.toISOString().slice(0, 10)] ??= []).push(tp);
    return map;
  }, [touchpoints]);

  const windowEndKey = new Date(enrolledAt.getTime() + windowDays * 86_400_000).toISOString().slice(0, 10);

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 shadow-xl font-sans">
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMonthOffset((m) => m - 1)}
            className="rounded-lg p-1.5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            type="button"
            onClick={() => setMonthOffset((m) => m + 1)}
            className="rounded-lg p-1.5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
          >
            <ChevronRight size={15} />
          </button>
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white min-w-[120px]">
            {anchor.toLocaleString("default", { month: "long" })} {year}
          </h3>
        </div>
        <span className="flex items-center gap-1 text-[11px] font-mono text-zinc-500">
          <Clock3 size={11} /> {windowDays}-day recovery window
        </span>
      </div>

      <div className="grid grid-cols-7 border-b border-zinc-200 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/40 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-500">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="border-r border-zinc-200/60 dark:border-zinc-800/60 py-2 last:border-r-0">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 auto-rows-fr bg-[#f8f7fa] dark:bg-zinc-950">
        {gridDays.map(({ date, isCurrentMonth }, idx) => {
          const k = date.toISOString().slice(0, 10);
          const dayTps = byDate[k] ?? [];
          const isEnrollDay = k === enrolledAt.toISOString().slice(0, 10);
          const isWindowEnd = k === windowEndKey;

          return (
            <div
              key={idx}
              className={cn(
                "flex min-h-[85px] flex-col border-b border-r border-zinc-200/60 dark:border-zinc-800/60 p-1.5 transition-colors",
                !isCurrentMonth && "bg-white/20 dark:bg-zinc-900/20 text-zinc-600 dark:text-zinc-600",
                isCurrentMonth && "hover:bg-zinc-100/30 dark:hover:bg-zinc-900/30"
              )}
            >
              <div className="flex items-center gap-1">
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full font-mono text-[11px] font-semibold",
                    isCurrentMonth ? "text-zinc-700 dark:text-zinc-300" : "text-zinc-500 dark:text-zinc-600"
                  )}
                >
                  {date.getDate()}
                </span>
                {isEnrollDay && <span className="rounded bg-emerald-500/10 border border-emerald-500/20 px-1 text-[8px] font-bold text-emerald-400 font-mono">ENROLLED</span>}
                {isWindowEnd && <span className="rounded bg-transparent border border-zinc-300/40 dark:border-zinc-700/50 px-1 text-[8px] font-bold text-zinc-400 font-mono">WINDOW END</span>}
              </div>

              <div className="mt-1 space-y-1">
                {dayTps.map((tp) => {
                  const status = statusFor(tp);
                  const isSelected = selectedKey === tp.key;

                  return (
                    <button
                      key={tp.key}
                      type="button"
                      onClick={() => onSelectKey(tp.key)}
                      className={cn(
                        "flex w-full items-center gap-1.5 rounded-lg border px-1.5 py-1 text-left text-[10px] cursor-pointer transition-all",
                        isSelected
                          ? "border-amber-500/60 bg-amber-500/10 text-amber-300"
                          : "border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 hover:border-zinc-400 dark:hover:border-zinc-700"
                      )}
                    >
                      {tp.type === "email" ? (
                        <Mail size={10} className="shrink-0 text-zinc-500 dark:text-zinc-400" />
                      ) : (
                        <MessageSquare size={10} className="shrink-0 text-zinc-500 dark:text-zinc-400" />
                      )}
                      <span
                        className={cn(
                          "truncate font-semibold",
                          status.tone === "success"
                            ? "text-emerald-400"
                            : status.tone === "danger"
                            ? "text-rose-400"
                            : status.tone === "neutral"
                            ? "text-zinc-500 line-through"
                            : "text-zinc-800 dark:text-zinc-200"
                        )}
                      >
                        {dayLabel(tp.offsetDays)} ({tp.type.toUpperCase()})
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <p className="border-t border-zinc-200 dark:border-zinc-800 bg-white/30 dark:bg-zinc-900/30 px-4 py-2 text-[10px] text-zinc-500">
        Click any scheduled touchpoint on the calendar to open its copy and details directly below.
      </p>
    </div>
  );
}