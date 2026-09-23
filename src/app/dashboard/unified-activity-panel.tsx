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
  GripVertical,
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
import { PRODUCT_IDS, PRODUCT_SKILL_IDS, type ProductId } from "@/lib/product-catalog";
import { WORKER_REGISTRY, WORKER_CATEGORY_LIST, workersForProduct, type WorkerId, type WorkerCategory, type WorkerDefinition } from "@/lib/worker-registry";
import type { WorkerReportBlock } from "@/lib/worker-report-blocks";
import {
  QUEUE_COPY as queueCopy,
  QUEUE_TOOLBAR_COPY as queueToolbarCopy,
  EXECUTIONS_TOOLBAR_COPY as execToolbarCopy,
  TABLE_TOOLBAR_COPY as sharedToolbarCopy,
  WORKSPACE_PRODUCTS,
} from "@/lib/copy";
import type { ClientOption } from "./queue-panel";
import { SegmentedTabs, type SegmentedTabOption } from "@/components/segmented-tabs";
import { TableSearchInput } from "@/components/table-search-input";
import { TimeRangeMenu, computeTimeRangeBounds, isWithinTimeRange, type TimeRangeValue } from "@/components/time-range-menu";
import { ViewCustomizer, FilterChipBar, type CustomizerSection } from "@/components/view-customizer";
import { useLocalViewState } from "@/lib/use-local-view-state";
import { cn } from "@/lib/utils";
import type { UnifiedActivityItem, UnifiedActivityCounts, UnifiedActivityStatus } from "@/lib/unified-activity";

type ActivityTab = "all" | UnifiedActivityStatus;
type RailGroupingMode = "worker" | "category";

const PRODUCT_LABELS: Record<ProductId, string> = {
  showtime: "Showtime",
  "reputation-manager": "Reputation Manager",
  "cold-open": "Cold Open",
  "whop-agent": "Whop Agent",
};

// Same real logo artwork the Library's ProductCard uses (WORKSPACE_PRODUCTS,
// copy.ts) — not a generic icon standing in for each product.
const PRODUCT_LOGOS: Record<ProductId, string> = Object.fromEntries(
  WORKSPACE_PRODUCTS.map((p) => [p.id, p.image])
) as Record<ProductId, string>;

// Narrower than queue-panel's own w-64 (256px) rail — this panel's list is
// the point of the page, and a narrower rail leaves it noticeably more
// room without losing the rail's own usability at these widths.
const RAIL_WIDTH_KEY = "mcs-unified-activity-rail-width";
const MIN_RAIL_WIDTH = 180;
const MAX_RAIL_WIDTH = 300;
const DEFAULT_RAIL_WIDTH = 220;

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

const btnBase =
  "hover-lift press-settle inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-60";
const btnGhost =
  "hover-lift press-settle inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-lg border border-amber-200 dark:border-amber-500/30 bg-white dark:bg-transparent text-zinc-700 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-60";

/** 4-bar signal-strength-style severity meter for the rotating banner —
 * more bars filled/colored = more important. Color, not just fill count,
 * carries the top tier (4) so it reads at a glance without counting bars. */
function SeverityBars({ severity }: { severity: 1 | 2 | 3 | 4 }) {
  const filledColor = severity === 4 ? "bg-rose-500 dark:bg-rose-400" : severity === 3 ? "bg-amber-500 dark:bg-amber-400" : "bg-zinc-400 dark:bg-zinc-500";
  return (
    <div className="flex items-end gap-0.5 h-4 shrink-0" title={`Severity ${severity}/4`}>
      {([1, 2, 3, 4] as const).map((n) => (
        <span
          key={n}
          className={cn("w-1 rounded-sm transition-colors", n <= severity ? filledColor : "bg-zinc-200 dark:bg-zinc-800")}
          style={{ height: `${n * 25}%` }}
        />
      ))}
    </div>
  );
}

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
  // Full Queue / All Runs used to render unconditionally in the toolbar's
  // top-right corner, permanently reserving that space. They're now just
  // two more pin-able options in the same "+" customizer as the filter
  // chips — off by default, appearing only once a user opts in, so the
  // table gets that vertical room back for everyone who never uses them.
  pinnedLinkIds: string[];
  pageSize: 10 | 25 | 50;
}
const DEFAULT_ACTIVITY_VIEW: ActivityViewState = { pinnedChipIds: [], pinnedLinkIds: [], pageSize: 10 };

export function UnifiedActivityPanel({
  items,
  counts,
  clients,
  enabledWorkerIds,
  workspaceProductIds = [],
  weeklyReportBlocks = [],
  title = "Activity",
  viewQueueHref = "/dashboard/queue",
  viewRunsHref = "/dashboard/runs",
}: {
  items: UnifiedActivityItem[];
  counts: UnifiedActivityCounts;
  clients: ClientOption[];
  enabledWorkerIds: WorkerId[];
  /** Every product this WORKSPACE actually has access to (Whop package
   * install), not just the ones with an enabled worker today — the "By
   * Worker" rail's own `installedProductIds` below only covers the
   * latter, which is too narrow for the Setup Gaps banner slide: a
   * product a client is entitled to but hasn't turned anything on for
   * yet should still surface a nudge. */
  workspaceProductIds?: ProductId[];
  /** This engagement's own real report numbers for the last 7 days
   * (worker-report-blocks.ts) — the "This Week" banner slide's source,
   * computed server-side once per page load rather than re-derived here. */
  weeklyReportBlocks?: WorkerReportBlock[];
  title?: string;
  viewQueueHref?: string;
  viewRunsHref?: string;
}) {
  const router = useRouter();
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const { busyIds, errors, decide, resolveSweepNoShow, dismissSyncSetup, dismissRunFailure } =
    useQueueItemActions((id) => setResolvedIds((prev) => new Set(prev).add(id)));
  const { busyKey: cancellingRunId, run: runQuickAction } = useQuickActions();

  // ── Rotating "needs attention" banner — a stadium-ad-board style ticker
  // above the rail/table, cycling through pinned + needs_action items.
  // Double-rendered on purpose: these items still appear in the table
  // below exactly as before. This is the one surface a busy week of runs
  // can never push out, since it isn't sorted/paginated with everything
  // else — it always shows the highest-severity, most-recent thing that
  // needs a look, regardless of how much other activity happened. ──
  const bannerQueueCandidates = useMemo(() => {
    // kind === "queue" only — a bare failed/timed-out run (no matching
    // queue item) also carries status "needs_action" and would otherwise
    // qualify here too, which is exactly what made this read as "just
    // showing live executions" instead of "the needs attention and queue
    // stuff" it's meant to be. A run failure that's serious enough to
    // page someone already becomes its own run_failure queue item (see
    // queue.ts) and shows up here through that, same as any other queue
    // item — this isn't losing real failures, just not double-counting
    // every transient one that never rose to that bar.
    return items
      .filter((i) => i.kind === "queue" && (i.pinned || i.status === "needs_action"))
      .sort((a, b) => b.severity - a.severity || new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 15);
  }, [items]);

  // "This Week" — up to 3 of this engagement's real report numbers
  // (worker-report-blocks.ts, computed server-side for whichever workers
  // are actually enabled). A block with a null value means no baseline
  // yet this week (e.g. a rate with zero calls) — skipped here rather
  // than shown as a misleading "—", since this is a glanceable ticker,
  // not the full report.
  const bannerThisWeekBlocks = useMemo(() => weeklyReportBlocks.filter((b) => b.value !== null).slice(0, 3), [weeklyReportBlocks]);

  // "Setup Gap" — at most ONE nudge, ever, not a list of every unturned-on
  // worker (a client who only wants 4 of 15 available workers made that
  // choice on purpose; reminding them about the other 11 is spam, not
  // help). Scoped to workspaceProductIds — products this workspace is
  // actually entitled to — not hardcoded to any one product, so a client
  // using only Reputation Manager gets nudged about Reputation Manager
  // gaps, same as a Showtime-only client gets Showtime gaps. Picks the
  // first gap in product/registry order, which is arbitrary but stable —
  // it won't jump between different workers on every render.
  const bannerSetupGap = useMemo(() => {
    const enabledSet = new Set(enabledWorkerIds);
    const candidates = workspaceProductIds.flatMap((productId) =>
      workersForProduct(productId)
        .filter((w) => !enabledSet.has(w.id))
        .map((w) => ({ worker: w, productLabel: PRODUCT_LABELS[productId] }))
    );
    return candidates[0] ?? null;
  }, [workspaceProductIds, enabledWorkerIds]);

  type BannerSlide =
    | { kind: "queue"; item: UnifiedActivityItem }
    | { kind: "this_week"; blocks: WorkerReportBlock[] }
    | { kind: "setup_gap"; worker: WorkerDefinition; productLabel: string };

  const bannerSlides = useMemo<BannerSlide[]>(() => {
    const slides: BannerSlide[] = bannerQueueCandidates.map((item) => ({ kind: "queue", item }));
    if (bannerThisWeekBlocks.length > 0) slides.push({ kind: "this_week", blocks: bannerThisWeekBlocks });
    if (bannerSetupGap) slides.push({ kind: "setup_gap", worker: bannerSetupGap.worker, productLabel: bannerSetupGap.productLabel });
    return slides;
  }, [bannerQueueCandidates, bannerThisWeekBlocks, bannerSetupGap]);

  const [bannerIndex, setBannerIndex] = useState(0);
  useEffect(() => {
    if (bannerSlides.length <= 1) return;
    const interval = setInterval(() => {
      setBannerIndex((i) => (i + 1) % bannerSlides.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [bannerSlides.length]);
  const bannerSlide = bannerSlides[bannerIndex % Math.max(1, bannerSlides.length)] ?? null;

  // ── Rail: Worker / Category (see the rail's own JSX comment for why
  // there's no client dimension — this workspace has exactly one client).
  // "By Worker" is two levels — product (Showtime, Reputation Manager,
  // Cold Open, Whop Agent), expanding to the real installed workers under
  // it (Pin-Down, Win-Back, AI Engine Watch, etc.) — and stops there.
  // Deliberately not three levels: a worker's own chat-only sub-actions
  // (pin-down-voice, rep-twitter-deep-scan, etc.) already count toward
  // their parent worker's total via workerIdForSkill/counts.byWorker, but
  // don't get their own expandable row here — a worker that expands into
  // its own further-expandable sub-items reads as confusing nesting, not
  // extra clarity. ──
  const [groupingMode, setGroupingModeRaw] = useState<RailGroupingMode>("worker");
  const [isGroupingPopoverOpen, setIsGroupingPopoverOpen] = useState(false);
  const [expandedProductId, setExpandedProductId] = useState<ProductId | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<ProductId | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState<WorkerId | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<WorkerCategory | null>(null);
  const [railSearch, setRailSearch] = useState("");

  const groupingModeLabels: Record<RailGroupingMode, string> = { worker: "By Worker", category: "By Category" };

  function setGroupingMode(mode: RailGroupingMode) {
    setGroupingModeRaw(mode);
    clearRailSelection();
    setExpandedProductId(null);
  }

  function clearRailSelection() {
    setSelectedProductId(null);
    setSelectedWorkerId(null);
    setSelectedCategory(null);
  }

  function toggleProductRow(productId: ProductId) {
    const alreadyActive = selectedProductId === productId && !selectedWorkerId;
    if (alreadyActive) {
      clearRailSelection();
      setExpandedProductId(null);
      return;
    }
    setSelectedProductId(productId);
    setSelectedWorkerId(null);
    setExpandedProductId(productId);
  }

  function selectWorker(productId: ProductId, workerId: WorkerId) {
    setSelectedProductId(productId);
    setSelectedWorkerId(workerId);
  }

  function toggleCategory(category: WorkerCategory) {
    setSelectedCategory((prev) => (prev === category ? null : category));
  }

  // Only the products this client actually has workers installed for —
  // same "never a hardcoded catalog" rule enabledWorkerIds itself follows.
  const installedProductIds = useMemo(() => {
    const productIds = new Set(enabledWorkerIds.map((id) => WORKER_REGISTRY[id].productId));
    return PRODUCT_IDS.filter((id) => productIds.has(id));
  }, [enabledWorkerIds]);

  const enabledWorkersByProduct = useMemo(() => {
    const map = new Map<ProductId, WorkerId[]>();
    for (const workerId of enabledWorkerIds) {
      const productId = WORKER_REGISTRY[workerId].productId;
      map.set(productId, [...(map.get(productId) ?? []), workerId]);
    }
    return map;
  }, [enabledWorkerIds]);

  const filteredInstalledProducts = useMemo(() => {
    if (!railSearch.trim()) return installedProductIds;
    const q = railSearch.trim().toLowerCase();
    return installedProductIds.filter(
      (id) => PRODUCT_LABELS[id].toLowerCase().includes(q) || (enabledWorkersByProduct.get(id) ?? []).some((w) => WORKER_REGISTRY[w].name.toLowerCase().includes(q))
    );
  }, [installedProductIds, enabledWorkersByProduct, railSearch]);

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
  // Guarded fallback: existing persisted views from before this field
  // existed won't have it yet.
  const pinnedLinkIds = new Set(savedView.pinnedLinkIds ?? []);
  const pageSize = savedView.pageSize ?? 10;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailWidth, setDetailWidth] = useState(readStoredDetailWidth);
  const [railWidth, setRailWidth] = useState(readStoredRailWidth);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  // Queue items whose "Run again" started a run, so the button says so
  // instead of silently reverting to its idle label.
  const [triggeredIds, setTriggeredIds] = useState<ReadonlySet<string>>(new Set());
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
    else {
      setTriggeredIds((prev) => new Set(prev).add(item.id));
      router.refresh();
    }
  }

  // The list is server-rendered; re-fetch it periodically while the tab is
  // visible so new items, finished runs and cancelled runs show up without
  // a manual reload. router.refresh keeps this panel's own state.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 30_000);
    return () => clearInterval(interval);
  }, [router]);

  const railFiltered = useMemo(() => {
    return items.filter((item) => {
      if (groupingMode === "worker") {
        if (selectedWorkerId) return item.workerId === selectedWorkerId;
        // Matched via workerId, not skillName directly — a chat sub-skill's
        // own skillName (e.g. "pin-down-voice") never appears in
        // PRODUCT_SKILL_IDS (that only lists worker-level ids), but its
        // workerId already resolves to a real worker with a real product.
        if (selectedProductId) return !!item.workerId && WORKER_REGISTRY[item.workerId].productId === selectedProductId;
      } else if (groupingMode === "category" && selectedCategory) {
        return item.category === selectedCategory;
      }
      return true;
    });
  }, [items, groupingMode, selectedProductId, selectedWorkerId, selectedCategory]);

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
    [router, isDesktop, setSelectedId]
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

  function togglePinnedLink(id: string) {
    setSavedView((prev) => ({
      ...prev,
      pinnedLinkIds: prev.pinnedLinkIds?.includes(id) ? prev.pinnedLinkIds.filter((c) => c !== id) : [...(prev.pinnedLinkIds ?? []), id],
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

  // Full Queue / All Runs — plain page links, not filters, so they get
  // their own small "Shortcuts" section in the same "+" popover rather
  // than going through the filter-chip predicate machinery above.
  const ACTIVITY_LINK_DEFS = [
    { id: "full-queue", label: "Full Queue", href: viewQueueHref },
    { id: "all-runs", label: "All Runs", href: viewRunsHref },
  ];
  const customizerSectionsWithLinks: CustomizerSection[] = [
    ...customizerSections,
    { label: "Shortcuts", options: ACTIVITY_LINK_DEFS.map((d) => ({ id: d.id, label: d.label })) },
  ];
  const pinnedOrPinnableIds = new Set([...pinnedChipIds, ...pinnedLinkIds]);
  function toggleCustomizerOption(id: string) {
    if (ACTIVITY_LINK_DEFS.some((d) => d.id === id)) togglePinnedLink(id);
    else togglePinnedChip(id);
  }
  const pinnedLinks = ACTIVITY_LINK_DEFS.filter((d) => pinnedLinkIds.has(d.id));

  return (
    <div className="space-y-2 w-full font-sans antialiased text-zinc-800 dark:text-zinc-300 select-none">
      {/* Full-width client identity bar — the client chip queue-panel.tsx
          renders above its own rail, extended edge-to-edge and doubling as
          a rotating "needs attention" ticker (stadium-ad-board style: one
          item shows, then the next slides in) so pinned/needs_action items
          always have a permanent home a busy week of runs can't push out
          of. This is purely additive — every one of these items still
          renders in the table below exactly as before; nothing is removed
          from there, only also surfaced here. */}
      <div
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2 rounded-md bg-zinc-200/60 dark:bg-zinc-900 border border-zinc-300/60 dark:border-zinc-800 text-xs font-semibold text-zinc-900 dark:text-zinc-100",
          bannerSlide && "cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors"
        )}
        onClick={
          bannerSlide?.kind === "queue"
            ? () => openItem(bannerSlide.item)
            : bannerSlide?.kind === "this_week"
              ? () => router.push("/dashboard/reports")
              : bannerSlide?.kind === "setup_gap" && clients[0]
                ? () => router.push(`/dashboard/engagements/${clients[0].engagementId}`)
                : undefined
        }
      >
        {clients.length === 1 && (
          <Link
            href={`/dashboard/engagements/${clients[0].engagementId}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 shrink-0 hover:underline"
            title="Open client engagement"
          >
            <span className="truncate max-w-[140px]">{clients[0].buyer}</span>
            {clients[0].pausedAt && (
              <span className="shrink-0 text-[10px] font-mono font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                Paused
              </span>
            )}
            <ArrowUpRight className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" />
          </Link>
        )}

        <div className="flex-1 min-w-0 h-5 relative overflow-hidden border-l border-zinc-300/60 dark:border-zinc-800 pl-3">
          {bannerSlide?.kind === "queue" ? (
            <div
              key={bannerSlide.item.id}
              className="absolute inset-0 flex items-center gap-2 min-w-0 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4 motion-safe:duration-500"
            >
              {bannerSlide.item.skillName && <AnySkillBadge skill={bannerSlide.item.skillName} size={16} />}
              <span className="font-bold truncate shrink-0">{bannerSlide.item.title}</span>
              {bannerSlide.item.subtitle && (
                <span className="font-normal text-zinc-500 dark:text-zinc-400 truncate">{bannerSlide.item.subtitle}</span>
              )}
              {bannerSlide.item.pinned && (
                <span className="shrink-0 text-[9px] font-mono font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-sm bg-sky-100 dark:bg-sky-950/50 text-sky-700 dark:text-sky-400">
                  New
                </span>
              )}
            </div>
          ) : bannerSlide?.kind === "this_week" ? (
            <div
              key="this-week"
              className="absolute inset-0 flex items-center gap-2 min-w-0 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4 motion-safe:duration-500"
            >
              <span className="shrink-0 text-[9px] font-mono font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-sm bg-zinc-300/60 dark:bg-zinc-700/60 text-zinc-700 dark:text-zinc-300">
                This Week
              </span>
              <span className="font-normal text-zinc-600 dark:text-zinc-300 truncate">
                {bannerSlide.blocks.map((b) => `${b.label} ${b.displayValue}`).join(" · ")}
              </span>
            </div>
          ) : bannerSlide?.kind === "setup_gap" ? (
            <div
              key={`setup-gap-${bannerSlide.worker.id}`}
              className="absolute inset-0 flex items-center gap-2 min-w-0 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4 motion-safe:duration-500"
            >
              <span className="shrink-0 text-[9px] font-mono font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-sm bg-violet-200/60 dark:bg-violet-950/50 text-violet-700 dark:text-violet-400">
                Setup
              </span>
              <span className="font-bold truncate shrink-0">{bannerSlide.worker.name} isn&apos;t enabled</span>
              <span className="font-normal text-zinc-500 dark:text-zinc-400 truncate">
                {bannerSlide.productLabel} · {bannerSlide.worker.description}
              </span>
              <span className="shrink-0 text-zinc-700 dark:text-zinc-200 font-bold">Enable</span>
            </div>
          ) : (
            <span className="flex items-center h-full text-zinc-400 dark:text-zinc-500 font-normal">Nothing needs attention right now.</span>
          )}
        </div>

        {bannerSlide?.kind === "queue" && <SeverityBars severity={bannerSlide.item.severity} />}
      </div>

      {/* No separate "Recent Activity" title row here — it just duplicated
          the rail's own scope card label right below it. Full Queue/All
          Runs moved into the toolbar row instead of getting a whole row
          of their own. */}
      <div ref={containerRef} className="surface-glass-2 rounded-lg overflow-visible flex flex-col md:flex-row min-h-[420px] w-full">
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

          {/* SCOPE CARD — also the reset control now that "Every item" is
              gone: clicking it clears every rail selection, the same
              "back to the full list" action that row used to be. */}
          <button
            type="button"
            onClick={() => {
              clearRailSelection();
              setExpandedProductId(null);
            }}
            title="Reset filters"
            className="flex items-center justify-between px-3 py-2.5 surface-glass-1 rounded-md text-xs font-semibold text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer"
          >
            <span>{title}</span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-700/80 text-zinc-700 dark:text-zinc-200 font-bold tabular-nums">
              {counts.total}
            </span>
          </button>

          {/* GROUPING MODE SELECTOR — same popover-dropdown component
              queue-panel.tsx's own rail uses for "By CRM/Platform" etc.,
              just with 2 modes instead of 4. */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsGroupingPopoverOpen((p) => !p)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md bg-white dark:bg-zinc-900/80 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-800 text-xs text-zinc-800 dark:text-zinc-200 font-medium transition-colors cursor-pointer shadow-elevation-1"
            >
              <div className="flex items-center gap-2 truncate">
                <GripVertical size={13} className="text-zinc-400 dark:text-zinc-500 shrink-0" />
                <span className="truncate">{groupingModeLabels[groupingMode]}</span>
              </div>
              <ChevronDown size={13} className="text-zinc-400 dark:text-zinc-500 shrink-0" />
            </button>

            {isGroupingPopoverOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setIsGroupingPopoverOpen(false)} />
                <div className="absolute top-full left-0 mt-1 w-full z-40 p-1 surface-glass-3 rounded-md space-y-0.5 text-xs">
                  {(Object.keys(groupingModeLabels) as RailGroupingMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setGroupingMode(mode);
                        setIsGroupingPopoverOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer",
                        groupingMode === mode
                          ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white font-semibold shadow-xs"
                          : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                      )}
                    >
                      <span>{groupingModeLabels[mode]}</span>
                      {groupingMode === mode && <Check size={12} className="text-emerald-600 dark:text-emerald-400" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10.5px] font-bold text-zinc-500 dark:text-zinc-300 uppercase tracking-wider">
                {groupingMode === "worker" ? "United Tools Platform" : "Categories"}
              </span>
            </div>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
              <input
                type="text"
                value={railSearch}
                onChange={(e) => setRailSearch(e.target.value)}
                placeholder={groupingMode === "worker" ? "Search products or workers..." : "Search categories..."}
                className="w-full pl-7 pr-2.5 py-1.5 text-xs bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-700"
              />
            </div>
          </div>

          {/* SUB-LIST ITEMS */}
          <div className="overflow-y-auto space-y-0.5 pt-1 flex-1 [scrollbar-width:none]">
            {/* No "Every item" row — the SCOPE CARD above is the reset
                control now (click it to clear every rail selection). */}
            {groupingMode === "worker" ? (
              filteredInstalledProducts.length === 0 ? (
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500 italic px-2.5 py-2">No products installed for this client yet.</p>
              ) : (
                filteredInstalledProducts.map((productId) => {
                  const isSelected = selectedProductId === productId && !selectedWorkerId;
                  const isExpanded = expandedProductId === productId;
                  const workersForProduct = enabledWorkersByProduct.get(productId) ?? [];
                  return (
                    <div key={productId}>
                      <button
                        type="button"
                        onClick={() => toggleProductRow(productId)}
                        className={cn(
                          "w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-md text-xs font-medium transition-colors cursor-pointer",
                          isSelected
                            ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white font-semibold shadow-xs"
                            : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-white"
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={PRODUCT_LOGOS[productId]} alt="" className="w-[18px] h-[18px] object-contain shrink-0" />
                          <span className="truncate">{PRODUCT_LABELS[productId]}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={cn("text-[11px] font-mono tabular-nums font-bold", isSelected ? "text-zinc-900 dark:text-white" : "text-zinc-400")}>
                            {counts.byProduct[productId]}
                          </span>
                          <ChevronDown size={13} className={cn("text-zinc-400 transition-transform", isExpanded && "rotate-180")} />
                        </div>
                      </button>

                      {/* Expand-in-place, accordion-style — same
                          mechanics as win-back-cadence-preview.tsx's
                          recovery-cadence rows (a plain conditional
                          render + Tailwind's animate-in utilities, no
                          height/max-height animation). Reveals this
                          product's real installed workers (Pin-Down,
                          Win-Back, AI Engine Watch, ...) — one level only,
                          a worker here is a leaf, not itself expandable. */}
                      {isExpanded && (
                        <div className="pl-3 space-y-0.5 pt-0.5 pb-1 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-150">
                          {workersForProduct.map((workerId) => {
                            const workerSelected = selectedWorkerId === workerId;
                            return (
                              <button
                                key={workerId}
                                type="button"
                                onClick={() => selectWorker(productId, workerId)}
                                className={cn(
                                  "w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-[11.5px] font-medium transition-colors cursor-pointer",
                                  workerSelected
                                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white font-semibold shadow-xs"
                                    : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-white"
                                )}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <AnySkillBadge skill={workerId} size={16} />
                                  <span className="truncate">{WORKER_REGISTRY[workerId].name}</span>
                                </div>
                                <span className={cn("text-[10.5px] font-mono tabular-nums font-bold shrink-0", workerSelected ? "text-zinc-900 dark:text-white" : "text-zinc-400")}>
                                  {counts.byWorker[workerId]}
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
                      "w-full flex items-center justify-between px-2.5 py-2 rounded-md text-xs font-medium transition-colors cursor-pointer",
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
            {/* Full Queue / All Runs live in this same "+" menu now, under
                "Shortcuts" — pin one to bring it back into view on the
                right; unpinned (the default) it takes no space at all. */}
            <ViewCustomizer sections={customizerSectionsWithLinks} enabledIds={pinnedOrPinnableIds} onToggle={toggleCustomizerOption} menuTitle={sharedToolbarCopy.filtersSectionLabel} />
            <FilterChipBar chips={pinnedChips} activeIds={activeChipIds} onToggle={toggleActiveChip} />
            {pinnedLinks.length > 0 && (
              <div className="ml-auto flex items-center gap-3 text-xs font-mono">
                {pinnedLinks.map((link) => (
                  <Link key={link.id} href={link.href} className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                    {link.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Content-area background — reverted back to the original
              zinc-100/zinc-900 dim (bg-sidebar in dark mode read as too
              close to the outer shell's own tone once compared side by
              side against the rail). */}
          <div className="flex-1 min-w-0 overflow-y-auto max-h-[560px] bg-zinc-100/60 dark:bg-zinc-900/40 p-3">
            {pagedItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center py-12 text-center text-zinc-500 dark:text-zinc-500 space-y-1">
                <p className="text-sm font-medium">{items.length === 0 ? "Nothing to show yet." : sharedToolbarCopy.noResultsTitle}</p>
                {items.length > 0 && <p className="text-xs font-mono text-zinc-400 dark:text-zinc-600">{sharedToolbarCopy.noResultsSubtitle}</p>}
              </div>
            ) : (
              // The card that actually houses the execution/queue rows —
              // no surface-glass-1 (that class's own ambient radial glow is
              // exactly what got dimmed away earlier). Border reuses the
              // same divider language already used elsewhere in this file
              // (the toolbar's own bottom border, a couple lines up) rather
              // than a stronger, disconnected tone — still a real edge, just
              // one consistent with the rest of the panel's borders.
              <div className="rounded-md overflow-hidden border border-zinc-200/80 dark:border-sidebar-border">
                {pagedItems.map((item) => {
                  const isBusy = item.queueItem ? busyIds.has(item.queueItem.id) : false;
                  const isTriggering = item.queueItem ? triggeringId === item.queueItem.id : false;
                  const isCancelling = cancellingRunId === `cancel-${item.runId}`;
                  const repair = item.queueItem ? getRepairAction(item.queueItem) : null;

                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "group px-4 py-3.5 space-y-2 border-b border-zinc-100 dark:border-sidebar-border/60 last:border-b-0 transition-colors cursor-pointer",
                        selectedId === item.id
                          ? "bg-zinc-100/80 dark:bg-zinc-900/60"
                          : "bg-white dark:bg-transparent hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40"
                      )}
                      onClick={() => openItem(item)}
                    >
                      <div className="flex items-start gap-3">
                        {item.skillName && <AnySkillBadge skill={item.skillName} size={24} />}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-base font-bold text-zinc-900 dark:text-zinc-100 truncate">{item.title}</p>
                            {item.buyer && <span className="text-sm font-mono text-zinc-500 dark:text-zinc-400 truncate">· {item.buyer}</span>}
                          </div>
                          {item.subtitle && <p className="text-sm text-zinc-600 dark:text-zinc-300 truncate mt-0.5">{item.subtitle}</p>}
                        </div>
                        <VerboseTime isoString={item.timestamp} showFreshIndicator={false} className="text-sm font-medium shrink-0 whitespace-nowrap text-zinc-500 dark:text-zinc-400" />
                      </div>

                      {item.status === "needs_action" && (
                        <div className="flex items-center gap-1.5 flex-wrap pl-9" onClick={(e) => e.stopPropagation()}>
                          {item.queueItem ? (
                            <QueueItemQuickActions
                              item={item.queueItem}
                              repair={repair}
                              isBusy={isBusy}
                              isTriggering={isTriggering}
                              triggered={item.queueItem ? triggeredIds.has(item.queueItem.id) : false}
                              triggerErrorId={triggerErrorId}
                              errorText={item.queueItem ? errors.get(item.queueItem.id) ?? null : null}
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
                        <div className="pl-9" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            disabled={isCancelling}
                            onClick={() =>
                              runQuickAction(`cancel-${item.runId}`, () => cancelSkillRun(item.runId as string), () => router.refresh())
                            }
                            className={btnGhost}
                          >
                            {isCancelling ? <Loader2 size={11} className="animate-spin" /> : <Ban size={11} />} Cancel run
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
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
                <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Details</span>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="flex items-center justify-center w-7 h-7 rounded-md text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
                  aria-label="Close detail panel"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-4 text-sm">
                {selectedItem.queueItem ? (
                  <div className="space-y-4">
                    <QueueItemPreview item={selectedItem.queueItem} />
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <QueueItemQuickActions
                        item={selectedItem.queueItem}
                        repair={selectedItem.queueItem ? getRepairAction(selectedItem.queueItem) : null}
                        isBusy={busyIds.has(selectedItem.queueItem.id)}
                        isTriggering={triggeringId === selectedItem.queueItem.id}
                        triggered={triggeredIds.has(selectedItem.queueItem.id)}
                        triggerErrorId={triggerErrorId}
                        errorText={errors.get(selectedItem.queueItem.id) ?? null}
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
                    <div className="flex items-center gap-2.5">
                      {selectedItem.skillName && <AnySkillBadge skill={selectedItem.skillName} size={26} />}
                      <div className="min-w-0">
                        <p className="text-base font-bold text-zinc-900 dark:text-zinc-100 truncate">{selectedItem.title}</p>
                        {selectedItem.buyer && <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate">{selectedItem.buyer}</p>}
                      </div>
                    </div>
                    {selectedItem.run?.subjectLabel && (
                      <p className="text-sm text-zinc-600 dark:text-zinc-300 whitespace-pre-line">{selectedItem.run.subjectLabel}</p>
                    )}
                    {selectedItem.run?.errorMessage && (
                      <p className="text-sm text-rose-600 dark:text-rose-400 font-mono whitespace-pre-line">{selectedItem.run.errorMessage}</p>
                    )}
                    <VerboseTime isoString={selectedItem.timestamp} className="text-sm font-medium text-zinc-500 dark:text-zinc-400" />
                    <Link
                      href={selectedItem.href}
                      className="inline-flex items-center gap-1 text-sm font-mono text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
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
  triggered,
  triggerErrorId,
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
  /** "Run again" already started a run for this item. */
  triggered: boolean;
  triggerErrorId: string | null;
  /** This row's own last error, if any. */
  errorText: string | null;
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
            <button type="button" disabled={isBusy || isTriggering || triggered} onClick={() => onRunRepairTrigger(item, repair.engagementId, repair.skillName)} className={`${btnBase} bg-amber-400 text-white dark:text-zinc-950 hover:bg-amber-500`}>
              {triggered ? <Check size={11} /> : <RotateCcw size={11} />} {triggered ? "Run started" : isTriggering ? "Starting…" : repair.label}
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
      ) : item.category === "action_needed" && item.source === "cold_open_reply" ? (
        // A reply has one terminal state (handled) — Resolve and Dismiss
        // both called the same endpoint, so only one action is offered.
        <button type="button" disabled={isBusy} onClick={() => decide(item, "resolved")} className={`${btnBase} bg-emerald-600 dark:bg-emerald-500 text-white dark:text-zinc-950 hover:bg-emerald-700 dark:hover:bg-emerald-400`}>
          <Check size={11} /> Mark handled
        </button>
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

      {errorText && <p className="w-full text-[10.5px] text-rose-600 dark:text-rose-400 font-mono">{errorText}</p>}
    </>
  );
}
