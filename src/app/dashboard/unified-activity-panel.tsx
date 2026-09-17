"use client";

// src/app/dashboard/unified-activity-panel.tsx
//
// Replaces the dashboard's separate, stacked Queue + Live Execution Feed
// sections with one panel: a fixed client/product rail on the left, one
// sorted+filterable list in the middle (needs-action items pinned first,
// then running, then completed), and a detail pane that opens on the
// right when a row is clicked — a real flex sibling that narrows the
// list column, not an overlay that covers it (same mechanics as
// right-utility-panel.tsx, which already does this correctly for
// Calendar/Teammates/etc.).
//
// Deliberately NOT a rewrite of queue-panel.tsx/live-execution-feed.tsx —
// those stay exactly as they are behind their own full pages
// (/dashboard/queue, /dashboard/runs) for anyone who needs the deeper
// tag-management/grouping/pagination features. This is the fast, unified
// overview for the dashboard home specifically. Row actions reuse the
// same real mutations those pages call (useQueueItemActions,
// getRepairAction) rather than re-deriving them — same pattern
// overview-stats-panel.tsx already established for its own "second
// surface showing Queue items" tile.

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
  List,
} from "lucide-react";
import { useQueueItemActions } from "./use-queue-item-actions";
import { QueueItemPreview, type ClientOption } from "./queue-panel";
import { getRepairAction } from "@/lib/queue-repair-action";
import { triggerSkillRun } from "@/lib/quick-actions";
import { useQuickActions } from "@/components/action-panel";
import { cancelSkillRun } from "@/lib/quick-actions";
import { AnySkillBadge } from "@/components/any-skill-badge";
import { VerboseTime } from "@/components/relative-time";
import { PRODUCT_IDS, PRODUCT_SKILL_IDS, type ProductId } from "@/lib/product-catalog";
import { QUEUE_COPY as queueCopy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import type { UnifiedActivityItem, UnifiedActivityCounts, UnifiedActivityStatus } from "@/lib/unified-activity";

const PRODUCT_LABELS: Record<ProductId, string> = {
  showtime: "Showtime",
  "reputation-manager": "Reputation Manager",
  "cold-open": "Cold Open",
  "whop-agent": "Whop Agent",
};

type StatusFilter = UnifiedActivityStatus | "all";

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

export function UnifiedActivityPanel({
  items,
  counts,
  clients,
  title = "Activity",
  viewQueueHref = "/dashboard/queue",
  viewRunsHref = "/dashboard/runs",
}: {
  items: UnifiedActivityItem[];
  counts: UnifiedActivityCounts;
  clients: ClientOption[];
  title?: string;
  viewQueueHref?: string;
  viewRunsHref?: string;
}) {
  const router = useRouter();
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const { busyId, errorId, errorText, decide, resolveSweepNoShow, dismissSyncSetup, dismissRunFailure } =
    useQueueItemActions((id) => setResolvedIds((prev) => new Set(prev).add(id)));
  const { busyKey: cancellingRunId, run: runQuickAction } = useQuickActions();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [productFilter, setProductFilter] = useState<ProductId | "all">("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailWidth, setDetailWidth] = useState(readStoredDetailWidth);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [triggerErrorId, setTriggerErrorId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  async function runRepairTrigger(item: NonNullable<UnifiedActivityItem["queueItem"]>, engagementId: string, skillName: string) {
    setTriggeringId(item.id);
    setTriggerErrorId(null);
    const result = await triggerSkillRun(engagementId, skillName);
    setTriggeringId(null);
    if (!result.ok) setTriggerErrorId(item.id);
  }

  const visibleItems = useMemo(() => {
    return items.filter((item) => {
      if (item.queueItem && resolvedIds.has(item.queueItem.id)) return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (productFilter !== "all") {
        const skillIds = PRODUCT_SKILL_IDS[productFilter] as readonly string[];
        if (!item.skillName || !skillIds.includes(item.skillName)) return false;
      }
      if (clientFilter !== "all" && item.engagementId !== clientFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const haystack = `${item.title} ${item.subtitle} ${item.buyer ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [items, resolvedIds, statusFilter, productFilter, clientFilter, search]);

  // Derived, not synced via effect: an item that scrolls out of the
  // current filter just stops being "selected" for rendering purposes —
  // no need to also null out the raw selectedId state to get that.
  const selectedItem = useMemo(() => visibleItems.find((i) => i.id === selectedId) ?? null, [visibleItems, selectedId]);

  // The detail panel is `hidden md:flex` (it's a real flex sibling that
  // narrows the list, which has no sensible mobile shape — same call
  // right-utility-panel.tsx already made). Below `md`, a row tap has
  // nowhere to open a detail into, so it navigates to the full page
  // instead — same fallback right-utility-rail.tsx uses for its own
  // panels on mobile — rather than silently doing nothing.
  const openItem = useCallback(
    (item: UnifiedActivityItem) => {
      const isDesktop = typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;
      if (isDesktop) {
        setSelectedId(item.id);
      } else {
        router.push(item.href);
      }
    },
    [router]
  );

  const handleDetailWidthChange = useCallback((w: number) => {
    setDetailWidth(w);
    try {
      window.localStorage.setItem(DETAIL_WIDTH_KEY, String(w));
    } catch {
      // Best-effort persistence — a blocked/private-mode localStorage just
      // means the width resets next visit, nothing else depends on it.
    }
  }, []);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!draggingRef.current || !containerRef.current) return;
      const right = containerRef.current.getBoundingClientRect().right;
      const next = Math.min(MAX_DETAIL_WIDTH, Math.max(MIN_DETAIL_WIDTH, right - e.clientX));
      handleDetailWidthChange(next);
    }
    function onUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [handleDetailWidthChange]);

  const statusChips: { key: StatusFilter; label: string; count: number }[] = [
    { key: "needs_action", label: "Needs action", count: counts.needsAction },
    { key: "running", label: "Running", count: counts.running },
    { key: "completed", label: "Completed", count: counts.completed },
    { key: "all", label: "All", count: counts.total },
  ];

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

      <div className="flex items-center gap-1.5 flex-wrap">
        {statusChips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setStatusFilter(chip.key)}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer border",
              statusFilter === chip.key
                ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100"
                : "bg-white dark:bg-zinc-900/60 text-zinc-600 dark:text-zinc-400 border-zinc-200/80 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            )}
          >
            {chip.label}
            <span className="tabular-nums opacity-70">{chip.count}</span>
          </button>
        ))}
      </div>

      <div ref={containerRef} className="surface-glass-2 rounded-2xl overflow-visible flex flex-col md:flex-row min-h-[420px] w-full">
        {/* LEFT RAIL — client + product filters. Fixed width; this doesn't
            shrink when the detail panel opens (see file header). */}
        <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-zinc-200/80 dark:border-sidebar-border bg-[#f8f7fa] dark:bg-sidebar p-3 flex flex-col shrink-0 gap-3 rounded-t-2xl md:rounded-tr-none md:rounded-l-2xl">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search activity..."
              className="w-full pl-7 pr-2.5 py-1.5 text-xs bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-700"
            />
          </div>

          <div className="space-y-1">
            <p className="px-1 text-[10.5px] font-bold text-zinc-500 dark:text-zinc-300 uppercase tracking-wider">Clients</p>
            <button
              type="button"
              onClick={() => setClientFilter("all")}
              className={cn(
                "w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[10px] text-xs font-medium transition-colors cursor-pointer",
                clientFilter === "all"
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white font-semibold shadow-xs"
                  : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-white"
              )}
            >
              <List size={13} className="shrink-0" />
              <span className="truncate">All clients</span>
            </button>
            <div className="max-h-[140px] overflow-y-auto space-y-0.5 [scrollbar-width:none]">
              {clients.map((client) => (
                <button
                  key={client.engagementId}
                  type="button"
                  onClick={() => setClientFilter(client.engagementId)}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[10px] text-xs font-medium transition-colors cursor-pointer",
                    clientFilter === client.engagementId
                      ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white font-semibold shadow-xs"
                      : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-white"
                  )}
                >
                  <span className="truncate">{client.buyer}</span>
                  {client.pausedAt && <span className="text-[9px] font-mono text-amber-600 dark:text-amber-400 shrink-0">paused</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <p className="px-1 text-[10.5px] font-bold text-zinc-500 dark:text-zinc-300 uppercase tracking-wider">Products</p>
            <button
              type="button"
              onClick={() => setProductFilter("all")}
              className={cn(
                "w-full flex items-center justify-between px-2.5 py-1.5 rounded-[10px] text-xs font-medium transition-colors cursor-pointer",
                productFilter === "all"
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white font-semibold shadow-xs"
                  : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-white"
              )}
            >
              <span className="truncate">Any product</span>
            </button>
            {PRODUCT_IDS.map((productId) => (
              <button
                key={productId}
                type="button"
                onClick={() => setProductFilter(productId)}
                className={cn(
                  "w-full flex items-center justify-between px-2.5 py-1.5 rounded-[10px] text-xs font-medium transition-colors cursor-pointer",
                  productFilter === productId
                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white font-semibold shadow-xs"
                    : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-white"
                )}
              >
                <span className="truncate">{PRODUCT_LABELS[productId]}</span>
                <span className={cn("text-[11px] font-mono tabular-nums font-bold", productFilter === productId ? "text-zinc-900 dark:text-white" : "text-zinc-400")}>
                  {counts.byProduct[productId]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* MIDDLE — the unified, filtered list. flex-1: this is what
            actually narrows when the detail panel opens, not the rail. */}
        <div className="flex-1 min-w-0 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-900 max-h-[640px]">
          {visibleItems.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500 dark:text-zinc-500 italic">
              {items.length === 0 ? "Nothing to show yet." : "No activity matches your filters."}
            </div>
          ) : (
            visibleItems.map((item) => {
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
                onMouseDown={onDragStart}
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
