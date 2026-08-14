"use client";

import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
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
  RotateCcw,
  Waves,
  Copy,
} from "lucide-react";
import { skillName, phaseLabel, SKILL_INFO, SKILLS, EXECUTIONS_TOOLBAR_COPY as toolbarCopy, TABLE_TOOLBAR_COPY as sharedToolbarCopy, type SkillName } from "@/lib/copy";
import { ActionPanel, useQuickActions, type ActionPanelSection } from "@/components/action-panel";
import { cancelSkillRun, triggerSkillRun, copyToClipboard } from "@/lib/quick-actions";
import { SegmentedTabs, type SegmentedTabOption } from "@/components/segmented-tabs";
import { TableSearchInput } from "@/components/table-search-input";
import { TimeRangeMenu, computeTimeRangeBounds, isWithinTimeRange, type TimeRangeValue } from "@/components/time-range-menu";
import { ViewCustomizer, FilterChipBar, type CustomizerSection } from "@/components/view-customizer";
import { useLocalViewState } from "@/lib/use-local-view-state";
import { groupBySignature, normalizeForSignature } from "@/lib/list-grouping";
import { GroupCountToggle } from "@/components/group-toggle";
import { VerboseTime } from "@/components/relative-time";

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
  /** Defaults to "/api/skill-runs/recent". Pass e.g. "/api/skill-runs/recent?skill=pre-call-read" to scope the live poll to one module. */
  apiUrl?: string;
  /** Defaults to "Live Executions". */
  title?: string;
  /** Set when apiUrl is already scoped to one skill (see modules/[skill]/page.tsx) — hides the redundant per-module customize chips. */
  lockedSkill?: SkillName;
  /** Scopes the persisted view-customization (pinned chips, page size, stat toggles) to this instance, so e.g. the dashboard-overview widget and a single module's history don't share one saved view. Defaults to "default". */
  storageKey?: string;
}

// ---------------------------------------------------------------------------
// Toolbar: tabs and customize chips
//
// Tabs bucket the real `status` column (see models/schema.ts skillRuns.status)
// into four groups. "cancelled" deliberately doesn't map to any of the three
// specific tabs — it's neither in-flight, broken, nor a normal completion —
// so it only shows up under "All" or via the "Cancelled runs" customize chip.
// ---------------------------------------------------------------------------

type ExecutionsTab = "all" | "running" | "needs_attention" | "completed";

function tabOfStatus(status: string): ExecutionsTab | null {
  const s = status.toLowerCase();
  if (s === "running" || s === "in_progress") return "running";
  if (s === "failed" || s === "error" || s === "timed_out") return "needs_attention";
  if (s === "success" || s === "completed") return "completed";
  return null; // cancelled, or anything unrecognized
}

interface ExecutionsChipDef {
  id: string;
  label: string;
  section: string;
  /** Chips sharing a group OR together; different groups AND together. */
  group: string;
  predicate: (run: SkillRun) => boolean;
}

const MODULE_CHIP_DEFS: ExecutionsChipDef[] = SKILLS.map((skill) => ({
  id: `module-${skill}`,
  label: SKILL_INFO[skill].name,
  section: toolbarCopy.chipSections.module,
  group: "module",
  predicate: (run) => run.skillName === skill,
}));

const STATUS_ACCOUNT_CHIP_DEFS: ExecutionsChipDef[] = [
  {
    id: "cancelled",
    label: toolbarCopy.chips.cancelled,
    section: toolbarCopy.chipSections.status,
    group: "cancelled",
    predicate: (r) => r.status.toLowerCase() === "cancelled",
  },
  {
    id: "long-running",
    label: toolbarCopy.chips.longRunning,
    section: toolbarCopy.chipSections.status,
    group: "long-running",
    predicate: (r) => r.status.toLowerCase() === "running" && Date.now() - new Date(r.startedAt).getTime() > 10 * 60_000,
  },
  {
    id: "paused-clients",
    label: toolbarCopy.chips.pausedClients,
    section: toolbarCopy.chipSections.account,
    group: "paused-clients",
    predicate: (r) => !!r.engagementPausedAt,
  },
];

const STAT_TOGGLE_IDS = {
  successRate: "stat:success-rate",
  moduleBreakdown: "stat:module-breakdown",
  groupRepeats: "stat:group-repeats",
} as const;

/**
 * Two runs "are the same thing happening again" when they're for the same
 * client, the same skill, ended the same way, AND carry the same message —
 * e.g. a broken Klaviyo credential failing Pile-On for Acme every night
 * with the identical error text. Runs with no error/subject text at all
 * (nothing to compare) never collapse into each other — an empty
 * signature tail would otherwise group unrelated bare-status runs.
 */
function runSignature(run: SkillRun): string {
  const detail = normalizeForSignature(run.errorMessage ?? run.subjectLabel);
  if (!detail) return `solo:${run.id}`; // nothing to compare against — never merges with anything else
  return [run.engagementId ?? "no-engagement", run.skillName, run.status.toLowerCase(), detail].join("|");
}

interface ExecutionsViewState {
  pinnedChipIds: string[];
  pageSize: 10 | 25 | 50;
  showSuccessRate: boolean;
  showModuleBreakdown: boolean;
  groupRepeats: boolean;
}

const DEFAULT_EXECUTIONS_VIEW: ExecutionsViewState = {
  pinnedChipIds: [],
  pageSize: 10,
  showSuccessRate: false,
  showModuleBreakdown: false,
  groupRepeats: true,
};

const TERMINAL_STATUSES = new Set(["success", "completed", "failed", "error", "timed_out"]);
const SUCCESS_STATUSES = new Set(["success", "completed"]);

/** Fetch window for the "live" poll — the most recent N runs across the tenant (or one skill, when apiUrl is scoped). Tabs/search/time-range/chips and pagination all then operate client-side over this window, which is why it's much bigger than any one page: "Live Executions" is this window's real scope, not a full historical archive. */
const FETCH_WINDOW = 150;

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

// function RelativeTime({ isoString }: { isoString: string }) {
//   const compute = useCallback(() => {
//     const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
//     if (diff < 60) return `${diff}s`;
//     if (diff < 3600) return `${Math.floor(diff / 60)}m`;
//     if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
//     return `${Math.floor(diff / 86400)}d`;
//   }, [isoString]);

//   const [label, setLabel] = useState(compute);

//   useEffect(() => {
//     const id = setInterval(() => setLabel(compute()), 1000);
//     return () => clearInterval(id);
//   }, [compute]);

//   return (
//     <span className="text-xs font-mono text-zinc-400 dark:text-zinc-600 tabular-nums">{label}</span>
//   );
// }

/** Short run reference badge — identical styling to the one in queue-panel
 *  so the operator can eyeball-match `#a1b2c3d4` across both surfaces. */
function RunRefBadge({ runId }: { runId: string }) {
  return (
    <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800/60 px-1.5 py-0.5 rounded border border-zinc-200/80 dark:border-zinc-800 shrink-0 select-all">
      #{runId.slice(0, 8)}
    </span>
  );
}

function RunPreview({ run }: { run: SkillRun }) {
  const displayName = run.buyerName ?? run.engagementId ?? "Unknown client";
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-foreground truncate">{displayName}</span>
       <VerboseTime isoString={run.startedAt} className="text-xs" />
      </div>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span className="font-mono font-bold uppercase tracking-wide text-[11px]">{skillName(run.skillName)}</span>
        <RunRefBadge runId={run.id} />
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

  // Deliberately only actions about *this run* — a cross-skill "Generate
  // Leak Map for this client" and client-level Pause/Resume used to live
  // here too, but pause/resume already have a real home on the client
  // engagement page, and firing an unrelated skill from a specific run's
  // menu is the same "wrong place for this" pattern the queue panel had.
  // See Observation 6.
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

  const utility: ActionPanelSection["items"] = [
    { key: "copy", icon: Copy, label: "Copy run ID", onSelect: () => dispatch("copy", () => copyToClipboard(run.id)) },
  ];

  const sections: ActionPanelSection[] = [{ label: "Actions", items: primary }];
  if (runControl.length > 0) sections.push({ label: "Run control", items: runControl });
  sections.push({ label: "Utility", items: utility });
  return sections;
}

function RunRow({
  run,
  onOpen,
  onActionComplete,
  groupCount = 1,
  groupExpanded = false,
  onToggleGroup,
  nested = false,
}: {
  run: SkillRun;
  onOpen: () => void;
  onActionComplete: () => void;
  /** >1 means this row is standing in for that many identical (same client/module/status/message) runs — see runSignature() below. */
  groupCount?: number;
  groupExpanded?: boolean;
  onToggleGroup?: () => void;
  /** True for the older repeats revealed underneath a group's header row when expanded — dims and indents slightly so they read as "part of the group above," not new top-level rows. */
  nested?: boolean;
}) {
  const isRunning = run.status.toLowerCase() === "running";
  const isFailed = run.status.toLowerCase() === "failed" || run.status.toLowerCase() === "timed_out";
  const [panelOpen, setPanelOpen] = useState(false);
  const { busyKey, error, run: dispatch } = useQuickActions();

  return (
    <tr
      className={`group bg-zinc-50/40 dark:bg-zinc-900/40 hover:bg-zinc-100 dark:hover:bg-zinc-900/80 transition-colors cursor-pointer relative ${
        isRunning ? "bg-zinc-100/60 dark:bg-zinc-900/70" : ""
      } ${nested ? "bg-zinc-50/70 dark:bg-zinc-950/50 border-l-2 border-l-zinc-200 dark:border-l-zinc-800" : ""}`}
      onClick={onOpen}
    >
      <td className={`px-4 py-2.5 max-w-[180px] ${nested ? "pl-7" : ""}`} onClick={(e) => { if (run.engagementId && run.buyerName) e.stopPropagation(); }}>
        {run.buyerName && run.engagementId ? (
          <Link href={`/dashboard/engagements/${run.engagementId}`} onClick={(e) => e.stopPropagation()} className="hover:text-zinc-900 dark:hover:text-white transition-colors relative z-20">
            <ClientCell run={run} />
          </Link>
        ) : (
          <ClientCell run={run} />
        )}
      </td>

      <td className="px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-zinc-600 dark:text-zinc-400 font-semibold whitespace-nowrap">
            {skillName(run.skillName)}
          </span>
          <RunRefBadge runId={run.id} />
        </div>
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
          {onToggleGroup && (
            <GroupCountToggle count={groupCount} expanded={groupExpanded} onToggle={onToggleGroup} />
          )}
        </div>
      </td>

    <td className="px-4 py-2.5 text-right whitespace-nowrap">
  <VerboseTime isoString={run.startedAt} className="text-xs" />
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

export function LiveExecutionFeed({ initialRuns, apiUrl, title, lockedSkill, storageKey }: LiveExecutionFeedProps) {
  const router = useRouter();
  const [runs, setRuns] = useState<SkillRun[]>(initialRuns);
  const [polling, setPolling] = useState(true);

  const [savedView, setSavedView] = useLocalViewState<ExecutionsViewState>(
    `mcs:executions:${storageKey ?? "default"}`,
    DEFAULT_EXECUTIONS_VIEW
  );
  const [tab, setTab] = useState<ExecutionsTab>("all");
  const [search, setSearch] = useState("");
  const [timeRange, setTimeRange] = useState<TimeRangeValue>("all");
  const [activeChipIds, setActiveChipIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);

  const pinnedChipIds = new Set(savedView.pinnedChipIds);
  const pageSize = savedView.pageSize;

  const buildUrl = useCallback(() => {
    const url = new URL(apiUrl ?? "/api/skill-runs/recent", window.location.origin);
    url.searchParams.set("limit", String(FETCH_WINDOW));
    url.searchParams.delete("offset"); // always the latest window — paging is client-side now
    return url.pathname + url.search;
  }, [apiUrl]);

  const refresh = useCallback(async (signal: AbortSignal) => {
    try {
      const res = await fetch(buildUrl(), { cache: "no-store", signal });
      if (signal.aborted || !res.ok) return;
      const data = await res.json();
      if (signal.aborted) return;
      setRuns(data.runs ?? []);
    } catch {
      // Ignore AbortError on unmount/re-fetch
    }
  }, [buildUrl]);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      await refresh(controller.signal);
    })();

    if (!polling) {
      return () => controller.abort();
    }

    const id = setInterval(() => refresh(controller.signal), 5000);
    return () => {
      clearInterval(id);
      controller.abort();
    };
  }, [polling, refresh]);

  /** Fires a one-off refresh right after a quick action succeeds, so cancel/pause/resume/retrigger reflect immediately instead of waiting for the next poll tick. */
  const refreshNow = useCallback(() => {
    const controller = new AbortController();
    refresh(controller.signal);
  }, [refresh]);

  const chipDefs = useMemo(
    () => (lockedSkill ? STATUS_ACCOUNT_CHIP_DEFS : [...MODULE_CHIP_DEFS, ...STATUS_ACCOUNT_CHIP_DEFS]),
    [lockedSkill]
  );

  const tabCounts = useMemo(() => {
    const counts: Record<ExecutionsTab, number> = { all: runs.length, running: 0, needs_attention: 0, completed: 0 };
    for (const r of runs) {
      const t = tabOfStatus(r.status);
      if (t) counts[t]++;
    }
    return counts;
  }, [runs]);

  const tabFiltered = useMemo(
    () => (tab === "all" ? runs : runs.filter((r) => tabOfStatus(r.status) === tab)),
    [runs, tab]
  );

  const rangeFiltered = useMemo(() => {
    if (timeRange === "all") return tabFiltered;
    const bounds = computeTimeRangeBounds(timeRange);
    return tabFiltered.filter((r) => isWithinTimeRange(r.startedAt, bounds));
  }, [tabFiltered, timeRange]);

  const searchFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rangeFiltered;
    return rangeFiltered.filter((r) => {
      const skillLabel = skillName(r.skillName).toLowerCase();
      return (
        (r.buyerName ?? "").toLowerCase().includes(q) ||
        skillLabel.includes(q) ||
        actionSummary(r).toLowerCase().includes(q) ||
        (r.subjectLabel ?? "").toLowerCase().includes(q)
      );
    });
  }, [rangeFiltered, search]);

  const chipCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const def of chipDefs) {
      let n = 0;
      for (const run of searchFiltered) if (def.predicate(run)) n++;
      counts.set(def.id, n);
    }
    return counts;
  }, [chipDefs, searchFiltered]);

  const visibleRuns = useMemo(() => {
    if (activeChipIds.size === 0) return searchFiltered;
    const activeDefs = chipDefs.filter((d) => activeChipIds.has(d.id));
    const groups = new Map<string, ExecutionsChipDef[]>();
    for (const def of activeDefs) {
      const bucket = groups.get(def.group) ?? [];
      bucket.push(def);
      groups.set(def.group, bucket);
    }
    return searchFiltered.filter((run) => {
      for (const defs of groups.values()) {
        if (!defs.some((d) => d.predicate(run))) return false;
      }
      return true;
    });
  }, [searchFiltered, activeChipIds, chipDefs]);

  const successRateInfo = useMemo(() => {
    if (!savedView.showSuccessRate) return null;
    const terminal = searchFiltered.filter((r) => TERMINAL_STATUSES.has(r.status.toLowerCase()));
    if (terminal.length === 0) return null;
    const successful = terminal.filter((r) => SUCCESS_STATUSES.has(r.status.toLowerCase())).length;
    return { rate: Math.round((successful / terminal.length) * 100), total: terminal.length };
  }, [searchFiltered, savedView.showSuccessRate]);

  const moduleBreakdown = useMemo(() => {
    if (!savedView.showModuleBreakdown || lockedSkill) return null;
    const counts = new Map<string, number>();
    for (const r of searchFiltered) counts.set(r.skillName, (counts.get(r.skillName) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [searchFiltered, savedView.showModuleBreakdown, lockedSkill]);

  // Collapse repeats *after* every filter has already narrowed visibleRuns
  // down, so tab/chip counts above stay honest (they count real runs, not
  // groups) while what actually renders collapses identical repeats.
  const runGroups = useMemo(() => {
    if (!savedView.groupRepeats) {
      return visibleRuns.map((r) => ({ signature: r.id, items: [r], latest: r, count: 1 }));
    }
    return groupBySignature(visibleRuns, runSignature, (r) => r.startedAt);
  }, [visibleRuns, savedView.groupRepeats]);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  function toggleGroupExpanded(signature: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(signature)) next.delete(signature);
      else next.add(signature);
      return next;
    });
  }

  const pageCount = Math.max(1, Math.ceil(runGroups.length / pageSize));
  const clampedPage = Math.min(page, pageCount - 1);
  const pagedGroups = runGroups.slice(clampedPage * pageSize, clampedPage * pageSize + pageSize);

  useEffect(() => {
    setPage(0);
  }, [tab, search, timeRange, savedView.pinnedChipIds, activeChipIds, pageSize, savedView.groupRepeats]);

  function handleCustomizeToggle(id: string) {
    if (id === STAT_TOGGLE_IDS.successRate) {
      setSavedView((prev) => ({ ...prev, showSuccessRate: !prev.showSuccessRate }));
      return;
    }
    if (id === STAT_TOGGLE_IDS.moduleBreakdown) {
      setSavedView((prev) => ({ ...prev, showModuleBreakdown: !prev.showModuleBreakdown }));
      return;
    }
    if (id === STAT_TOGGLE_IDS.groupRepeats) {
      setSavedView((prev) => ({ ...prev, groupRepeats: !prev.groupRepeats }));
      return;
    }
    setSavedView((prev) => {
      const next = new Set(prev.pinnedChipIds);
      if (next.has(id)) {
        next.delete(id);
        setActiveChipIds((prevActive) => {
          const nextActive = new Set(prevActive);
          nextActive.delete(id);
          return nextActive;
        });
      } else {
        next.add(id);
      }
      return { ...prev, pinnedChipIds: Array.from(next) };
    });
  }

  function toggleActiveChip(id: string) {
    setActiveChipIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function changePageSize(size: 10 | 25 | 50) {
    setSavedView((prev) => ({ ...prev, pageSize: size }));
  }

  function clearFilters() {
    setTab("all");
    setSearch("");
    setTimeRange("all");
    setActiveChipIds(new Set());
  }

  const hasActiveFilters = tab !== "all" || search.trim() !== "" || timeRange !== "all" || activeChipIds.size > 0;

  if (runs.length === 0) {
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

  const tabOptions: SegmentedTabOption<ExecutionsTab>[] = [
    { key: "all", label: toolbarCopy.tabs.all, count: tabCounts.all },
    { key: "running", label: toolbarCopy.tabs.running, count: tabCounts.running },
    { key: "needs_attention", label: toolbarCopy.tabs.needs_attention, count: tabCounts.needs_attention },
    { key: "completed", label: toolbarCopy.tabs.completed, count: tabCounts.completed },
  ];

  const chipSectionOrder = lockedSkill
    ? [toolbarCopy.chipSections.status, toolbarCopy.chipSections.account]
    : [toolbarCopy.chipSections.module, toolbarCopy.chipSections.status, toolbarCopy.chipSections.account];

  const customizerSections: CustomizerSection[] = [
    ...chipSectionOrder
      .map((sectionLabel) => ({
        label: sectionLabel,
        options: chipDefs
          .filter((d) => d.section === sectionLabel)
          .map((d) => ({ id: d.id, label: d.label, count: chipCounts.get(d.id) ?? 0 })),
      }))
      .filter((s) => s.options.length > 0),
    {
      label: sharedToolbarCopy.displaySectionLabel,
      options: [{ id: STAT_TOGGLE_IDS.groupRepeats, label: sharedToolbarCopy.groupRepeatsLabel }],
    },
    {
      label: sharedToolbarCopy.statsSectionLabel,
      options: lockedSkill
        ? [{ id: STAT_TOGGLE_IDS.successRate, label: toolbarCopy.stats.showSuccessRate }]
        : [
            { id: STAT_TOGGLE_IDS.successRate, label: toolbarCopy.stats.showSuccessRate },
            { id: STAT_TOGGLE_IDS.moduleBreakdown, label: toolbarCopy.stats.showModuleBreakdown },
          ],
    },
  ];

  const customizerEnabledIds = new Set(savedView.pinnedChipIds);
  if (savedView.showSuccessRate) customizerEnabledIds.add(STAT_TOGGLE_IDS.successRate);
  if (savedView.showModuleBreakdown) customizerEnabledIds.add(STAT_TOGGLE_IDS.moduleBreakdown);
  if (savedView.groupRepeats) customizerEnabledIds.add(STAT_TOGGLE_IDS.groupRepeats);

  const pinnedChips = chipDefs
    .filter((d) => pinnedChipIds.has(d.id))
    .map((d) => ({ id: d.id, label: d.label, count: chipCounts.get(d.id) ?? 0 }));

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white/60 dark:bg-zinc-900/50 backdrop-blur-md overflow-hidden shadow-sm transition-colors duration-200">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider font-mono shrink-0">
            {title ?? toolbarCopy.title}
          </h3>
          <span className="text-xs font-mono text-zinc-400 dark:text-zinc-600 bg-zinc-200/60 dark:bg-zinc-900 px-1.5 py-0.5 rounded-sm border border-zinc-300/40 dark:border-zinc-800/40 shrink-0">
            {visibleRuns.length}
          </span>
          {successRateInfo && (
            <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 truncate">
              {successRateInfo.rate}% {toolbarCopy.successRateSuffix(successRateInfo.total)}
            </span>
          )}
          {moduleBreakdown && moduleBreakdown.length > 0 && (
            <div className="hidden md:flex items-center gap-1 min-w-0 overflow-hidden">
              {moduleBreakdown.map(([skill, count]) => (
                <span
                  key={skill}
                  className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600 bg-zinc-100/70 dark:bg-zinc-900/60 px-1.5 py-0.5 rounded-sm whitespace-nowrap"
                >
                  {skillName(skill)} {count}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => setPolling((p) => !p)}
          className="text-xs font-bold font-mono text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors cursor-pointer shrink-0"
        >
          {polling ? "[ Pause live ]" : "[ Resume live ]"}
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800/60">
        <SegmentedTabs options={tabOptions} value={tab} onChange={setTab} />
        <TableSearchInput value={search} onChange={setSearch} placeholder={toolbarCopy.searchPlaceholder} className="w-[190px]" />
        <TimeRangeMenu value={timeRange} onChange={setTimeRange} />
        <div className="ml-auto flex items-center gap-1.5">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors cursor-pointer"
            >
              {sharedToolbarCopy.clearFiltersButton}
            </button>
          )}
          <ViewCustomizer
            sections={customizerSections}
            enabledIds={customizerEnabledIds}
            onToggle={handleCustomizeToggle}
            menuTitle={sharedToolbarCopy.customizeMenuTitle}
          />
        </div>
      </div>

      {pinnedChips.length > 0 && (
        <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800/60">
          <FilterChipBar chips={pinnedChips} activeIds={activeChipIds} onToggle={toggleActiveChip} />
        </div>
      )}

      {visibleRuns.length === 0 ? (
        <div className="py-10 text-center space-y-1">
          <p className="text-sm font-medium text-zinc-500">{sharedToolbarCopy.noResultsTitle}</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-600 font-mono max-w-sm mx-auto">{sharedToolbarCopy.noResultsSubtitle}</p>
        </div>
      ) : (
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
              {pagedGroups.map((group) => {
                const expanded = expandedGroups.has(group.signature);
                return (
                  <Fragment key={group.signature}>
                    <RunRow
                      run={group.latest}
                      onOpen={() => router.push(`/dashboard/runs/${group.latest.id}`)}
                      onActionComplete={refreshNow}
                      groupCount={group.count}
                      groupExpanded={expanded}
                      onToggleGroup={group.count > 1 ? () => toggleGroupExpanded(group.signature) : undefined}
                    />
                    {expanded &&
                      group.items.slice(1).map((run) => (
                        <RunRow
                          key={run.id}
                          run={run}
                          onOpen={() => router.push(`/dashboard/runs/${run.id}`)}
                          onActionComplete={refreshNow}
                          nested
                        />
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/30 dark:bg-transparent">
        <div className="flex items-center gap-1 text-[10px] font-mono text-zinc-400 dark:text-zinc-600">
          {([10, 25, 50] as const).map((size) => (
            <button
              key={size}
              onClick={() => changePageSize(size)}
              className={`px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                pageSize === size
                  ? "border-zinc-400 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-900/40 text-zinc-700 dark:text-zinc-300"
                  : "border-transparent hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              {sharedToolbarCopy.pageSizeLabel(size)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600">Page {clampedPage + 1} of {pageCount}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(Math.max(0, clampedPage - 1))}
              disabled={clampedPage === 0}
              className="px-2 py-1 text-[10px] font-mono font-bold rounded border border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage(Math.min(pageCount - 1, clampedPage + 1))}
              disabled={clampedPage >= pageCount - 1}
              className="px-2 py-1 text-[10px] font-mono font-bold rounded border border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}