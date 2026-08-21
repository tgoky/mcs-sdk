"use client";

import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  ExternalLink,
  Clock,
  Radio,
  Zap,
  MessageSquare,
  Shield,
  RotateCcw,
  Pause,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import { skillName, type SkillName } from "@/lib/copy";

// ─── Types ───────────────────────────────────────────────────────────────────

type EventStatus = "running" | "success" | "failed" | "warning" | "info" | "idle";
type EventKind = "run" | "pipeline" | "audit" | "brief";

export interface FeedEvent {
  id: string;
  kind: EventKind;
  skill: SkillName;
  status: EventStatus;
  title: string;
  subtitle?: string;
  detail?: string;
  prospectName?: string;
  prospectEmail?: string;
  occurredAt: string;
  runId?: string;
  engagementId?: string;
  progress?: { current: number; total: number };
  steps?: Array<{
    label: string;
    status: "pending" | "running" | "done" | "failed";
  }>;
  metadata?: Record<string, string | number | boolean>;
}

// ─── Relative Time Hook (auto-updating) ──────────────────────────────────────

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function relativeTime(iso: string, now: number): string {
  const diffMs = now - new Date(iso).getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDayHeader(dateStr: string): string {
  const todayKey = dateKey(new Date());
  const yObj = new Date();
  yObj.setDate(yObj.getDate() - 1);
  const yesterdayKey = dateKey(yObj);
  if (dateStr === todayKey) return "Today";
  if (dateStr === yesterdayKey) return "Yesterday";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// ─── Status Icon ─────────────────────────────────────────────────────────────

function StatusIcon({
  status,
  size = 16,
}: {
  status: EventStatus;
  size?: number;
}) {
  switch (status) {
    case "running":
      return <Loader2 size={size} className="text-sky-500 animate-spin" />;
    case "success":
      return <CheckCircle2 size={size} className="text-emerald-500" />;
    case "failed":
      return <XCircle size={size} className="text-rose-500" />;
    case "warning":
      return <AlertCircle size={size} className="text-amber-500" />;
    default:
      return <AlertCircle size={size} className="text-zinc-400 dark:text-zinc-600" />;
  }
}

// ─── Live Pulse (Phantom avatar-overlay pattern adapted) ─────────────────────

function LivePulse({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
      <span className="absolute inset-0 rounded-full bg-sky-500 animate-ping opacity-60" />
      <span className="relative flex h-3 w-3 items-center justify-center rounded-full bg-sky-500 ring-2 ring-white dark:ring-zinc-950" />
    </span>
  );
}

// ─── Status Pill ─────────────────────────────────────────────────────────────

function StatusPill({
  status,
  children,
}: {
  status: EventStatus;
  children: React.ReactNode;
}) {
  const classes: Record<EventStatus, string> = {
    running:
      "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300",
    success:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300",
    failed:
      "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300",
    warning:
      "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
    info: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    idle: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-tight border-0",
        classes[status]
      )}
    >
      {children}
    </span>
  );
}

// ─── Inline Progress Bar ( Phantom's .ph-token-pnl slot adapted) ─────────────

function InlineProgress({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
        <div
          className="h-full rounded-full bg-sky-500 transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] font-mono text-zinc-500 tabular-nums">
        {current}/{total}
      </span>
    </div>
  );
}

// ─── Kind Icon ───────────────────────────────────────────────────────────────

function KindIcon({ kind }: { kind: EventKind }) {
  const map: Record<EventKind, { icon: typeof Zap; color: string }> = {
    run: { icon: Zap, color: "text-sky-500" },
    pipeline: { icon: MessageSquare, color: "text-violet-500" },
    audit: { icon: Shield, color: "text-amber-500" },
    brief: { icon: Radio, color: "text-emerald-500" },
  };
  const { icon: Icon, color } = map[kind];
  return <Icon size={12} className={color} />;
}

// ─── Feed Row (Phantom .ph-token-row anatomy) ────────────────────────────────
// Avatar slot → Title + Subtitle → Value + PNL → Chevron
// 44px round    17px/800 + 14px/700  17px/800 + 14px/800

function FeedRow({
  event,
  now,
  isSelected,
  onClick,
}: {
  event: FeedEvent;
  now: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const isRunning = event.status === "running";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        // Phantom: min-h-[72px], rounded-[20px], padding 12px 16px, gap 12px
        "w-full min-h-[72px] rounded-[20px] px-4 py-3 text-left cursor-pointer",
        "flex items-center gap-3 border-0",
        // Phantom: transition: background 0.15s — we use Tailwind transition-[background-color]
        "transition-[background-color,box-shadow] duration-150",
        // Selected state (from Master Roster's inspection pattern)
        isSelected
          ? "bg-zinc-200 dark:bg-zinc-700 ring-1 ring-zinc-400 dark:ring-zinc-600"
          : "bg-zinc-100 dark:bg-zinc-900/80 hover:bg-zinc-200/80 dark:hover:bg-zinc-800/70",
        // Running: subtle ring glow
        isRunning &&
          !isSelected &&
          "ring-1 ring-sky-200 dark:ring-sky-900/40"
      )}
    >
      {/* ── Slot 1: Avatar (Phantom .ph-token-avatar) ── */}
      <div className="relative shrink-0">
        <div className="w-11 h-11 rounded-full bg-white dark:bg-zinc-800 grid place-items-center">
          <SquishySkillBadge skill={event.skill} size={32} enabled={true} />
        </div>
        {/* Phantom .ph-token-avatar-overlay → LivePulse */}
        <LivePulse active={isRunning} />
      </div>

      {/* ── Slot 2: Title + Subtitle (Phantom .ph-token-main) ── */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <KindIcon kind={event.kind} />
          <span
            className="text-[15px] font-extrabold text-zinc-900 dark:text-white truncate leading-tight tracking-tight"
            style={{ fontWeight: 800 }}
          >
            {event.title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-zinc-500 dark:text-zinc-400 truncate font-medium">
            {event.subtitle ??
              event.prospectEmail ??
              event.prospectName ??
              skillName(event.skill)}
          </span>
          {event.progress && (
            <InlineProgress
              current={event.progress.current}
              total={event.progress.total}
            />
          )}
        </div>
      </div>

      {/* ── Slot 3: Value + PNL (Phantom .ph-token-side) ── */}
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <StatusIcon status={event.status} />
        <span className="text-[12px] font-mono text-zinc-400 dark:text-zinc-500 tabular-nums font-semibold">
          {relativeTime(event.occurredAt, now)}
        </span>
      </div>
    </button>
  );
}

// ─── Inspector Panel (Master Roster pattern) ─────────────────────────────────

function FeedInspector({
  event,
  now,
  onRetry,
}: {
  event: FeedEvent;
  now: number;
  onRetry?: (eventId: string) => void;
}) {
  return (
    <div className="rounded-[20px] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-4 shadow-xl">
      {/* Header */}
      <div className="space-y-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SquishySkillBadge skill={event.skill} size={18} enabled={true} />
            <KindIcon kind={event.kind} />
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold">
              {skillName(event.skill)}
            </span>
          </div>
          <StatusPill status={event.status}>{event.status}</StatusPill>
        </div>

        <h4
          className="text-base font-extrabold text-zinc-900 dark:text-white tracking-tight"
          style={{ fontWeight: 800 }}
        >
          {event.title}
        </h4>

        <div className="flex items-center gap-2 font-mono text-xs text-zinc-500">
          <Clock size={12} />
          <span>
            {new Date(event.occurredAt).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <span className="text-zinc-300 dark:text-zinc-600">·</span>
          <span>{relativeTime(event.occurredAt, now)}</span>
        </div>
      </div>

      {/* Prospect Card */}
      {(event.prospectName || event.prospectEmail) && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 p-3 space-y-1">
          <span className="text-[10px] font-mono text-zinc-500 uppercase block font-semibold">
            Prospect
          </span>
          <p className="text-sm font-bold text-zinc-900 dark:text-white">
            {event.prospectName ?? "—"}
          </p>
          <p className="text-xs font-mono text-zinc-500">
            {event.prospectEmail ?? "—"}
          </p>
        </div>
      )}

      {/* Progress */}
      {event.progress && (
        <div className="space-y-2">
          <span className="text-[10px] font-mono text-zinc-500 uppercase block font-semibold">
            Progress
          </span>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-sky-500 transition-all duration-500 ease-out"
                style={{
                  width: `${
                    event.progress.total > 0
                      ? Math.round(
                          (event.progress.current / event.progress.total) * 100
                        )
                      : 0
                  }%`,
                }}
              />
            </div>
            <span className="text-xs font-mono font-bold text-zinc-700 dark:text-zinc-300 tabular-nums">
              {event.progress.current}/{event.progress.total}
            </span>
          </div>
        </div>
      )}

      {/* Steps */}
      {event.steps && event.steps.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-mono text-zinc-500 uppercase block font-semibold">
            Steps
          </span>
          <ol className="space-y-1">
            {event.steps.map((step, i) => (
              <li
                key={i}
                className="flex items-center gap-2.5 text-xs py-0.5"
              >
                {step.status === "done" ? (
                  <CheckCircle2
                    size={14}
                    className="text-emerald-500 shrink-0"
                  />
                ) : step.status === "running" ? (
                  <Loader2
                    size={14}
                    className="text-sky-500 animate-spin shrink-0"
                  />
                ) : step.status === "failed" ? (
                  <XCircle size={14} className="text-rose-500 shrink-0" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-zinc-300 dark:border-zinc-600 shrink-0" />
                )}
                <span
                  className={cn(
                    "font-medium transition-colors",
                    step.status === "done" &&
                      "text-zinc-500 dark:text-zinc-400 line-through",
                    step.status === "running" &&
                      "text-zinc-900 dark:text-white font-bold",
                    step.status === "failed" &&
                      "text-rose-600 dark:text-rose-400",
                    step.status === "pending" &&
                      "text-zinc-400 dark:text-zinc-500"
                  )}
                >
                  {step.label}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Detail */}
      {event.detail && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 p-3 space-y-1">
          <span className="text-[10px] font-mono text-zinc-500 uppercase block font-semibold">
            Details
          </span>
          <p className="text-xs text-zinc-800 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-[200px] overflow-y-auto">
            {event.detail}
          </p>
        </div>
      )}

      {/* Metadata Grid */}
      {event.metadata && Object.keys(event.metadata).length > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] font-mono text-zinc-500 uppercase block font-semibold">
            Metadata
          </span>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {Object.entries(event.metadata).map(([k, v]) => (
              <Fragment key={k}>
                <dt className="font-mono text-zinc-500 truncate">{k}</dt>
                <dd className="font-mono text-zinc-800 dark:text-zinc-300 truncate text-right">
                  {String(v)}
                </dd>
              </Fragment>
            ))}
          </dl>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        {event.runId && (
          <Link
            href={`/dashboard/runs/${event.runId}`}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 px-3 py-2.5 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
          >
            <span>View Run</span>
            <ExternalLink size={12} />
          </Link>
        )}
        {event.status === "failed" && onRetry && (
          <button
            type="button"
            onClick={() => onRetry(event.id)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-2xl bg-rose-500 text-white px-3 py-2.5 text-xs font-bold hover:bg-rose-600 transition-colors cursor-pointer"
          >
            <RotateCcw size={12} />
            <span>Retry</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

interface LiveExecutionFeedProps {
  events: FeedEvent[];
  engagementId?: string;
  autoScroll?: boolean;
  pollIntervalMs?: number;
  onRetry?: (eventId: string) => void;
}

export function LiveExecutionFeed({
  events: initialEvents,
  engagementId,
  autoScroll: initialAutoScroll = true,
  pollIntervalMs = 5000,
  onRetry,
}: LiveExecutionFeedProps) {
  const now = useNow(30_000);
  const [events, setEvents] = useState<FeedEvent[]>(initialEvents);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(initialAutoScroll);
  const [filterSkill, setFilterSkill] = useState<SkillName | "all">("all");
  const [filterStatus, setFilterStatus] = useState<EventStatus | "all">(
    "all"
  );
  const feedRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(initialEvents.length);

  // Poll for new events
  useEffect(() => {
    if (!engagementId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/engagements/${engagementId}/activity-feed`
        );
        if (res.ok && !cancelled) {
          const data = await res.json();
          setEvents(data.events ?? []);
        }
      } catch {
        /* silent — keep last known state */
      }
    };
    poll();
    const id = setInterval(poll, pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [engagementId, pollIntervalMs]);

  // Sync with external events prop
  useEffect(() => {
    setEvents(initialEvents);
  }, [initialEvents]);

  // Auto-scroll to top on new events
  useEffect(() => {
    if (
      autoScroll &&
      events.length > prevCountRef.current &&
      feedRef.current
    ) {
      feedRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
    prevCountRef.current = events.length;
  }, [events.length, autoScroll]);

  // Filter
  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (filterSkill !== "all" && e.skill !== filterSkill) return false;
      if (filterStatus !== "all" && e.status !== filterStatus) return false;
      return true;
    });
  }, [events, filterSkill, filterStatus]);

  // Temporal grouping (Master Roster's smart grouping pattern)
  const groups = useMemo(() => {
    const map: Record<string, FeedEvent[]> = {};
    for (const e of filtered) {
      const k = dateKey(new Date(e.occurredAt));
      (map[k] ??= []).push(e);
    }
    return Object.entries(map)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([dateStr, items]) => ({
        dateStr,
        label: formatDayHeader(dateStr),
        events: items.sort(
          (a, b) =>
            new Date(b.occurredAt).getTime() -
            new Date(a.occurredAt).getTime()
        ),
      }));
  }, [filtered]);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedId) ?? null,
    [events, selectedId]
  );

  const hasRunning = events.some((e) => e.status === "running");

  // Unique skills for filter chips
  const uniqueSkills = useMemo(() => {
    const set = new Set<SkillName>();
    for (const e of events) set.add(e.skill);
    return Array.from(set);
  }, [events]);

  return (
    <div className="space-y-3 font-sans antialiased">
      {/* ── Toolbar (Phantom .ph-actions-row density + Master Roster toolbar) ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-2 shadow-sm">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Live indicator (unique to live feeds) */}
          <div className="flex items-center gap-1.5 rounded-2xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 px-3 py-1.5">
            <LivePulse active={hasRunning} />
            <span className="text-xs font-extrabold text-zinc-900 dark:text-white tracking-tight">
              {hasRunning ? "Live" : "Idle"}
            </span>
          </div>

          {/* Skill filter pills (Phantom .ph-top-pill pattern) */}
          <div className="flex items-center gap-1 rounded-2xl bg-zinc-200/60 dark:bg-zinc-900 p-1 border border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setFilterSkill("all")}
              className={cn(
                "rounded-xl px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer",
                filterSkill === "all"
                  ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
              )}
            >
              All
            </button>
            {uniqueSkills.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilterSkill(s)}
                className={cn(
                  "flex items-center gap-1 rounded-xl px-2 py-1 text-[11px] font-bold transition-colors cursor-pointer",
                  filterSkill === s
                    ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                )}
              >
                <SquishySkillBadge skill={s} size={12} enabled={true} />
                <span className="hidden sm:inline">{skillName(s)}</span>
              </button>
            ))}
          </div>

          {/* Status dropdown */}
          <select
            value={filterStatus}
            onChange={(e) =>
              setFilterStatus(e.target.value as EventStatus | "all")
            }
            className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-1.5 text-[11px] font-bold text-zinc-700 dark:text-zinc-300 focus:outline-none focus:border-zinc-400 cursor-pointer"
          >
            <option value="all">All Status</option>
            <option value="running">Running</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="warning">Warning</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          {/* Auto-scroll toggle (unique to live feeds) */}
          <button
            type="button"
            onClick={() => setAutoScroll(!autoScroll)}
            className={cn(
              "flex items-center gap-1.5 rounded-2xl border px-3 py-1.5 text-[11px] font-bold cursor-pointer transition-colors",
              autoScroll
                ? "border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300"
                : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
            )}
          >
            {autoScroll ? <Pause size={12} /> : <Play size={12} />}
            <span>{autoScroll ? "Following" : "Paused"}</span>
          </button>

          <span className="text-[11px] font-mono text-zinc-400 tabular-nums">
            {filtered.length} event{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* ── Feed + Inspector Layout (Master Roster's 7/5 split) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Feed Column */}
        <div
          className={cn(
            "space-y-0 transition-all",
            selectedEvent ? "lg:col-span-7" : "lg:col-span-12"
          )}
        >
          <div
            ref={feedRef}
            className="space-y-5 max-h-[720px] overflow-y-auto scrollbar-none pr-1"
          >
            {groups.length === 0 && (
              <div className="rounded-[20px] border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 h-52 flex flex-col items-center justify-center gap-2">
                <Radio
                  size={24}
                  className="text-zinc-300 dark:text-zinc-700"
                />
                <p className="text-sm text-zinc-400 dark:text-zinc-500 font-medium">
                  No execution events yet
                </p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">
                  Events will stream here in real-time
                </p>
              </div>
            )}

            {groups.map((group) => (
              <div key={group.dateStr}>
                {/* Temporal header (Master Roster's formatDayHeader) */}
                <div className="flex items-center gap-2.5 mb-2.5 px-1">
                  <span
                    className="text-[11px] font-extrabold text-zinc-900 dark:text-white tracking-tight"
                    style={{ fontWeight: 800 }}
                  >
                    {group.label}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 tabular-nums">
                    {group.events.length} event
                    {group.events.length !== 1 ? "s" : ""}
                  </span>
                  <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
                </div>

                {/* Event rows (Phantom: 10px gap between .ph-token-row) */}
                <div className="space-y-[10px]">
                  {group.events.map((event) => (
                    <FeedRow
                      key={event.id}
                      event={event}
                      now={now}
                      isSelected={selectedId === event.id}
                      onClick={() =>
                        setSelectedId(
                          selectedId === event.id ? null : event.id
                        )
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Inspector Column (Master Roster's sticky 5-col panel) */}
        {selectedEvent && (
          <div className="lg:col-span-5">
            <div className="sticky top-2">
              <FeedInspector
                event={selectedEvent}
                now={now}
                onRetry={onRetry}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}