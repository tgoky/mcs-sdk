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
  RotateCcw,
  Pause,
  Play,
  ArrowRight,
  Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import {
  skillName,
  runStatusLabel,
  phaseLabel,
  type SkillName,
} from "@/lib/copy";

// ─── Types ───────────────────────────────────────────────────────────────────

type RunStatus = "running" | "success" | "failed" | "error" | "queued" | string;

export interface RunRow {
  id: string;
  skillName: string;
  status: string;
  phase: string | null;
  startedAt: string;
  engagementId: string;
  buyerName: string;
  engagementPausedAt: string | null;
  errorMessage: string | null;
  stepCount: number;
  summary: Record<string, unknown> | null;
  subjectLabel: string | null;
}

export interface LiveExecutionFeedProps {
  initialRuns: RunRow[];
  storageKey: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function resolveStatus(status: string): "running" | "success" | "failed" | "warning" | "idle" {
  const s = status.toLowerCase();
  if (s === "running" || s === "in_progress") return "running";
  if (s === "success" || s === "completed") return "success";
  if (s === "failed" || s === "error") return "failed";
  if (s === "queued" || s === "pending") return "idle";
  return "idle";
}

function actionSummary(run: RunRow): string {
  if (run.errorMessage) return run.errorMessage;
  if (run.summary && typeof run.summary === "object") {
    const s = run.summary as Record<string, unknown>;
    if (typeof s.outcome === "string" && s.outcome.trim()) return s.outcome;
    if (typeof s.result === "string" && s.result.trim()) return s.result;
    if (typeof s.summary === "string" && s.summary.trim()) return s.summary;
    if (typeof s.delivered === "string" && s.delivered.trim()) return s.delivered;
  }
  if (run.subjectLabel) return run.subjectLabel;
  return phaseLabel(run.phase);
}

// ─── Status Icon ─────────────────────────────────────────────────────────────

function StatusIcon({ status, size = 16 }: { status: string; size?: number }) {
  const s = status.toLowerCase();
  if (s === "running" || s === "in_progress")
    return <Loader2 size={size} className="text-sky-500 animate-spin" />;
  if (s === "success" || s === "completed")
    return <CheckCircle2 size={size} className="text-emerald-500" />;
  if (s === "failed" || s === "error")
    return <XCircle size={size} className="text-rose-500" />;
  if (s === "queued" || s === "pending")
    return <Clock size={size} className="text-zinc-400 dark:text-zinc-500" />;
  return <AlertCircle size={size} className="text-zinc-400 dark:text-zinc-500" />;
}

// ─── Live Pulse ──────────────────────────────────────────────────────────────

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
  resolved,
  label,
}: {
  resolved: "running" | "success" | "failed" | "warning" | "idle";
  label: string;
}) {
  const classes: Record<string, string> = {
    running: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300",
    success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300",
    failed: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300",
    warning: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
    idle: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-tight border-0",
        classes[resolved]
      )}
    >
      {label}
    </span>
  );
}

// ─── Feed Row (Phantom .ph-token-row anatomy) ────────────────────────────────

function FeedRow({
  run,
  now,
  isSelected,
  onClick,
}: {
  run: RunRow;
  now: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const isRunning = run.status.toLowerCase() === "running" || run.status.toLowerCase() === "in_progress";
  const isFailed = run.status.toLowerCase() === "failed" || run.status.toLowerCase() === "error";
  const isPaused = Boolean(run.engagementPausedAt);
  const skill = run.skillName as SkillName;
  const resolved = resolveStatus(run.status);

  const title = run.subjectLabel ?? skillName(skill);
  const subtitle = run.buyerName && run.buyerName !== "Unknown client"
    ? run.buyerName
    : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full min-h-[72px] rounded-[20px] px-4 py-3 text-left cursor-pointer",
        "flex items-center gap-3 border-0",
        "transition-[background-color,box-shadow] duration-150",
        isSelected
          ? "bg-zinc-200 dark:bg-zinc-700 ring-1 ring-zinc-400 dark:ring-zinc-600"
          : isPaused
            ? "bg-zinc-50 dark:bg-zinc-950/40 opacity-60 hover:opacity-80"
            : "bg-zinc-100 dark:bg-zinc-900/80 hover:bg-zinc-200/80 dark:hover:bg-zinc-800/70",
        isRunning && !isSelected && "ring-1 ring-sky-200 dark:ring-sky-900/40"
      )}
    >
      {/* Avatar slot */}
      <div className="relative shrink-0">
        <div className="w-11 h-11 rounded-full bg-white dark:bg-zinc-800 grid place-items-center">
          <SquishySkillBadge skill={skill} size={32} enabled={!isPaused} />
        </div>
        <LivePulse active={isRunning} />
      </div>

      {/* Title + Subtitle */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {isPaused && <Ban size={11} className="text-amber-500 shrink-0" />}
          <span
            className="text-[15px] font-extrabold text-zinc-900 dark:text-white truncate leading-tight tracking-tight"
            style={{ fontWeight: 800 }}
          >
            {title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {subtitle && (
            <span className="text-[13px] text-zinc-500 dark:text-zinc-400 truncate font-medium">
              {subtitle}
            </span>
          )}
          {run.stepCount > 0 && (
            <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 tabular-nums shrink-0">
              {run.stepCount} step{run.stepCount !== 1 ? "s" : ""}
            </span>
          )}
          {isFailed && run.errorMessage && (
            <span className="text-[11px] font-mono text-rose-500/80 dark:text-rose-400/70 truncate max-w-[200px]">
              {run.errorMessage}
            </span>
          )}
        </div>
      </div>

      {/* Status + Time */}
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <StatusIcon status={run.status} />
        <span className="text-[12px] font-mono text-zinc-400 dark:text-zinc-500 tabular-nums font-semibold">
          {relativeTime(run.startedAt, now)}
        </span>
      </div>
    </button>
  );
}

// ─── Inspector Panel ─────────────────────────────────────────────────────────

function FeedInspector({
  run,
  now,
}: {
  run: RunRow;
  now: number;
}) {
  const skill = run.skillName as SkillName;
  const resolved = resolveStatus(run.status);
  const summary = actionSummary(run);

  // Extract structured summary fields if available
  const summaryFields = useMemo(() => {
    if (!run.summary || typeof run.summary !== "object") return null;
    const s = run.summary as Record<string, unknown>;
    const skip = new Set(["outcome", "result", "summary", "delivered"]);
    const entries = Object.entries(s).filter(([k, v]) => !skip.has(k) && v !== null && v !== undefined && v !== "");
    if (entries.length === 0) return null;
    return entries;
  }, [run.summary]);

  return (
    <div className="rounded-[20px] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-4 shadow-xl">
      {/* Header */}
      <div className="space-y-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SquishySkillBadge skill={skill} size={18} enabled={true} />
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold">
              {skillName(skill)}
            </span>
          </div>
          <StatusPill resolved={resolved} label={runStatusLabel(run.status)} />
        </div>

        <h4
          className="text-base font-extrabold text-zinc-900 dark:text-white tracking-tight"
          style={{ fontWeight: 800 }}
        >
          {run.subjectLabel ?? skillName(skill)}
        </h4>

        <div className="flex items-center gap-2 font-mono text-xs text-zinc-500">
          <Clock size={12} />
          <span>
            {new Date(run.startedAt).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <span className="text-zinc-300 dark:text-zinc-600">·</span>
          <span>{relativeTime(run.startedAt, now)}</span>
        </div>
      </div>

      {/* Client card */}
      {run.buyerName && run.buyerName !== "Unknown client" && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 p-3 space-y-1">
          <span className="text-[10px] font-mono text-zinc-500 uppercase block font-semibold">
            Client
          </span>
          <Link
            href={`/dashboard/engagements/${run.engagementId}`}
            className="text-sm font-bold text-zinc-900 dark:text-white hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
          >
            {run.buyerName}
          </Link>
          {run.engagementPausedAt && (
            <p className="text-[11px] font-mono text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <Ban size={10} /> Engagement paused
            </p>
          )}
        </div>
      )}

      {/* Phase + Steps */}
      <div className="space-y-2">
        <span className="text-[10px] font-mono text-zinc-500 uppercase block font-semibold">
          Execution
        </span>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-zinc-600 dark:text-zinc-400 font-medium">
            {phaseLabel(run.phase)}
          </span>
          {run.stepCount > 0 && (
            <>
              <span className="text-zinc-300 dark:text-zinc-600">·</span>
              <span className="font-mono text-zinc-500 tabular-nums">
                {run.stepCount} step{run.stepCount !== 1 ? "s" : ""}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Summary / Detail */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 p-3 space-y-1">
        <span className="text-[10px] font-mono text-zinc-500 uppercase block font-semibold">
          {run.errorMessage ? "Error" : "Outcome"}
        </span>
        <p
          className={cn(
            "text-xs leading-relaxed whitespace-pre-wrap max-h-[200px] overflow-y-auto",
            run.errorMessage
              ? "text-rose-700 dark:text-rose-300"
              : "text-zinc-800 dark:text-zinc-300"
          )}
        >
          {summary || "No details available."}
        </p>
      </div>

      {/* Structured summary fields */}
      {summaryFields && (
        <div className="space-y-1">
          <span className="text-[10px] font-mono text-zinc-500 uppercase block font-semibold">
            Details
          </span>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {summaryFields.map(([k, v]) => (
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
        <Link
          href={`/dashboard/runs/${run.id}`}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 px-3 py-2.5 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
        >
          <span>View Run</span>
          <ExternalLink size={12} />
        </Link>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function LiveExecutionFeed({ initialRuns, storageKey }: LiveExecutionFeedProps) {
  const now = useNow(30_000);
  const [runs, setRuns] = useState<RunRow[]>(initialRuns);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterSkill, setFilterSkill] = useState<SkillName | "all">("all");
  const feedRef = useRef<HTMLDivElement>(null);

  // Sync with server data on change
  useEffect(() => {
    setRuns(initialRuns);
  }, [initialRuns]);

  // Persist filter in localStorage keyed by storageKey
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`feed-filter-${storageKey}`);
      if (saved) setFilterSkill(saved as SkillName | "all");
    } catch { /* noop */ }
  }, [storageKey]);

  useEffect(() => {
    try {
      if (filterSkill !== "all") {
        localStorage.setItem(`feed-filter-${storageKey}`, filterSkill);
      } else {
        localStorage.removeItem(`feed-filter-${storageKey}`);
      }
    } catch { /* noop */ }
  }, [filterSkill, storageKey]);

  // Filter
  const filtered = useMemo(() => {
    if (filterSkill === "all") return runs;
    return runs.filter((r) => r.skillName === filterSkill);
  }, [runs, filterSkill]);

  // Temporal grouping (Master Roster pattern)
  const groups = useMemo(() => {
    const map: Record<string, RunRow[]> = {};
    for (const r of filtered) {
      const k = dateKey(new Date(r.startedAt));
      (map[k] ??= []).push(r);
    }
    return Object.entries(map)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([dateStr, items]) => ({
        dateStr,
        label: formatDayHeader(dateStr),
        runs: items.sort(
          (a, b) =>
            new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
        ),
      }));
  }, [filtered]);

  const selectedRun = useMemo(
    () => runs.find((r) => r.id === selectedId) ?? null,
    [runs, selectedId]
  );

  const hasRunning = runs.some(
    (r) => r.status.toLowerCase() === "running" || r.status.toLowerCase() === "in_progress"
  );

  // Unique skills for filter chips
  const uniqueSkills = useMemo(() => {
    const set = new Set<SkillName>();
    for (const r of runs) set.add(r.skillName as SkillName);
    return Array.from(set);
  }, [runs]);

  return (
    <div className="space-y-3 font-sans antialiased">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-2 shadow-sm">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Live indicator */}
          <div className="flex items-center gap-1.5 rounded-2xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 px-3 py-1.5">
            <LivePulse active={hasRunning} />
            <span className="text-xs font-extrabold text-zinc-900 dark:text-white tracking-tight">
              {hasRunning ? "Live" : "Idle"}
            </span>
          </div>

          {/* Skill filter pills */}
          {uniqueSkills.length > 1 && (
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
          )}
        </div>

        <span className="text-[11px] font-mono text-zinc-400 tabular-nums">
          {filtered.length} run{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Feed + Inspector ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div
          className={cn(
            "transition-all",
            selectedRun ? "lg:col-span-7" : "lg:col-span-12"
          )}
        >
          <div
            ref={feedRef}
            className="space-y-5 max-h-[720px] overflow-y-auto scrollbar-none pr-1"
          >
            {groups.length === 0 && (
              <div className="rounded-[20px] border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 h-40 flex flex-col items-center justify-center gap-2">
                <Radio size={24} className="text-zinc-300 dark:text-zinc-700" />
                <p className="text-sm text-zinc-400 dark:text-zinc-500 font-medium">
                  No runs yet
                </p>
              </div>
            )}

            {groups.map((group) => (
              <div key={group.dateStr}>
                {/* Temporal header */}
                <div className="flex items-center gap-2.5 mb-2.5 px-1">
                  <span
                    className="text-[11px] font-extrabold text-zinc-900 dark:text-white tracking-tight"
                    style={{ fontWeight: 800 }}
                  >
                    {group.label}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 tabular-nums">
                    {group.runs.length} run{group.runs.length !== 1 ? "s" : ""}
                  </span>
                  <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
                </div>

                {/* Rows (Phantom 10px gap) */}
                <div className="space-y-[10px]">
                  {group.runs.map((run) => (
                    <FeedRow
                      key={run.id}
                      run={run}
                      now={now}
                      isSelected={selectedId === run.id}
                      onClick={() =>
                        setSelectedId(selectedId === run.id ? null : run.id)
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Inspector */}
        {selectedRun && (
          <div className="lg:col-span-5">
            <div className="sticky top-2">
              <FeedInspector run={selectedRun} now={now} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}