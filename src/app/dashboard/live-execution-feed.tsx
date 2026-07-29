"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  Hash,
  ArrowRight,
  ArrowUpRight,
  Clock,
  Ban,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  Waves,
  Copy,
} from "lucide-react";
import { skillName, phaseLabel, SKILL_INFO, type SkillName } from "@/lib/copy";
import { ActionPanel, useQuickActions, type ActionPanelSection } from "@/components/action-panel";
import { cancelSkillRun, pauseEngagement, resumeEngagement, triggerSkillRun, copyToClipboard } from "@/lib/quick-actions";

interface SkillRun {
  id: string;
  skillName: string;
  status: string;
  phase: string | null;
  startedAt: string;
  completedAt?: string | null;
  engagementId?: string | null;
  buyerName?: string | null;
  errorMessage?: string | null;
  stepCount?: number;
  /** e.g. "Sarah Jenkins <sarah@acme.com>" — the prospect this run is about, when known. */
  subjectLabel?: string | null;
  /** ISO timestamp if this run's client currently has automations paused, else null/undefined. */
  engagementPausedAt?: string | null;
}

interface LiveExecutionFeedProps {
  initialRuns: SkillRun[];
  /** Defaults to "/api/skill-runs/recent". Pass e.g. "/api/skill-runs/recent?skill=pre-call-read&limit=50" to scope the live poll to one module. */
  apiUrl?: string;
  /** Defaults to "Live Executions". */
  title?: string;
}

function actionSummary(run: SkillRun): string {
  const s = run.status.toLowerCase();
  const skill = run.skillName as SkillName;

  if (s === "running") return phaseLabel(run.phase);
  if (s === "failed") {
    if (run.errorMessage && run.errorMessage.length < 80) return run.errorMessage;
    return "Failed — click to view run telemetry";
  }
  if (s === "timed_out") return "Timed out — exceeded max runtime, click to view";
  if (s === "cancelled") return "Cancelled by user request";

  const summaries: Partial<Record<SkillName, string>> = {
    "pin-down":      "Client account set up and confirmation page live",
    "pile-on":       "Pre-call sequence queued for this booking",
    "pre-call-read": "Call brief sent to your team",
    "win-back":      "Win-back sequence triggered for no-show",
    "leak-map":      "Funnel health report generated",
  };

  return summaries[skill] ?? SKILL_INFO[skill]?.description ?? "Completed";
}

function RunStatusIcon({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === "success" || s === "completed") return <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />;
  if (s === "failed" || s === "error") return <XCircle className="w-4 h-4 text-rose-500 shrink-0" />;
  if (s === "timed_out") return <Clock className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />;
  if (s === "cancelled") return <Ban className="w-4 h-4 text-amber-500 shrink-0" />;
  if (s === "running" || s === "in_progress") return <Loader2 className="w-4 h-4 text-zinc-500 dark:text-zinc-400 animate-spin shrink-0" />;
  return <AlertCircle className="w-4 h-4 text-zinc-400 dark:text-zinc-600 shrink-0" />;
}

function StatusLabel({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === "success" || s === "completed") return <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 font-mono">Done</span>;
  if (s === "failed" || s === "error") return <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 font-mono">Failed</span>;
  if (s === "timed_out") return <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 font-mono">Timed out</span>;
  if (s === "cancelled") return <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 font-mono">Cancelled</span>;
  if (s === "running" || s === "in_progress") return <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 italic font-mono">Running</span>;
  return <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-600 font-mono">Pending</span>;
}

function ClientCell({ run }: { run: SkillRun }) {
  const displayName = run.buyerName ?? run.engagementId ?? "Unknown client";
  const showHashIcon = !run.buyerName && !!run.engagementId;

  return (
    <div className="flex items-center gap-2 min-w-0" title={displayName}>
      {showHashIcon && <Hash size={12} className="text-zinc-400 dark:text-zinc-600 shrink-0" />}
      <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">
        {displayName}
      </span>
    </div>
  );
}

function RelativeTime({ isoString }: { isoString: string }) {
  const compute = useCallback(() => {
    const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  }, [isoString]);

  const [label, setLabel] = useState(compute);

  useEffect(() => {
    const id = setInterval(() => setLabel(compute()), 1000);
    return () => clearInterval(id);
  }, [compute]);

  return (
    <span className="text-xs font-mono text-zinc-400 dark:text-zinc-600 tabular-nums">{label}</span>
  );
}

function RunPreview({ run }: { run: SkillRun }) {
  const displayName = run.buyerName ?? run.engagementId ?? "Unknown client";
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-foreground truncate">{displayName}</span>
        <RelativeTime isoString={run.startedAt} />
      </div>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span className="font-mono font-bold uppercase tracking-wide text-[11px]">{skillName(run.skillName)}</span>
        <span>·</span>
        <div className="flex items-center gap-1">
          <RunStatusIcon status={run.status} />
          <StatusLabel status={run.status} />
        </div>
      </div>
      <p className="text-muted-foreground leading-snug">{actionSummary(run)}</p>
      {run.subjectLabel && <p className="font-mono text-muted-foreground/70 truncate">{run.subjectLabel}</p>}
    </div>
  );
}

/**
 * Builds the contextual quick-action list for one run — what's offered
 * depends on whether the run is still in flight, which skill it is, and
 * whether we know the client's automations are currently paused. Every
 * entry maps to a real endpoint in src/lib/quick-actions.ts; nothing here
 * is decorative.
 */
function buildRunSections(
  run: SkillRun,
  dispatch: ReturnType<typeof useQuickActions>["run"],
  closePanel: () => void,
  onDone: () => void
): ActionPanelSection[] {
  const isRunning = run.status.toLowerCase() === "running";
  const skill = run.skillName as SkillName;
  const isPaused = !!run.engagementPausedAt;
  const canManualTrigger = skill === "pre-call-read" || skill === "leak-map";

  const primary: ActionPanelSection["items"] = [
    { key: "view", icon: ArrowUpRight, label: "View full run detail", href: `/dashboard/runs/${run.id}` },
  ];

  if (run.engagementId && run.buyerName) {
    primary.push({
      key: "open-engagement",
      icon: ArrowUpRight,
      label: "Open client engagement",
      href: `/dashboard/engagements/${run.engagementId}`,
    });
  }

  const runControl: ActionPanelSection["items"] = [];

  if (isRunning) {
    runControl.push({
      key: "cancel",
      icon: Ban,
      label: "Cancel this run",
      tone: "danger",
      onSelect: () => dispatch("cancel", () => cancelSkillRun(run.id), () => { onDone(); closePanel(); }),
    });
  } else if (canManualTrigger) {
    runControl.push({
      key: "retrigger",
      icon: skill === "leak-map" ? Waves : RotateCcw,
      label: skill === "leak-map" ? "Generate a fresh Leak Map" : "Run again",
      disabled: !run.engagementId,
      onSelect: () =>
        run.engagementId &&
        dispatch("retrigger", () => triggerSkillRun(run.engagementId as string, skill), () => { onDone(); closePanel(); }),
    });
  }

  if (run.engagementId && skill !== "leak-map" && !isRunning) {
    runControl.push({
      key: "leak-map",
      icon: Waves,
      label: "Generate Leak Map for this client",
      onSelect: () =>
        run.engagementId &&
        dispatch("leak-map", () => triggerSkillRun(run.engagementId as string, "leak-map"), () => { onDone(); closePanel(); }),
    });
  }

  if (run.engagementId) {
    runControl.push(
      isPaused
        ? {
            key: "resume",
            icon: PlayCircle,
            label: "Resume automations for this client",
            onSelect: () =>
              dispatch("resume", () => resumeEngagement(run.engagementId as string), () => { onDone(); closePanel(); }),
          }
        : {
            key: "pause",
            icon: PauseCircle,
            label: "Pause automations for this client",
            onSelect: () =>
              dispatch("pause", () => pauseEngagement(run.engagementId as string), () => { onDone(); closePanel(); }),
          }
    );
  }

  const utility: ActionPanelSection["items"] = [
    { key: "copy", icon: Copy, label: "Copy run ID", onSelect: () => dispatch("copy", () => copyToClipboard(run.id)) },
  ];

  const sections: ActionPanelSection[] = [{ label: "Actions", items: primary }];
  if (runControl.length > 0) sections.push({ label: "Run control", items: runControl });
  sections.push({ label: "Utility", items: utility });
  return sections;
}

function RunRow({ run, onOpen, onActionComplete }: { run: SkillRun; onOpen: () => void; onActionComplete: () => void }) {
  const isRunning = run.status.toLowerCase() === "running";
  const isFailed = run.status.toLowerCase() === "failed" || run.status.toLowerCase() === "timed_out";
  const [panelOpen, setPanelOpen] = useState(false);
  const { busyKey, error, run: dispatch } = useQuickActions();

  return (
    <tr
      className={`group bg-zinc-50/40 dark:bg-zinc-900/40 hover:bg-zinc-100 dark:hover:bg-zinc-900/80 transition-colors cursor-pointer relative ${
        isRunning ? "bg-zinc-100/60 dark:bg-zinc-900/70" : ""
      }`}
      onClick={onOpen}
    >
      <td className="px-4 py-2.5 max-w-[180px]" onClick={(e) => { if (run.engagementId && run.buyerName) e.stopPropagation(); }}>
        {run.buyerName && run.engagementId ? (
          <Link href={`/dashboard/engagements/${run.engagementId}`} onClick={(e) => e.stopPropagation()} className="hover:text-zinc-900 dark:hover:text-white transition-colors relative z-20">
            <ClientCell run={run} />
          </Link>
        ) : (
          <ClientCell run={run} />
        )}
      </td>

      <td className="px-4 py-2.5">
        <span className="text-sm text-zinc-600 dark:text-zinc-400 font-semibold whitespace-nowrap">
          {skillName(run.skillName)}
        </span>
        {(run.stepCount ?? 0) > 0 && (
          <span className="ml-2 text-[10px] font-mono text-zinc-400 dark:text-zinc-700">
            {run.stepCount} step{run.stepCount === 1 ? "" : "s"}
          </span>
        )}
      </td>

      <td className="px-4 py-2.5 max-w-[280px]">
        <span
          className={`text-sm truncate block font-medium ${isFailed ? "text-rose-600 dark:text-rose-400/80 font-mono" : isRunning ? "text-zinc-800 dark:text-zinc-300" : "text-zinc-500"}`}
          title={actionSummary(run)}
        >
          {actionSummary(run)}
        </span>
        {run.subjectLabel && (
          <span className="text-[11px] text-zinc-400 dark:text-zinc-600 truncate block font-mono" title={run.subjectLabel}>
            {run.subjectLabel}
          </span>
        )}
      </td>

      <td className="px-4 py-2.5 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <RunStatusIcon status={run.status} />
          <StatusLabel status={run.status} />
        </div>
      </td>

      <td className="px-4 py-2.5 text-right whitespace-nowrap">
        <RelativeTime isoString={run.startedAt} />
      </td>

      <td className="pr-3 text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1">
          <ArrowRight className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-700 opacity-0 group-hover:opacity-100 transition-all transform translate-x-[-2px] group-hover:translate-x-0 duration-150" />
          <ActionPanel
            open={panelOpen}
            onOpenChange={setPanelOpen}
            header={<RunPreview run={run} />}
            sections={buildRunSections(run, dispatch, () => setPanelOpen(false), onActionComplete)}
            errorText={error}
            busyKey={busyKey}
            triggerLabel={`Quick actions for ${run.buyerName ?? "this run"}`}
          />
        </div>
      </td>
    </tr>
  );
}

export function LiveExecutionFeed({ initialRuns, apiUrl, title }: LiveExecutionFeedProps) {
  const router = useRouter();
  const [runs, setRuns] = useState<SkillRun[]>(initialRuns);
  const [polling, setPolling] = useState(true);

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<5 | 10>(10);

  const buildUrl = useCallback((offset: number, limit: number) => {
    const url = new URL(apiUrl ?? "/api/skill-runs/recent", window.location.origin);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    return url.pathname + url.search;
  }, [apiUrl]);

  const refresh = useCallback(async (signal: AbortSignal) => {
    try {
      const res = await fetch(buildUrl(page * pageSize, pageSize), { cache: "no-store", signal });
      if (signal.aborted || !res.ok) return;
      const data = await res.json();
      if (signal.aborted) return;
      setRuns(data.runs ?? []);
    } catch {
      // Ignore AbortError on unmount/re-fetch
    }
  }, [buildUrl, page, pageSize]);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      await refresh(controller.signal);
    })();

    if (!polling || page !== 0) {
      return () => controller.abort();
    }

    const id = setInterval(() => refresh(controller.signal), 5000);
    return () => {
      clearInterval(id);
      controller.abort();
    };
  }, [page, pageSize, polling, refresh]);

  /** Fires a one-off refresh right after a quick action succeeds, so cancel/pause/resume/retrigger reflect immediately instead of waiting for the next poll tick. */
  const refreshNow = useCallback(() => {
    const controller = new AbortController();
    refresh(controller.signal);
  }, [refresh]);

  function goToPage(next: number) {
    const clamped = Math.max(0, next);
    setPage(clamped);
    setPolling(clamped === 0);
  }

  function changePageSize(size: 5 | 10) {
    setPageSize(size);
    setPage(0);
    setPolling(true);
  }

  if (runs.length === 0 && page === 0) {
    return (
      <div className="h-32 flex items-center justify-center border border-dashed border-zinc-300 dark:border-zinc-800 rounded-lg bg-zinc-50/50 dark:bg-zinc-950/50 transition-colors">
        <div className="text-center space-y-1">
          <p className="text-sm font-medium text-zinc-500">No executions yet</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-600 max-w-sm font-mono">
            Skill runs will appear here once triggered for a client engagement
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white/60 dark:bg-zinc-900/50 backdrop-blur-md overflow-hidden shadow-sm transition-colors duration-200">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider font-mono">
            {title ?? "Live Executions"}
          </h3>
          <span className="text-xs font-mono text-zinc-400 dark:text-zinc-600 bg-zinc-200/60 dark:bg-zinc-900 px-1.5 py-0.5 rounded-sm border border-zinc-300/40 dark:border-zinc-800/40">{runs.length}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-[10px] font-mono text-zinc-400 dark:text-zinc-600">
            {([5, 10] as const).map((size) => (
              <button
                key={size}
                onClick={() => changePageSize(size)}
                className={`px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                  pageSize === size
                    ? "border-zinc-400 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-900/40 text-zinc-700 dark:text-zinc-300"
                    : "border-transparent hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                {size}/page
              </button>
            ))}
          </div>
          <button
            onClick={() => setPolling((p) => !p)}
            className="text-xs font-bold font-mono text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors cursor-pointer"
          >
            {polling && page === 0 ? "[ Pause live ]" : "[ Resume live ]"}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left border-collapse text-xs font-sans tracking-tight">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800/50 bg-zinc-50/30 dark:bg-transparent text-zinc-400 dark:text-zinc-600 uppercase tracking-wider font-mono text-[10px] select-none">
              <th className="px-4 py-2 w-[180px] font-normal">Client</th>
              <th className="px-4 py-2 font-normal">Module</th>
              <th className="px-4 py-2 font-normal">Action</th>
              <th className="px-4 py-2 w-24 font-normal">Status</th>
              <th className="px-4 py-2 text-right w-12 font-normal">Age</th>
              <th className="w-8 px-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/30">
            {runs.map((run) => (
              <RunRow
                key={run.id}
                run={run}
                onOpen={() => router.push(`/dashboard/runs/${run.id}`)}
                onActionComplete={refreshNow}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/30 dark:bg-transparent">
        <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600">
          {page === 0 ? "Showing most recent" : `Page ${page + 1}`}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => goToPage(page - 1)}
            disabled={page === 0}
            className="px-2 py-1 text-[10px] font-mono font-bold rounded border border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            ← Prev
          </button>
          <button
            onClick={() => goToPage(page + 1)}
            disabled={runs.length < pageSize}
            className="px-2 py-1 text-[10px] font-mono font-bold rounded border border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}