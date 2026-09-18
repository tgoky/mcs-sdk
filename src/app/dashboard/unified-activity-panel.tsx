"use client";

// src/app/dashboard/unified-activity-panel.tsx
//
// Replaces the dashboard's separate, stacked Queue + Live Execution Feed
// sections with one panel. Deliberately built to look and behave like
// queue-panel.tsx (same rail chrome, same toolbar components, same
// pagination) with two real differences: the rail groups by Worker/
// Category instead of Client/Platform (this workspace only ever has one
// client — see the rail's own comment below), and the list merges queue
// items with skill runs instead of showing only one or the other.
//
// Not a rewrite of queue-panel.tsx/live-execution-feed.tsx — those stay
// exactly as they are behind their own full pages (/dashboard/queue,
// /dashboard/runs) for anyone who needs the deeper tag-management/
// grouping/pagination features those pages already have. This is the
// fast, unified overview for the dashboard home specifically. Row
// actions reuse the same real mutations those pages call
// (useQueueItemActions, getRepairAction) rather than re-deriving them.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  Check,
  Loader2,
  ArrowUpRight,
  RotateCcw,
  UserX,
  UserCheck,
  CalendarClock,
  Ban,
  ChevronDown,
  ChevronRight,
  Layers,
} from "lucide-react";
import { useQueueItemActions } from "./use-queue-item-actions";
import { QueueItemPreview } from "./queue-panel";
import { getRepairAction } from "@/lib/queue-repair-action";
import { triggerSkillRun, cancelSkillRun } from "@/lib/quick-actions";
import { useQuickActions } from "@/components/action-panel";
import { AnySkillBadge } from "@/components/any-skill-badge";
import { VerboseTime } from "@/components/relative-time";
import { anySkillDisplayName } from "@/lib/any-skill";
import { PRODUCT_IDS, PRODUCT_SKILL_IDS } from "@/lib/product-catalog";
import { WORKER_REGISTRY, WORKER_CATEGORY_LIST, type WorkerId, type WorkerCategory } from "@/lib/worker-registry";
import { SKILLS_BY_WORKER } from "@/lib/worker-skill-hierarchy";
import { QUEUE_COPY as queueCopy, QUEUE_TOOLBAR_COPY as queueToolbarCopy, EXECUTIONS_TOOLBAR_COPY as execToolbarCopy, TABLE_TOOLBAR_COPY as sharedToolbarCopy } from "@/lib/copy";
import { SegmentedTabs, type SegmentedTabOption } from "@/components/segmented-tabs";
import { TableSearchInput } from "@/components/table-search-input";
import { TimeRangeMenu, computeTimeRangeBounds, isWithinTimeRange, type TimeRangeValue } from "@/components/time-range-menu";
import { ViewCustomizer, FilterChipBar, type CustomizerSection } from "@/components/view-customizer";
import { useLocalViewState } from "@/lib/use-local-view-state";
import { cn } from "@/lib/utils";
import type { UnifiedActivityItem, UnifiedActivityCounts, UnifiedActivityStatus } from "@/lib/unified-activity";

type ActivityTab = "all" | UnifiedActivityStatus;
type RailGroupingMode = "worker" | "category";

const RAIL_WIDTH_KEY = "mcs-unified-activity-rail-width";
const MIN_RAIL_WIDTH = 200;
const MAX_RAIL_WIDTH = 380;
const DEFAULT_RAIL_WIDTH = 256; // matches queue-panel's w-64

function readStoredRailWidth(): number {
  if (typeof window === "undefined") return DEFAULT_RAIL_WIDTH;
  try {
    const stored = window.localStorage.getItem(RAIL_WIDTH_KEY);
    const n = stored ? Number(stored) : NaN;
    return Number.isFinite(n) && n > 0 ? Math.min(MAX_RAIL_WIDTH, Math.max(MIN_RAIL_WIDTH, n)) : DEFAULT_RAIL_WIDTH;
  } catch {
    return DEFAULT_RAIL_WIDTH;
  }
}

const DETAIL_WIDTH_KEY = "mcs-unified-activity-detail-width";
const MIN_DETAIL_WIDTH = 320;
const MAX_DETAIL_WIDTH = 640;
const DEFAULT_DETAIL_WIDTH = 380;

function readStoredDetailWidth(): number {
  if (typeof window === "undefined") return DEFAULT_DETAIL_WIDTH;
  try {
    const stored = window.localStorage.getItem(DETAIL_WIDTH_KEY);
    const n = stored ? Number(stored) : NaN;
    return Number.isFinite(n) && n > 0 ? Math.min(MAX_DETAIL_WIDTH, Math.max(MIN_DETAIL_WIDTH, n)) : DEFAULT_DETAIL_WIDTH;
  } catch {
    return DEFAULT_DETAIL_WIDTH;
  }
}

const STATUS_DOT: Record<UnifiedActivityStatus, string> = {
  needs_action: "bg-rose-500 dark:bg-rose-400",
  running: "bg-sky-500 dark:bg-sky-400 animate-pulse",
  completed: "bg-emerald-500 dark:bg-emerald-400",
  other: "bg-zinc-400 dark:bg-zinc-600",
};

const btnBase =
  "hover-lift press-settle inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-60";
const btnGhost =
  "hover-lift press-settle inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-lg border border-amber-200 dark:border-amber-500/30 bg-white dark:bg-transparent text-zinc-700 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-60";

// Per-skill "Module" chips across all 4 products, same shape
// live-execution-feed.tsx's own MODULE_CHIP_DEFS has always used — merged
// here rather than duplicated so a run's module filters exactly the same
// way whether it's viewed here or on the full Executions page.
interface ActivityChipDef {
  id: string;
  label: string;
  section: string;
  group: string;
  predicate: (item: UnifiedActivityItem) => boolean;
}

const MODULE_CHIP_DEFS: ActivityChipDef[] = PRODUCT_IDS.flatMap((productId) =>
  PRODUCT_SKILL_IDS[productId].map((skill) => ({
    id: `module-${skill}`,
    label: anySkillDisplayName(skill),
    section: execToolbarCopy.chipSections.module,
    group: "module",
    predicate: (item: UnifiedActivityItem) => item.skillName === skill,
  }))
);

const ACCOUNT_STATUS_CHIP_DEFS: ActivityChipDef[] = [
  {
    id: "credential-issues",
    label: queueToolbarCopy.chips.credentialIssues,
    section: queueToolbarCopy.chipSections.diagnosis,
    group: "credential-issues",
    predicate: (item) => !!item.queueItem?.isCredentialIssue,
  },
  {
    id: "cancelled",
    label: execToolbarCopy.chips.cancelled,
    section: execToolbarCopy.chipSections.status,
    group: "cancelled",
    predicate: (item) => (item.run?.status ?? "").toLowerCase() === "cancelled",
  },
  {
    id: "long-running",
    label: execToolbarCopy.chips.longRunning,
    section: execToolbarCopy.chipSections.status,
    group: "long-running",
    predicate: (item) => item.status === "running" && Date.now() - new Date(item.timestamp).getTime() > 10 * 60_000,
  },
  {
    id: "paused-clients",
    label: execToolbarCopy.chips.pausedClients,
    section: execToolbarCopy.chipSections.account,
    group: "paused-clients",
    predicate: (item) => !!item.engagementPausedAt,
  },
];

const ACTIVITY_CHIP_DEFS: ActivityChipDef[] = [...MODULE_CHIP_DEFS, ...ACCOUNT_STATUS_CHIP_DEFS];
const ACTIVITY_CHIP_SECTION_ORDER = [
  execToolbarCopy.chipSections.module,
  queueToolbarCopy.chipSections.diagnosis,
  execToolbarCopy.chipSections.status,
  execToolbarCopy.chipSections.account,
];

interface ActivityViewState {
  pinnedChipIds: string[];
  pageSize: 10 | 25 | 50;
}
const DEFAULT_ACTIVITY_VIEW: ActivityViewState = { pinnedChipIds: [], pageSize: 10 };

export function UnifiedActivityPanel({
  items,
  counts,
  enabledWorkerIds,
  title = "Activity",
  viewQueueHref = "/dashboard/queue",
  viewRunsHref = "/dashboard/runs",
}: {
  items: UnifiedActivityItem[];
  counts: UnifiedActivityCounts;
  enabledWorkerIds: WorkerId[];
  title?: string;
  viewQueueHref?: string;
  viewRunsHref?: string;
}) {
  const router = useRouter();
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const { busyId, errorId, errorText, decide, resolveSweepNoShow, dismissSyncSetup, dismissRunFailure } =
    useQueueItemActions((id) => setResolvedIds((prev) => new Set(prev).add(id)));
  const { busyKey: cancellingRunId, run: runQuickAction } = useQuickActions();

  // ── Rail: Worker / Category (see the rail's own JSX comment for why
  // there's no client dimension — this workspace has exactly one client). ──
  const [groupingMode, setGroupingModeRaw] = useState<RailGroupingMode>("worker");
  const [expandedWorkerId, setExpandedWorkerId] = useState<WorkerId | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState<WorkerId | null>(null);
  const [selectedSkillName, setSelectedSkillName] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<WorkerCategory | null>(null);
  const [railSearch, setRailSearch] = useState("");

  function setGroupingMode(mode: RailGroupingMode) {
    setGroupingModeRaw(mode);
    setSelectedWorkerId(null);
    setSelectedSkillName(null);
    setSelectedCategory(null);
    setExpandedWorkerId(null);
  }

  function clearRailSelection() {
    setSelectedWorkerId(null);
    setSelectedSkillName(null);
    setSelectedCategory(null);
  }

  function toggleWorkerRow(workerId: WorkerId) {
    const alreadyActive = selectedWorkerId === workerId && !selectedSkillName;
    if (alreadyActive) {
      clearRailSelection();
      setExpandedWorkerId(null);
      return;
    }
    setSelectedWorkerId(workerId);
    setSelectedSkillName(null);
    // Only ever expand a worker that actually has sub-skills nested under
    // it (SKILLS_BY_WORKER's length > 1) — most workers don't (see
    // worker-skill-hierarchy.ts), and a chevron that reveals a single row
    // identical to the one just clicked is dead weight, not a feature.
    setExpandedWorkerId(SKILLS_BY_WORKER[workerId].length > 1 ? workerId : null);
  }

  function selectSkill(workerId: WorkerId, skillName: string) {
    setSelectedWorkerId(workerId);
    setSelectedSkillName(skillName);
  }

  function toggleCategory(category: WorkerCategory) {
    setSelectedCategory((prev) => (prev === category ? null : category));
  }

  // Per-skillName counts — a finer breakdown than counts.byWorker/
  // byCategory (both computed once in unified-activity.ts's merge step)
  // needs, so it's kept local to this rail rather than growing the shared
  // data-layer type for a UI-only concern.
  const skillCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      if (!item.skillName) continue;
      map.set(item.skillName, (map.get(item.skillName) ?? 0) + 1);
    }
    return map;
  }, [items]);

  const filteredEnabledWorkers = useMemo(() => {
    if (!railSearch.trim()) return enabledWorkerIds;
    const q = railSearch.trim().toLowerCase();
    return enabledWorkerIds.filter((id) => WORKER_REGISTRY[id].name.toLowerCase().includes(q));
  }, [enabledWorkerIds, railSearch]);

  const categoriesWithActivity = useMemo(() => {
    return WORKER_CATEGORY_LIST.filter((c) => counts.byCategory[c] > 0);
  }, [counts.byCategory]);

  const filteredCategories = useMemo(() => {
    if (!railSearch.trim()) return categoriesWithActivity;
    const q = railSearch.trim().toLowerCase();
    return categoriesWithActivity.filter((c) => c.toLowerCase().includes(q));
  }, [categoriesWithActivity, railSearch]);

  // ── Toolbar: status tabs, search, time range, customizer/chips (all
  // reused from queue-panel.tsx / live-execution-feed.tsx's own toolbar
  // components, not reinvented). ──
  const [tab, setTab] = useState<ActivityTab>("all");
  const [search, setSearch] = useState("");
  const [timeRange, setTimeRange] = useState<TimeRangeValue>("all");
  const [activeChipIds, setActiveChipIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [savedView, setSavedView] = useLocalViewState<ActivityViewState>("mcs:unified-activity:view", DEFAULT_ACTIVITY_VIEW);
  const pinnedChipIds = new Set(savedView.pinnedChipIds);
  const pageSize = savedView.pageSize ?? 10;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailWidth, setDetailWidth] = useState(readStoredDetailWidth);
  const [railWidth, setRailWidth] = useState(readStoredRailWidth);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [triggerErrorId, setTriggerErrorId] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches);

  const containerRef = useRef<HTMLDivElement>(null);
  const draggingDetailRef = useRef(false);
  const draggingRailRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  async function runRepairTrigger(item: NonNullable<UnifiedActivityItem["queueItem"]>, engagementId: string, skillName: string) {
    setTriggeringId(item.id);
    setTriggerErrorId(null);
    const result = await triggerSkillRun(engagementId, skillName);
    setTriggeringId(null);
    if (!result.ok) setTriggerErrorId(item.id);
  }

  const railFiltered = useMemo(() => {
    return items.filter((item) => {
      if (groupingMode === "worker") {
        if (selectedSkillName) return item.skillName === selectedSkillName;
        if (selectedWorkerId) return item.workerId === selectedWorkerId;
      } else if (groupingMode === "category" && selectedCategory) {
        return item.category === selectedCategory;
      }
      return true;
    });
  }, [items, groupingMode, selectedWorkerId, selectedSkillName, selectedCategory]);

  const tabCounts = useMemo(() => {
    const c: Record<ActivityTab, number> = { all: railFiltered.length, needs_action: 0, running: 0, completed: 0, other: 0 };
    for (const item of railFiltered) c[item.status]++;
    return c;
  }, [railFiltered]);

  const tabFiltered = useMemo(() => {
    if (tab === "all") return railFiltered;
    return railFiltered.filter((i) => i.status === tab);
  }, [railFiltered, tab]);

  const rangeFiltered = useMemo(() => {
    if (timeRange === "all") return tabFiltered;
    const bounds = computeTimeRangeBounds(timeRange);
    return tabFiltered.filter((i) => isWithinTimeRange(i.timestamp, bounds));
  }, [tabFiltered, timeRange]);

  const searchFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rangeFiltered;
    return rangeFiltered.filter((i) => `${i.title} ${i.subtitle} ${i.buyer ?? ""}`.toLowerCase().includes(q));
  }, [rangeFiltered, search]);

  const chipCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const def of ACTIVITY_CHIP_DEFS) map.set(def.id, searchFiltered.filter(def.predicate).length);
    return map;
  }, [searchFiltered]);

  const visibleItems = useMemo(() => {
    if (activeChipIds.size === 0) return searchFiltered.filter((item) => !item.queueItem || !resolvedIds.has(item.queueItem.id));
    const activeDefs = ACTIVITY_CHIP_DEFS.filter((d) => activeChipIds.has(d.id));
    const groups = new Map<string, ActivityChipDef[]>();
    for (const def of activeDefs) groups.set(def.group, [...(groups.get(def.group) ?? []), def]);
    return searchFiltered.filter((item) => {
      if (item.queueItem && resolvedIds.has(item.queueItem.id)) return false;
      for (const defs of groups.values()) {
        if (!defs.some((d) => d.predicate(item))) return false;
      }
      return true;
    });
  }, [searchFiltered, activeChipIds, resolvedIds]);

  const pageCount = Math.max(1, Math.ceil(visibleItems.length / pageSize));
  const clampedPage = Math.min(page, pageCount - 1);
  const pagedItems = visibleItems.slice(clampedPage * pageSize, clampedPage * pageSize + pageSize);

  // Derived, not synced via effect: an item that scrolls out of the
  // current filter just stops being "selected" for rendering purposes.
  const selectedItem = useMemo(() => visibleItems.find((i) => i.id === selectedId) ?? null, [visibleItems, selectedId]);

  const openItem = useCallback(
    (item: UnifiedActivityItem) => {
      if (isDesktop) {
        setSelectedId(item.id);
      } else {
        router.push(item.href);
      }
    },
    [router, isDesktop]
  );

  const handleDetailWidthChange = useCallback((w: number) => {
    setDetailWidth(w);
    try {
      window.localStorage.setItem(DETAIL_WIDTH_KEY, String(w));
    } catch {
      // Best-effort persistence.
    }
  }, []);

  const handleRailWidthChange = useCallback((w: number) => {
    setRailWidth(w);
    try {
      window.localStorage.setItem(RAIL_WIDTH_KEY, String(w));
    } catch {
      // Best-effort persistence.
    }
  }, []);

  const onDetailDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingDetailRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const onRailDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRailRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!containerRef.current) return;
      if (draggingDetailRef.current) {
        const right = containerRef.current.getBoundingClientRect().right;
        handleDetailWidthChange(Math.min(MAX_DETAIL_WIDTH, Math.max(MIN_DETAIL_WIDTH, right - e.clientX)));
      }
      if (draggingRailRef.current) {
        const left = containerRef.current.getBoundingClientRect().left;
        handleRailWidthChange(Math.min(MAX_RAIL_WIDTH, Math.max(MIN_RAIL_WIDTH, e.clientX - left)));
      }
    }
    function onUp() {
      draggingDetailRef.current = false;
      draggingRailRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [handleDetailWidthChange, handleRailWidthChange]);

  function toggleActiveChip(id: string) {
    setActiveChipIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPage(0);
  }

  function togglePinnedChip(id: string) {
    setSavedView((prev) => ({
      ...prev,
      pinnedChipIds: prev.pinnedChipIds.includes(id) ? prev.pinnedChipIds.filter((c) => c !== id) : [...prev.pinnedChipIds, id],
    }));
  }

  const tabOptions: SegmentedTabOption<ActivityTab>[] = [
    { key: "all", label: execToolbarCopy.tabs.all, count: tabCounts.all },
    { key: "needs_action", label: execToolbarCopy.tabs.needs_attention, count: tabCounts.needs_action },
    { key: "running", label: execToolbarCopy.tabs.running, count: tabCounts.running },
    { key: "completed", label: execToolbarCopy.tabs.completed, count: tabCounts.completed },
  ];

  const customizerSections: CustomizerSection[] = ACTIVITY_CHIP_SECTION_ORDER.map((sectionLabel) => ({
    label: sectionLabel,
    options: ACTIVITY_CHIP_DEFS.filter((d) => d.section === sectionLabel).map((d) => ({
      id: d.id,
      label: d.label,
      count: chipCounts.get(d.id) ?? 0,
    })),
  })).filter((s) => s.options.length > 0);

  const pinnedChips = ACTIVITY_CHIP_DEFS.filter((d) => pinnedChipIds.has(d.id)).map((d) => ({
    id: d.id,
    label: d.label,
    count: chipCounts.get(d.id) ?? 0,
  }));

  return (
    <div className="space-y-3 w-full font-sans antialiased text-zinc-800 dark:text-zinc-300 select-none">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100">{title}</h2>
        <div className="flex items-center gap-3 text-xs font-mono">
          <Link href={viewQueueHref} className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
            Full Queue
          </Link>
          <Link href={viewRunsHref} className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
            All Runs
          </Link>
        </div>
      </div>

      <div ref={containerRef} className="surface-glass-2 rounded-2xl overflow-visible flex flex-col md:flex-row min-h-[420px] w-full">
        {/* LEFT RAIL — By Worker / By Category. No client dimension: this
            workspace has exactly one client (see EngagementActionsMenu's
            own "one-workspace-one-client" comment) so there's nothing an
            "All vs. Clients" switch would ever toggle between. Same
            chrome as queue-panel.tsx's rail (bg, borders, radii) — this
            is meant to read as the same surface, not a different design. */}
        <div
          className="w-full border-b md:border-b-0 md:border-r border-zinc-200/80 dark:border-sidebar-border bg-[#f8f7fa] dark:bg-sidebar p-3 flex flex-col shrink-0 relative space-y-3 rounded-t-2xl md:rounded-tr-none md:rounded-l-2xl"
          style={{ width: isDesktop ? railWidth : undefined }}
        >
          {/* Drag handle — right edge only, desktop only (nothing to drag
              on a touch layout, which stacks the rail full-width anyway). */}
          <div
            onMouseDown={onRailDragStart}
            className="hidden md:block absolute right-0 top-0 bottom-0 w-1.5 -mr-0.5 cursor-col-resize z-20 hover:bg-zinc-400/40 dark:hover:bg-zinc-600/40 transition-colors"
            title="Drag to resize"
          />

          {/* SCOPE CARD */}
          <div className="flex items-center justify-between px-3 py-2.5 surface-glass-1 rounded-xl text-xs font-semibold text-zinc-900 dark:text-zinc-100">
            <span>{title}</span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-700/80 text-zinc-700 dark:text-zinc-200 font-bold tabular-nums">
              {counts.total}
            </span>
          </div>

          {/* WORKER / CATEGORY TOGGLE — same visual language as
              queue-panel's All/Clients switch. */}
          <div role="tablist" className="grid grid-cols-2 p-1 rounded-xl bg-zinc-200/60 dark:bg-zinc-900 border border-zinc-300/60 dark:border-zinc-800 text-xs font-medium">
            <button
              type="button"
              role="tab"
              aria-selected={groupingMode === "worker"}
              onClick={() => setGroupingMode("worker")}
              className={cn(
                "py-1.5 rounded-lg text-center transition-all cursor-pointer",
                groupingMode === "worker"
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white font-semibold shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              )}
            >
              By Worker
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={groupingMode === "category"}
              onClick={() => setGroupingMode("category")}
              className={cn(
                "py-1.5 rounded-lg text-center transition-all cursor-pointer",
                groupingMode === "category"
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white font-semibold shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              )}
            >
              By Category
            </button>
          </div>

          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10.5px] font-bold text-zinc-500 dark:text-zinc-300 uppercase tracking-wider">
                {groupingMode === "worker" ? "Workers" : "Categories"}
              </span>
            </div>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
              <input
                type="text"
                value={railSearch}
                onChange={(e) => setRailSearch(e.target.value)}
                placeholder={groupingMode === "worker" ? "Search workers..." : "Search categories..."}
                className="w-full pl-7 pr-2.5 py-1.5 text-xs bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-700"
              />
            </div>
          </div>

          {/* SUB-LIST ITEMS */}
          <div className="overflow-y-auto space-y-0.5 pt-1 flex-1 [scrollbar-width:none]">
            <button
              type="button"
              onClick={clearRailSelection}
              className={cn(
                "w-full flex items-center justify-between px-2.5 py-2 rounded-[10px] text-xs font-medium transition-colors cursor-pointer",
                !selectedWorkerId && !selectedCategory
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white font-semibold shadow-xs"
                  : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-white"
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Layers size={14} className={!selectedWorkerId && !selectedCategory ? "text-zinc-900 dark:text-white shrink-0" : "text-zinc-400 shrink-0"} />
                <span className="truncate">Every item</span>
              </div>
              <span className={cn("text-[11px] font-mono tabular-nums font-bold", !selectedWorkerId && !selectedCategory ? "text-zinc-900 dark:text-white" : "text-zinc-400")}>
                {counts.total}
              </span>
            </button>

            {groupingMode === "worker" ? (
              filteredEnabledWorkers.length === 0 ? (
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500 italic px-2.5 py-2">No workers installed for this client yet.</p>
              ) : (
                filteredEnabledWorkers.map((workerId) => {
                  const worker = WORKER_REGISTRY[workerId];
                  const isSelected = selectedWorkerId === workerId && !selectedSkillName;
                  const isExpanded = expandedWorkerId === workerId;
                  const subSkills = SKILLS_BY_WORKER[workerId];
                  const canExpand = subSkills.length > 1;
                  return (
                    <div key={workerId}>
                      <button
                        type="button"
                        onClick={() => toggleWorkerRow(workerId)}
                        className={cn(
                          "w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-[10px] text-xs font-medium transition-colors cursor-pointer",
                          isSelected
                            ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white font-semibold shadow-xs"
                            : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-white"
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <AnySkillBadge skill={workerId} size={18} />
                          <span className="truncate">{worker.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={cn("text-[11px] font-mono tabular-nums font-bold", isSelected ? "text-zinc-900 dark:text-white" : "text-zinc-400")}>
                            {counts.byWorker[workerId]}
                          </span>
                          {canExpand && (
                            <ChevronDown size={13} className={cn("text-zinc-400 transition-transform", isExpanded && "rotate-180")} />
                          )}
                        </div>
                      </button>

                      {/* Expand-in-place, accordion-style — same
                          mechanics as win-back-cadence-preview.tsx's
                          recovery-cadence rows (a plain conditional
                          render + Tailwind's animate-in utilities, no
                          height/max-height animation). */}
                      {isExpanded && (
                        <div className="pl-3 space-y-0.5 pt-0.5 pb-1 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-150">
                          {subSkills.map((skillName) => {
                            const skillSelected = selectedSkillName === skillName;
                            return (
                              <button
                                key={skillName}
                                type="button"
                                onClick={() => selectSkill(workerId, skillName)}
                                className={cn(
                                  "w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[10px] text-[11.5px] font-medium transition-colors cursor-pointer",
                                  skillSelected
                                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white font-semibold shadow-xs"
                                    : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-white"
                                )}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <ChevronRight size={11} className="text-zinc-400 shrink-0" />
                                  <span className="truncate">{anySkillDisplayName(skillName)}</span>
                                </div>
                                <span className={cn("text-[10.5px] font-mono tabular-nums font-bold shrink-0", skillSelected ? "text-zinc-900 dark:text-white" : "text-zinc-400")}>
                                  {skillCounts.get(skillName) ?? 0}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )
            ) : filteredCategories.length === 0 ? (
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 italic px-2.5 py-2">Nothing to categorize yet.</p>
            ) : (
              filteredCategories.map((category) => {
                const active = selectedCategory === category;
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => toggleCategory(category)}
                    className={cn(
                      "w-full flex items-center justify-between px-2.5 py-2 rounded-[10px] text-xs font-medium transition-colors cursor-pointer",
                      active
                        ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white font-semibold shadow-xs"
                        : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-white"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Layers size={14} className={active ? "text-zinc-900 dark:text-white shrink-0" : "text-zinc-400 shrink-0"} />
                      <span className="truncate">{category}</span>
                    </div>
                    <span className={cn("text-[11px] font-mono tabular-nums font-bold", active ? "text-zinc-900 dark:text-white" : "text-zinc-400")}>
                      {counts.byCategory[category]}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* MIDDLE — toolbar + the unified, filtered, paginated list. */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex flex-wrap items-center gap-2 p-3 border-b border-zinc-200/80 dark:border-sidebar-border">
            <SegmentedTabs options={tabOptions} value={tab} onChange={(k) => { setTab(k); setPage(0); }} />
            <TableSearchInput value={search} onChange={(v) => { setSearch(v); setPage(0); }} placeholder={execToolbarCopy.searchPlaceholder} className="w-full sm:w-56" />
            <TimeRangeMenu value={timeRange} onChange={(v) => { setTimeRange(v); setPage(0); }} />
            <ViewCustomizer sections={customizerSections} enabledIds={pinnedChipIds} onToggle={togglePinnedChip} menuTitle={sharedToolbarCopy.filtersSectionLabel} />
            <FilterChipBar chips={pinnedChips} activeIds={activeChipIds} onToggle={toggleActiveChip} />
          </div>

          <div className="flex-1 min-w-0 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-900 max-h-[560px]">
            {pagedItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500 dark:text-zinc-500 italic">
                {items.length === 0 ? "Nothing to show yet." : sharedToolbarCopy.noResultsTitle}
              </div>
            ) : (
              pagedItems.map((item) => {
                const isBusy = busyId === item.queueItem?.id;
                const isTriggering = triggeringId === item.id;
                const isCancelling = cancellingRunId === `cancel-${item.runId}`;
                const repair = item.queueItem ? getRepairAction(item.queueItem) : null;

                return (
                  <div
                    key={item.id}
                    className={cn(
                      "group px-4 py-3 space-y-1.5 transition-colors cursor-pointer",
                      selectedId === item.id ? "bg-zinc-100/80 dark:bg-zinc-900/60" : "hover:bg-zinc-50 dark:hover:bg-zinc-900/30"
                    )}
                    onClick={() => openItem(item)}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className={cn("mt-1.5 w-1.5 h-1.5 rounded-full shrink-0", STATUS_DOT[item.status])} />
                      {item.skillName && <AnySkillBadge skill={item.skillName} size={18} />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">{item.title}</p>
                          {item.buyer && <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 truncate">· {item.buyer}</span>}
                        </div>
                        {item.subtitle && <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{item.subtitle}</p>}
                      </div>
                      <VerboseTime isoString={item.timestamp} showFreshIndicator={false} className="text-[11px] shrink-0 whitespace-nowrap text-zinc-400 dark:text-zinc-500" />
                    </div>

                    {item.status === "needs_action" && (
                      <div className="flex items-center gap-1.5 flex-wrap pl-6" onClick={(e) => e.stopPropagation()}>
                        {item.queueItem ? (
                          <QueueItemQuickActions
                            item={item.queueItem}
                            repair={repair}
                            isBusy={isBusy}
                            isTriggering={isTriggering}
                            triggerErrorId={triggerErrorId}
                            errorId={errorId}
                            errorText={errorText}
                            decide={decide}
                            resolveSweepNoShow={resolveSweepNoShow}
                            dismissSyncSetup={dismissSyncSetup}
                            dismissRunFailure={dismissRunFailure}
                            onRunRepairTrigger={runRepairTrigger}
                          />
                        ) : (
                          <Link href={item.href} className={btnGhost}>
                            <ArrowUpRight size={11} /> View run
                          </Link>
                        )}
                      </div>
                    )}

                    {item.status === "running" && item.runId && (
                      <div className="pl-6" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          disabled={isCancelling}
                          onClick={() =>
                            runQuickAction(`cancel-${item.runId}`, () => cancelSkillRun(item.runId as string), () => {
                              /* list re-fetches on next server nav; nothing to do client-side for a one-shot dashboard tile */
                            })
                          }
                          className={btnGhost}
                        >
                          {isCancelling ? <Loader2 size={11} className="animate-spin" /> : <Ban size={11} />} Cancel run
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* PAGINATION — same shape as queue-panel.tsx's own. */}
          {visibleItems.length > 0 && (
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-zinc-200/80 dark:border-sidebar-border text-xs">
              <div className="flex items-center gap-1.5">
                {([10, 25, 50] as const).map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => { setSavedView((prev) => ({ ...prev, pageSize: size })); setPage(0); }}
                    className={cn(
                      "px-2 py-1 rounded-md font-mono transition-colors cursor-pointer",
                      pageSize === size
                        ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold"
                        : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    )}
                  >
                    {sharedToolbarCopy.pageSizeLabel(size)}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                <button
                  type="button"
                  disabled={clampedPage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="px-2 py-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  Prev
                </button>
                <span className="font-mono tabular-nums">{clampedPage + 1} / {pageCount}</span>
                <button
                  type="button"
                  disabled={clampedPage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  className="px-2 py-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — detail panel. Real flex sibling, opens/closes by width
            (0 when closed), same mechanics as right-utility-panel.tsx. */}
        <div
          className="hidden md:flex relative shrink-0 flex-col border-l border-zinc-200/80 dark:border-zinc-800/80 overflow-hidden transition-[width,opacity] duration-150 ease-out"
          style={{ width: selectedItem ? detailWidth : 0, opacity: selectedItem ? 1 : 0 }}
          aria-hidden={!selectedItem}
        >
          {selectedItem && (
            <>
              <div
                onMouseDown={onDetailDragStart}
                className="absolute left-0 top-0 bottom-0 w-1.5 -ml-0.5 cursor-col-resize z-20 hover:bg-zinc-400/40 dark:hover:bg-zinc-600/40 transition-colors"
                title="Drag to resize"
              />
              <div className="flex items-center justify-between px-3 h-11 border-b border-zinc-200/80 dark:border-zinc-800/80 shrink-0">
                <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">Details</span>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="flex items-center justify-center w-7 h-7 rounded-md text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
                  aria-label="Close detail panel"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-4 text-xs">
                {selectedItem.queueItem ? (
                  <div className="space-y-4">
                    <QueueItemPreview item={selectedItem.queueItem} />
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <QueueItemQuickActions
                        item={selectedItem.queueItem}
                        repair={selectedItem.queueItem ? getRepairAction(selectedItem.queueItem) : null}
                        isBusy={busyId === selectedItem.queueItem.id}
                        isTriggering={triggeringId === selectedItem.id}
                        triggerErrorId={triggerErrorId}
                        errorId={errorId}
                        errorText={errorText}
                        decide={decide}
                        resolveSweepNoShow={resolveSweepNoShow}
                        dismissSyncSetup={dismissSyncSetup}
                        dismissRunFailure={dismissRunFailure}
                        onRunRepairTrigger={runRepairTrigger}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      {selectedItem.skillName && <AnySkillBadge skill={selectedItem.skillName} size={22} />}
                      <div className="min-w-0">
                        <p className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">{selectedItem.title}</p>
                        {selectedItem.buyer && <p className="text-zinc-500 dark:text-zinc-400 truncate">{selectedItem.buyer}</p>}
                      </div>
                    </div>
                    {selectedItem.run?.subjectLabel && (
                      <p className="text-zinc-600 dark:text-zinc-300 whitespace-pre-line">{selectedItem.run.subjectLabel}</p>
                    )}
                    {selectedItem.run?.errorMessage && (
                      <p className="text-rose-600 dark:text-rose-400 font-mono whitespace-pre-line">{selectedItem.run.errorMessage}</p>
                    )}
                    <VerboseTime isoString={selectedItem.timestamp} className="text-zinc-400 dark:text-zinc-500" />
                    <Link
                      href={selectedItem.href}
                      className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
                    >
                      View full run <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The same branch-per-category/source action set overview-stats-panel.tsx
 * already established for a "second surface" reusing Queue's real
 * mutations (useQueueItemActions/getRepairAction) instead of just linking
 * away — kept as its own component here since it's now rendered from two
 * places in this file (inline in the row, and again in the detail panel).
 */
function QueueItemQuickActions({
  item,
  repair,
  isBusy,
  isTriggering,
  triggerErrorId,
  errorId,
  errorText,
  decide,
  resolveSweepNoShow,
  dismissSyncSetup,
  dismissRunFailure,
  onRunRepairTrigger,
}: {
  item: NonNullable<UnifiedActivityItem["queueItem"]>;
  repair: ReturnType<typeof getRepairAction>;
  isBusy: boolean;
  isTriggering: boolean;
  triggerErrorId: string | null;
  errorId: string | null;
  errorText: string;
  decide: ReturnType<typeof useQueueItemActions>["decide"];
  resolveSweepNoShow: ReturnType<typeof useQueueItemActions>["resolveSweepNoShow"];
  dismissSyncSetup: ReturnType<typeof useQueueItemActions>["dismissSyncSetup"];
  dismissRunFailure: ReturnType<typeof useQueueItemActions>["dismissRunFailure"];
  onRunRepairTrigger: (item: NonNullable<UnifiedActivityItem["queueItem"]>, engagementId: string, skillName: string) => void;
}) {
  const itemHref = item.fixHref ?? (item.engagementId ? `/dashboard/engagements/${item.engagementId}` : "/dashboard/queue");

  return (
    <>
      {item.category === "approve" && item.sweepNoShowReview ? (
        <>
          <button type="button" disabled={isBusy} onClick={() => decide(item, "approved")} className={`${btnBase} bg-rose-600 dark:bg-rose-500 text-white hover:bg-rose-700 dark:hover:bg-rose-400`} title="Confirm no-show and start Win-Back recovery">
            <UserX size={11} /> Confirm no-show
          </button>
          <button type="button" disabled={isBusy} onClick={() => resolveSweepNoShow(item, "showed")} className={`${btnBase} bg-emerald-600 dark:bg-emerald-500 text-white dark:text-zinc-950 hover:bg-emerald-700 dark:hover:bg-emerald-400`} title="Log that they actually showed — no Win-Back">
            <UserCheck size={11} /> Showed
          </button>
          <button type="button" disabled={isBusy} onClick={() => resolveSweepNoShow(item, "rescheduled")} className={`${btnBase} bg-amber-500 text-zinc-950 hover:bg-amber-400`} title="Log that they rescheduled — no Win-Back">
            <CalendarClock size={11} /> Rescheduled
          </button>
          <button type="button" disabled={isBusy} onClick={() => decide(item, "rejected")} className="text-[10.5px] font-medium text-zinc-500 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 underline cursor-pointer disabled:opacity-60">
            Not sure — dismiss
          </button>
        </>
      ) : item.category === "approve" ? (
        <>
          <button type="button" disabled={isBusy} onClick={() => decide(item, "approved")} className={`${btnBase} bg-emerald-600 dark:bg-emerald-500 text-white dark:text-zinc-950 hover:bg-emerald-700 dark:hover:bg-emerald-400`}>
            <Check size={11} /> {queueCopy.actions.approve}
          </button>
          <button type="button" disabled={isBusy} onClick={() => decide(item, "rejected")} className={btnGhost}>
            <X size={11} /> {queueCopy.actions.reject}
          </button>
        </>
      ) : item.category === "action_needed" && item.source === "sync_setup" ? (
        <>
          {(repair?.kind === "link" ? repair.href : itemHref) && (
            <Link href={repair?.kind === "link" ? repair.href : itemHref} className={`${btnBase} bg-amber-400 text-white dark:text-zinc-950 hover:bg-amber-500`}>
              <ArrowUpRight size={11} /> {repair?.label ?? "Review"}
            </Link>
          )}
          <button type="button" disabled={isBusy} onClick={() => dismissSyncSetup(item)} className={btnGhost}>
            <X size={11} /> Not now
          </button>
        </>
      ) : item.category === "action_needed" && item.source === "run_failure" ? (
        <>
          {repair?.kind === "trigger" ? (
            <button type="button" disabled={isBusy || isTriggering} onClick={() => onRunRepairTrigger(item, repair.engagementId, repair.skillName)} className={`${btnBase} bg-amber-400 text-white dark:text-zinc-950 hover:bg-amber-500`}>
              <RotateCcw size={11} /> {isTriggering ? "Running…" : repair.label}
            </button>
          ) : (repair?.kind === "link" ? repair.href : itemHref) ? (
            <Link href={repair?.kind === "link" ? repair.href : itemHref} className={`${btnBase} bg-amber-400 text-white dark:text-zinc-950 hover:bg-amber-500`}>
              <ArrowUpRight size={11} /> {repair?.label ?? "Fix now"}
            </Link>
          ) : null}
          <button type="button" disabled={isBusy} onClick={() => dismissRunFailure(item)} className={btnGhost}>
            <X size={11} /> Not now
          </button>
          {triggerErrorId === item.id && (
            <p className="w-full text-[10.5px] text-rose-600 dark:text-rose-400 font-mono">Couldn&apos;t start the run — try again from the Queue.</p>
          )}
        </>
      ) : item.category === "action_needed" ? (
        <>
          <button type="button" disabled={isBusy} onClick={() => decide(item, "resolved")} className={`${btnBase} bg-emerald-600 dark:bg-emerald-500 text-white dark:text-zinc-950 hover:bg-emerald-700 dark:hover:bg-emerald-400`}>
            <Check size={11} /> {queueCopy.actions.resolve}
          </button>
          <button type="button" disabled={isBusy} onClick={() => decide(item, "abandoned")} className={btnGhost}>
            <X size={11} /> {queueCopy.actions.dismiss}
          </button>
        </>
      ) : (
        <button type="button" disabled={isBusy} onClick={() => decide(item, "rejected")} className={btnGhost}>
          <X size={11} /> {queueCopy.actions.dismiss}
        </button>
      )}

      {errorId === item.id && errorText && <p className="w-full text-[10.5px] text-rose-600 dark:text-rose-400 font-mono">{errorText}</p>}
    </>
  );
}
