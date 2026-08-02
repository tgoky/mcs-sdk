"use client";

import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Mail,
  MessageSquare,
  Link2,
  Sparkles,
  UserCheck,
  Undo2,
  Clock3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { emailPlatformLabel, smsPlatformLabel } from "@/lib/copy";
import { ViewSwitcher, type RunViewMode } from "../_shared/view-switcher";
import { StatusPill } from "../_shared/status-pill";
import { EmptyState } from "../_shared/empty-state";
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
  lost: { label: "Exited — window elapsed", tone: "neutral" },
};

function dayLabel(offsetDays: number) {
  return offsetDays === 0 ? "Day 1 (immediate)" : `Day ${offsetDays + 1}`;
}

export function WinBackView({ detail }: { detail: WinBackDetail }) {
  const { run, enrollment, sendLog } = detail;
  const [mode, setMode] = useState<RunViewMode>("calendar");
  const [selected, setSelected] = useState<Touchpoint | null>(null);

  const assetMap = run.winBackSequenceAssetMap;

  const touchpoints: Touchpoint[] = useMemo(() => {
    if (!enrollment || !assetMap) return [];
    const enrolledAt = new Date(enrollment.enrolledAt);
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
  }, [enrollment, assetMap]);

  const exitedOffsetDays = useMemo(() => {
    if (!enrollment?.exitedAt) return null;
    const enrolledAt = new Date(enrollment.enrolledAt).getTime();
    return Math.floor((new Date(enrollment.exitedAt).getTime() - enrolledAt) / 86_400_000);
  }, [enrollment]);

  function statusFor(tp: Touchpoint): { label: string; tone: Tone } {
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

  if (!enrollment) {
    return (
      <EmptyState
        icon={Undo2}
        title="No enrollment recorded for this run"
        description="This run either failed before enrollment completed, or it ran before per-run correlation was added — check the Steps panel for what it actually did."
      />
    );
  }

  const meta = ENROLLMENT_META[enrollment.status] ?? ENROLLMENT_META.active;
  const windowEnd = new Date(new Date(enrollment.enrolledAt).getTime() + enrollment.recoveryWindowDays * 86_400_000);

  return (
    <div className="flex flex-col gap-3">
      {/* Cadence Lifecycle Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 text-zinc-400">
            <UserCheck size={16} />
          </div>
          <div>
            <p className="text-sm font-bold text-white">{enrollment.prospectName ?? enrollment.prospectEmail}</p>
            <p className="text-xs text-zinc-500">
              Enrolled {new Date(enrollment.enrolledAt).toLocaleDateString()} · {enrollment.recoveryWindowDays}-day window ends {windowEnd.toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
          {enrollment.freshRescheduleLink && (
            <a
              href={enrollment.freshRescheduleLink}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 hover:bg-zinc-800"
            >
              <Link2 size={11} /> Reschedule link
            </a>
          )}
        </div>
      </div>

      {!assetMap ? (
        <EmptyState
          icon={Mail}
          title="No cadence content generated yet"
          description="This engagement's win-back email/SMS copy (winBackSequenceAssetMap) hasn't been generated — the calendar below needs it to compute a schedule."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-zinc-500">
              {assetMap.emails.length} email{assetMap.emails.length === 1 ? "" : "s"} · {assetMap.sms.length} SMS · delegated to{" "}
              {emailPlatformLabel(run.stack?.email_platform)}{run.stack?.sms_platform && run.stack.sms_platform !== "none" ? ` + ${smsPlatformLabel(run.stack.sms_platform)}` : ""} for days after Day 1
            </p>
            <ViewSwitcher value={mode} onChange={setMode} />
          </div>

          {mode === "calendar" && (
            <CadenceCalendar enrolledAt={new Date(enrollment.enrolledAt)} windowDays={enrollment.recoveryWindowDays} touchpoints={touchpoints} statusFor={statusFor} exitedOffsetDays={exitedOffsetDays} onSelect={setSelected} />
          )}

          {mode === "list" && (
            <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800/60 text-[10px] uppercase text-zinc-500">
                    <th className="px-4 py-2 font-semibold">Touch</th>
                    <th className="px-4 py-2 font-semibold">Channel</th>
                    <th className="px-4 py-2 font-semibold">Date</th>
                    <th className="px-4 py-2 font-semibold">Status</th>
                    <th className="px-4 py-2 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {touchpoints.map((tp) => {
                    const status = statusFor(tp);
                    return (
                      <tr key={tp.key} className="border-b border-zinc-900 last:border-b-0 hover:bg-zinc-900/40">
                        <td className="px-4 py-2.5 font-medium text-white">{dayLabel(tp.offsetDays)}</td>
                        <td className="px-4 py-2.5 text-zinc-400">
                          <span className="inline-flex items-center gap-1">
                            {tp.type === "email" ? <Mail size={11} /> : <MessageSquare size={11} />}
                            {tp.type === "email" ? "Email" : "SMS"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-zinc-400">{tp.date.toLocaleDateString()}</td>
                        <td className="px-4 py-2.5"><StatusPill tone={status.tone}>{status.label}</StatusPill></td>
                        <td className="px-4 py-2.5 text-right">
                          <button onClick={() => setSelected(tp)} className="rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 hover:bg-zinc-800 cursor-pointer">
                            View copy
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {mode === "board" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(["Sent", "Scheduled / Upcoming", "Skipped"] as const).map((col) => {
                const items = touchpoints.filter((tp) => {
                  const s = statusFor(tp).label;
                  if (col === "Sent") return s.startsWith("Sent");
                  if (col === "Skipped") return s.startsWith("Skipped");
                  return s === "Scheduled" || s === "Upcoming";
                });
                return (
                  <div key={col} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-2.5">
                    <div className="mb-2 flex items-center justify-between px-1">
                      <span className="text-xs font-bold text-zinc-300">{col}</span>
                      <span className="text-[10px] font-mono text-zinc-500">{items.length}</span>
                    </div>
                    <div className="space-y-2">
                      {items.map((tp) => (
                        <button
                          key={tp.key}
                          onClick={() => setSelected(tp)}
                          className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 p-2.5 text-left text-xs hover:border-zinc-700 cursor-pointer"
                        >
                          <p className="flex items-center gap-1.5 font-semibold text-white">
                            {tp.type === "email" ? <Mail size={11} /> : <MessageSquare size={11} />}
                            {dayLabel(tp.offsetDays)}
                          </p>
                          <p className="mt-0.5 text-[10px] text-zinc-500">{tp.date.toLocaleDateString()}</p>
                        </button>
                      ))}
                      {items.length === 0 && <p className="px-1 py-3 text-center text-[10px] text-zinc-600">Nothing here</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <TouchpointDrawer touchpoint={selected} onClose={() => setSelected(null)} sendLog={sendLog} exitedOffsetDays={exitedOffsetDays} />
    </div>
  );
}

function CadenceCalendar({
  enrolledAt,
  windowDays,
  touchpoints,
  statusFor,
  exitedOffsetDays,
  onSelect,
}: {
  enrolledAt: Date;
  windowDays: number;
  touchpoints: Touchpoint[];
  statusFor: (tp: Touchpoint) => { label: string; tone: Tone };
  exitedOffsetDays: number | null;
  onSelect: (tp: Touchpoint) => void;
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
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <button onClick={() => setMonthOffset((m) => m - 1)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer">
            <ChevronLeft size={15} />
          </button>
          <button onClick={() => setMonthOffset((m) => m + 1)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer">
            <ChevronRight size={15} />
          </button>
          <h3 className="text-sm font-bold text-white">{anchor.toLocaleString("default", { month: "long" })} {year}</h3>
        </div>
        <span className="flex items-center gap-1 text-[11px] text-zinc-500"><Clock3 size={11} /> {windowDays}-day recovery window</span>
      </div>
      <div className="grid grid-cols-7 border-b border-zinc-800 bg-zinc-900/40 text-center text-[10px] font-bold uppercase text-zinc-500">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="border-r border-zinc-800/60 py-2 last:border-r-0">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 auto-rows-fr">
        {gridDays.map(({ date, isCurrentMonth }, idx) => {
          const k = date.toISOString().slice(0, 10);
          const dayTps = byDate[k] ?? [];
          const isEnrollDay = k === enrolledAt.toISOString().slice(0, 10);
          const isWindowEnd = k === windowEndKey;
          return (
            <div key={idx} className={cn("flex min-h-[82px] flex-col border-b border-r border-zinc-800/60 p-1.5", !isCurrentMonth && "bg-zinc-900/20")}>
              <div className="flex items-center gap-1">
                <span className={cn("flex h-5 w-5 items-center justify-center rounded-full font-mono text-[11px] font-semibold", isCurrentMonth ? "text-zinc-300" : "text-zinc-600")}>
                  {date.getDate()}
                </span>
                {isEnrollDay && <span className="rounded bg-gold/20 px-1 text-[8px] font-bold text-gold">ENROLLED</span>}
                {isWindowEnd && <span className="rounded bg-zinc-800 px-1 text-[8px] font-bold text-zinc-400">WINDOW END</span>}
              </div>
              <div className="mt-1 space-y-1">
                {dayTps.map((tp) => {
                  const status = statusFor(tp);
                  return (
                    <button key={tp.key} onClick={() => onSelect(tp)} className="flex w-full items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/90 px-1.5 py-1 text-left text-[10px] hover:border-zinc-700 cursor-pointer">
                      {tp.type === "email" ? <Mail size={10} className="shrink-0 text-zinc-400" /> : <MessageSquare size={10} className="shrink-0 text-zinc-400" />}
                      <span className={cn("truncate font-semibold", status.tone === "success" ? "text-emerald-400" : status.tone === "danger" ? "text-rose-400" : status.tone === "neutral" ? "text-zinc-600 line-through" : "text-zinc-200")}>
                        {tp.type === "email" ? "Email" : "SMS"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="border-t border-zinc-800 bg-zinc-900/30 px-4 py-2 text-[10px] text-zinc-500">
        Day 1 is confirmed sent by this system. Later touches are handed to the buyer's ESP/SMS platform as scheduled workflow steps — dates shown are when they're scheduled to fire, not confirmed delivery receipts.
      </p>
    </div>
  );
}

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
  const dayZeroLog = sendLog[0];
  return (
    <Sheet open={!!touchpoint} onOpenChange={(open) => !open && onClose()}>
      <SheetContent widthClassName="w-full sm:max-w-lg">
        {touchpoint && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2 text-amber-400">
                {touchpoint.type === "email" ? <Mail size={15} /> : <MessageSquare size={15} />}
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  {touchpoint.type === "email" ? "Recovery Email" : "Recovery SMS"}
                </span>
              </div>
              <SheetTitle className="mt-1.5">{dayLabel(touchpoint.offsetDays)}</SheetTitle>
              <SheetDescription>Scheduled for {touchpoint.date.toLocaleDateString()}</SheetDescription>
            </SheetHeader>
            <SheetBody className="space-y-4">
              {touchpoint.offsetDays === 0 && dayZeroLog?.personalizedOpening && (
                <div className="space-y-2">
                  <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-amber-400">
                    <Sparkles size={11} /> Claude-personalized opening actually sent
                  </span>
                  <div className="rounded-xl border border-amber-900/40 bg-amber-950/10 p-3 text-xs leading-relaxed text-zinc-200">
                    {dayZeroLog.personalizedOpening}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <span className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                  {touchpoint.offsetDays === 0 ? "Template body (used when no personalized opening)" : "Generated copy"}
                </span>
                {touchpoint.subject && (
                  <p className="text-xs font-semibold text-zinc-300">Subject: {touchpoint.subject}</p>
                )}
                <div className="whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 text-xs leading-relaxed text-zinc-300">
                  {touchpoint.body}
                </div>
              </div>

              {exitedOffsetDays != null && touchpoint.offsetDays > exitedOffsetDays && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-2.5 text-[11px] text-zinc-500">
                  This touch was skipped — the prospect exited the cadence before this day was reached.
                </div>
              )}
            </SheetBody>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
