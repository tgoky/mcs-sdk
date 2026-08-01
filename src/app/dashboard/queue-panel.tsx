"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from "react";
import Link from "next/link";
import {
  Check,
  X,
  ArrowUpRight,
  ShieldAlert,
  CircleAlert,
  Info,
  ClipboardCheck,
  PauseCircle,
  PlayCircle,
  Waves,
  Copy,
} from "lucide-react";
import { QUEUE_COPY as copy, QUEUE_TOOLBAR_COPY as toolbarCopy, TABLE_TOOLBAR_COPY as sharedToolbarCopy, CLIENT_RAIL_COPY as railCopy, skillName as skillDisplayName } from "@/lib/copy";
import type { StackSection } from "@/lib/error-classification";
import { ActionPanel, useQuickActions, type ActionPanelSection } from "@/components/action-panel";
import { pauseEngagement, resumeEngagement, triggerSkillRun, copyToClipboard } from "@/lib/quick-actions";
import { SegmentedTabs, type SegmentedTabOption } from "@/components/segmented-tabs";
import { TableSearchInput } from "@/components/table-search-input";
import { TimeRangeMenu, computeTimeRangeBounds, isWithinTimeRange, type TimeRangeValue } from "@/components/time-range-menu";
import { ViewCustomizer, FilterChipBar, type CustomizerSection } from "@/components/view-customizer";
import { useLocalViewState } from "@/lib/use-local-view-state";
import { groupBySignature, normalizeForSignature } from "@/lib/list-grouping";
import { GroupCountToggle } from "@/components/group-toggle";
import {
  ClientRail,
  ClientRosterTable,
  type ClientScopeView,
  type ClientRailEntry,
  type ClientRosterRow,
} from "@/components/client-rail";
import { ChevronLeft } from "lucide-react";

/** One row of the tenant's client roster — passed down from the server page/layout that already has the engagement list. Optional: omit entirely to keep a QueuePanel exactly as it behaved before this rail existed. */
export interface QueueClientRosterInput {
  engagementId: string;
  buyer: string;
  pausedAt?: string | null;
}

export interface QueueItemDTO {
  id: string;
  source: "action" | "blocker" | "notification" | "sync_setup" | "run_failure";
  category: "approve" | "action_needed" | "alert" | "fyi";
  title: string;
  subtitle: string;
  engagementId: string | null;
  buyer: string | null;
  runId: string | null;
  createdAt: string;
  fixHref?: string;
  skillName?: string;
  /** ISO timestamp if this item's client currently has automations paused, else null/undefined. */
  engagementPausedAt?: string | null;
  /** Only set for source "run_failure" — true for a 401/403, i.e. the fix is re-entering a credential. */
  isCredentialIssue?: boolean;
  /** Only set for source "run_failure" — which stack-settings area the failure belongs to. */
  diagnosisSection?: StackSection;
}

const POLL_MS = 8_000;

type QueueTab = "all" | "approve" | "action_needed" | "alerts";
type QueuePriority = "high" | "medium" | "low";

function computeQueuePriority(item: QueueItemDTO): QueuePriority {
  const hoursWaiting = (Date.now() - new Date(item.createdAt).getTime()) / 3_600_000;
  if (item.category === "alert") return "high";
  if (item.category === "approve") return hoursWaiting > 4 ? "high" : "medium";
  if (item.category === "action_needed") return hoursWaiting > 24 ? "high" : "medium";
  return "low"; // fyi
}

interface QueueChipDef {
  id: string;
  label: string;
  section: string;
  /** Chips sharing a group OR together; different groups AND together. */
  group: string;
  predicate: (item: QueueItemDTO, priority: QueuePriority) => boolean;
}

const PLATFORM_AREAS = Object.keys(toolbarCopy.platformAreaLabels) as StackSection[];

const QUEUE_CHIP_DEFS: QueueChipDef[] = [
  { id: "priority-high", label: toolbarCopy.chips.priorityHigh, section: toolbarCopy.chipSections.priority, group: "priority", predicate: (_i, p) => p === "high" },
  { id: "priority-medium", label: toolbarCopy.chips.priorityMedium, section: toolbarCopy.chipSections.priority, group: "priority", predicate: (_i, p) => p === "medium" },
  { id: "priority-low", label: toolbarCopy.chips.priorityLow, section: toolbarCopy.chipSections.priority, group: "priority", predicate: (_i, p) => p === "low" },
  { id: "needs-attention", label: toolbarCopy.chips.needsAttention, section: toolbarCopy.chipSections.diagnosis, group: "needs-attention", predicate: (i) => i.source === "run_failure" || i.source === "sync_setup" || !!i.engagementPausedAt },
  { id: "credential-issues", label: toolbarCopy.chips.credentialIssues, section: toolbarCopy.chipSections.diagnosis, group: "credential-issues", predicate: (i) => !!i.isCredentialIssue },
  { id: "auto-diagnosed", label: toolbarCopy.chips.autoDiagnosed, section: toolbarCopy.chipSections.diagnosis, group: "auto-diagnosed", predicate: (i) => i.source === "run_failure" },
  ...PLATFORM_AREAS.map((section) => ({
    id: `platform-${section}`,
    label: toolbarCopy.platformAreaLabels[section],
    section: toolbarCopy.chipSections.platform,
    group: "platform-area",
    predicate: (i: QueueItemDTO) => i.diagnosisSection === section,
  })),
  { id: "paused-clients", label: toolbarCopy.chips.pausedClients, section: toolbarCopy.chipSections.account, group: "paused-clients", predicate: (i) => !!i.engagementPausedAt },
  { id: "fyi-only", label: toolbarCopy.chips.fyiOnly, section: toolbarCopy.chipSections.account, group: "fyi-only", predicate: (i) => i.category === "fyi" },
];

const QUEUE_CHIP_SECTION_ORDER = [
  toolbarCopy.chipSections.priority,
  toolbarCopy.chipSections.diagnosis,
  toolbarCopy.chipSections.platform,
  toolbarCopy.chipSections.account,
];

interface QueueViewState {
  pinnedChipIds: string[];
  pageSize: 10 | 25 | 50;
  groupRepeats: boolean;
}

const DEFAULT_QUEUE_VIEW: QueueViewState = { pinnedChipIds: [], pageSize: 10, groupRepeats: true };

const DISPLAY_TOGGLE_IDS = {
  groupRepeats: "display:group-repeats",
} as const;

/**
 * Two queue items "are the same thing recurring" when they're the same
 * kind of item (source + category), for the same client, with the same
 * title and detail text — e.g. the identical "Klaviyo sync failed" alert
 * firing every night for the same engagement. Title/subtitle are
 * normalized (case/whitespace only) before comparing, so this stays an
 * exact-match on content, never a fuzzy one.
 */
function queueSignature(item: QueueItemDTO): string {
  return [
    item.source,
    item.category,
    item.engagementId ?? "no-engagement",
    normalizeForSignature(item.title),
    normalizeForSignature(item.subtitle),
  ].join("|");
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function CategoryBadge({ category }: { category: QueueItemDTO["category"] }) {
  const isGold = category !== "fyi";
  const icon =
    category === "approve" ? <ClipboardCheck size={11} /> :
    category === "action_needed" ? <ShieldAlert size={11} /> :
    category === "alert" ? <CircleAlert size={11} /> :
    <Info size={11} />;

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-wider shrink-0 ${
        isGold
          ? "bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50"
          : "bg-muted text-muted-foreground border border-border"
      }`}
    >
      {icon}
      {copy.categoryLabels[category]}
    </span>
  );
}

function QueueItemPreview({ item }: { item: QueueItemDTO }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <CategoryBadge category={item.category} />
      </div>
      <p className="font-semibold text-foreground leading-snug">{item.title}</p>
      <p className="text-muted-foreground leading-snug">{item.subtitle}</p>
      {item.buyer && <p className="font-mono text-muted-foreground/80">{item.buyer}</p>}
      <p className="text-muted-foreground/70">{relativeTime(item.createdAt)}</p>
    </div>
  );
}

function buildQueueSections(
  item: QueueItemDTO,
  dispatch: ReturnType<typeof useQuickActions>["run"],
  closePanel: () => void,
  onDone: () => void
): ActionPanelSection[] {
  const isPaused = !!item.engagementPausedAt;

  const nav: ActionPanelSection["items"] = [];
  if (item.runId) {
    nav.push({ key: "open-run", icon: ArrowUpRight, label: "Open run", href: `/dashboard/runs/${item.runId}` });
  }
  if (item.engagementId) {
    nav.push({
      key: "open-engagement",
      icon: ArrowUpRight,
      label: "Open client engagement",
      href: `/dashboard/engagements/${item.engagementId}`,
    });
  }

  const automation: ActionPanelSection["items"] = [];
  if (item.engagementId) {
    if (item.skillName !== "leak-map") {
      automation.push({
        key: "leak-map",
        icon: Waves,
        label: "Generate Leak Map for this client",
        onSelect: () =>
          dispatch("leak-map", () => triggerSkillRun(item.engagementId as string, "leak-map"), () => { onDone(); closePanel(); }),
      });
    }
    automation.push(
      isPaused
        ? {
            key: "resume",
            icon: PlayCircle,
            label: "Resume automations for this client",
            onSelect: () =>
              dispatch("resume", () => resumeEngagement(item.engagementId as string), () => { onDone(); closePanel(); }),
          }
        : {
            key: "pause",
            icon: PauseCircle,
            label: "Pause automations for this client",
            onSelect: () =>
              dispatch("pause", () => pauseEngagement(item.engagementId as string), () => { onDone(); closePanel(); }),
          }
    );
  }

  const utility: ActionPanelSection["items"] = [
    { key: "copy", icon: Copy, label: "Copy item ID", onSelect: () => dispatch("copy", () => copyToClipboard(item.id)) },
  ];

  const sections: ActionPanelSection[] = [];
  if (nav.length > 0) sections.push({ label: "Go to", items: nav });
  if (automation.length > 0) sections.push({ label: "Client automations", items: automation });
  sections.push({ label: "Utility", items: utility });
  return sections;
}

function QueueRow({
  item,
  isBusy,
  errorText,
  href,
  onDecide,
  onDismissSyncSetup,
  onDismissRunFailure,
  onRunMutation,
  onLinkNavigate,
  onActionComplete,
  groupCount = 1,
  groupExpanded = false,
  onToggleGroup,
  nested = false,
}: {
  item: QueueItemDTO;
  isBusy: boolean;
  errorText: string | null;
  href: string | null;
  onDecide: (decision: string) => void;
  onDismissSyncSetup: () => void;
  onDismissRunFailure: () => void;
  onRunMutation: (url: string) => void;
  onLinkNavigate: () => void;
  onActionComplete: () => void;
  /** >1 means this row is standing in for that many identical (same source/category/client/title/detail) items — see queueSignature() below. */
  groupCount?: number;
  groupExpanded?: boolean;
  onToggleGroup?: () => void;
  /** True for the older repeats revealed underneath a group's header row when expanded. */
  nested?: boolean;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const { busyKey, error, run: dispatch } = useQuickActions();

  return (
    <>
      <div className={`group flex items-center gap-3 py-3 first:pt-2 ${nested ? "pl-5 border-l-2 border-l-border/60 bg-muted/20" : ""}`}>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <CategoryBadge category={item.category} />
            <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
            {onToggleGroup && (
              <GroupCountToggle count={groupCount} expanded={groupExpanded} onToggle={onToggleGroup} />
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {item.buyer ? `${item.buyer} · ` : ""}
            {item.subtitle}
            {" · "}
            {relativeTime(item.createdAt)}
          </p>
          {errorText && (
            <p className="text-[14px] text-destructive font-mono">{errorText}</p>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {item.category === "approve" && (
            <>
              <button
                disabled={isBusy}
                onClick={() => onDecide("approved")}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-gold text-gold-foreground hover:bg-gold-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <Check size={13} /> {copy.actions.approve}
              </button>
              <button
                disabled={isBusy}
                onClick={() => onDecide("rejected")}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <X size={13} /> {copy.actions.reject}
              </button>
            </>
          )}

          {item.category === "action_needed" && item.source === "sync_setup" && (
            <>
              {href ? (
                <Link
                  href={href}
                  onClick={onLinkNavigate}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-gold text-gold-foreground hover:bg-gold-hover transition-colors"
                >
                  <ArrowUpRight size={13} /> Review
                </Link>
              ) : null}
              <button
                disabled={isBusy}
                onClick={onDismissSyncSetup}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <X size={13} /> Not now
              </button>
            </>
          )}

          {item.category === "action_needed" && item.source === "run_failure" && (
            <>
              {href ? (
                <Link
                  href={href}
                  onClick={onLinkNavigate}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-gold text-gold-foreground hover:bg-gold-hover transition-colors"
                >
                  <ArrowUpRight size={13} /> Fix now
                </Link>
              ) : null}
              <button
                disabled={isBusy}
                onClick={onDismissRunFailure}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <X size={13} /> Not now
              </button>
            </>
          )}

          {item.category === "action_needed" && item.source !== "sync_setup" && item.source !== "run_failure" && (
            <>
              <button
                disabled={isBusy}
                onClick={() => onDecide("resolved")}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-gold text-gold-foreground hover:bg-gold-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <Check size={13} /> {copy.actions.resolve}
              </button>
              <button
                disabled={isBusy}
                onClick={() => onDecide("abandoned")}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <X size={13} /> {copy.actions.dismiss}
              </button>
            </>
          )}

          {(item.category === "alert" || item.category === "fyi") && (
            <>
              {href ? (
                <Link
                  href={href}
                  onClick={onLinkNavigate}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-gold text-gold-foreground hover:bg-gold-hover transition-colors"
                >
                  <ArrowUpRight size={13} /> {copy.actions.open}
                </Link>
              ) : null}
              <button
                disabled={isBusy}
                onClick={() => onRunMutation(`/api/notifications/${item.id}/read`)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <X size={13} /> {copy.actions.dismiss}
              </button>
            </>
          )}

          <ActionPanel
            open={panelOpen}
            onOpenChange={setPanelOpen}
            header={<QueueItemPreview item={item} />}
            sections={buildQueueSections(item, dispatch, () => setPanelOpen(false), onActionComplete)}
            errorText={error}
            busyKey={busyKey}
            triggerLabel={`Quick actions for ${item.title}`}
          />
        </div>
      </div>
    </>
  );
}

export function QueuePanel({ initialItems, clients }: { initialItems: QueueItemDTO[]; clients?: QueueClientRosterInput[] }) {
  const [items, setItems] = useState<QueueItemDTO[]>(initialItems);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string>(copy.errors.generic);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [savedView, setSavedView] = useLocalViewState<QueueViewState>("mcs:queue:view", DEFAULT_QUEUE_VIEW);
  const [tab, setTab] = useState<QueueTab>("all");
  const [search, setSearch] = useState("");
  const [timeRange, setTimeRange] = useState<TimeRangeValue>("all");
  const [activeChipIds, setActiveChipIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);

  // "All / Clients" scope — see components/client-rail.tsx. Undefined
  // `clients` prop means the caller opted out (e.g. an earlier, simpler
  // usage) — everything below stays exactly the old, unscoped behavior.
  const hasClientScope = clients !== undefined;
  const [view, setView] = useState<ClientScopeView>("all");
  const [selectedEngagementId, setSelectedEngagementId] = useState<string | null>(null);

  const pinnedChipIds = new Set(savedView.pinnedChipIds);
  const pageSize = savedView.pageSize;

  const priorityById = useMemo(() => {
    const map = new Map<string, QueuePriority>();
    for (const item of items) map.set(item.id, computeQueuePriority(item));
    return map;
  }, [items]);

  // Per-client rollup used by both the rail's badges and the "Clients"
  // roster table — always computed off the full, unscoped `items`, since
  // it needs every client's numbers regardless of what's currently picked.
  const perClientAgg = useMemo(() => {
    const map = new Map<string, { approve: number; actionNeeded: number; alerts: number; fyi: number; lastActivity: string | null }>();
    for (const item of items) {
      if (!item.engagementId) continue;
      const bucket = map.get(item.engagementId) ?? { approve: 0, actionNeeded: 0, alerts: 0, fyi: 0, lastActivity: null };
      if (item.category === "approve") bucket.approve++;
      else if (item.category === "action_needed") bucket.actionNeeded++;
      else if (item.category === "alert") bucket.alerts++;
      else bucket.fyi++;
      if (!bucket.lastActivity || item.createdAt > bucket.lastActivity) bucket.lastActivity = item.createdAt;
      map.set(item.engagementId, bucket);
    }
    return map;
  }, [items]);

  const globalCounts = useMemo(() => {
    let approve = 0;
    let actionNeeded = 0;
    for (const item of items) {
      if (item.category === "approve") approve++;
      else if (item.category === "action_needed") actionNeeded++;
    }
    return { approve, actionNeeded };
  }, [items]);

  const railClients: ClientRailEntry[] = useMemo(() => {
    return (clients ?? []).map((c) => {
      const agg = perClientAgg.get(c.engagementId);
      const needsAttention = (agg?.approve ?? 0) + (agg?.actionNeeded ?? 0);
      const count = needsAttention > 0 ? needsAttention : agg?.alerts ?? 0;
      const tone: ClientRailEntry["tone"] =
        (agg?.approve ?? 0) > 0 ? "danger" : needsAttention > 0 || (agg?.alerts ?? 0) > 0 ? "attention" : "muted";
      return { engagementId: c.engagementId, buyer: c.buyer, count, tone, paused: !!c.pausedAt };
    });
  }, [clients, perClientAgg]);

  const rosterRows: ClientRosterRow[] = useMemo(() => {
    return (clients ?? [])
      .map((c) => {
        const agg = perClientAgg.get(c.engagementId) ?? { approve: 0, actionNeeded: 0, alerts: 0, fyi: 0, lastActivity: null };
        return {
          engagementId: c.engagementId,
          buyer: c.buyer,
          paused: !!c.pausedAt,
          lastActivity: agg.lastActivity,
          columns: [
            { key: "approve", label: "Needs approval", value: agg.approve, tone: "danger" as const },
            { key: "action_needed", label: "Action needed", value: agg.actionNeeded, tone: "attention" as const },
            { key: "alerts", label: "Alerts", value: agg.alerts, tone: "attention" as const },
          ],
        };
      })
      .sort((a, b) => {
        const score = (r: (typeof a)) => r.columns.reduce((s, col) => s + col.value, 0);
        const diff = score(b) - score(a);
        return diff !== 0 ? diff : a.buyer.localeCompare(b.buyer);
      });
  }, [clients, perClientAgg]);

  const selectedClientName = useMemo(() => {
    if (!selectedEngagementId) return null;
    return (clients ?? []).find((c) => c.engagementId === selectedEngagementId)?.buyer ?? null;
  }, [clients, selectedEngagementId]);

  // Scope to the picked client (if any) before any other filter runs, so
  // tab counts, search, and chips all operate within that client's items
  // — exactly like switching a whole different Queue was loaded.
  const clientScopedItems = useMemo(() => {
    if (view !== "clients" || !selectedEngagementId) return items;
    return items.filter((i) => i.engagementId === selectedEngagementId);
  }, [items, view, selectedEngagementId]);

  const tabCounts = useMemo(() => {
    const counts: Record<QueueTab, number> = { all: clientScopedItems.length, approve: 0, action_needed: 0, alerts: 0 };
    for (const item of clientScopedItems) {
      if (item.category === "approve") counts.approve++;
      else if (item.category === "action_needed") counts.action_needed++;
      else counts.alerts++;
    }
    return counts;
  }, [clientScopedItems]);

  const tabFiltered = useMemo(() => {
    if (tab === "all") return clientScopedItems;
    if (tab === "alerts") return clientScopedItems.filter((i) => i.category === "alert" || i.category === "fyi");
    return clientScopedItems.filter((i) => i.category === tab);
  }, [clientScopedItems, tab]);

  const rangeFiltered = useMemo(() => {
    if (timeRange === "all") return tabFiltered;
    const bounds = computeTimeRangeBounds(timeRange);
    return tabFiltered.filter((i) => isWithinTimeRange(i.createdAt, bounds));
  }, [tabFiltered, timeRange]);

  const searchFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rangeFiltered;
    return rangeFiltered.filter((i) => {
      const skillLabel = i.skillName ? skillDisplayName(i.skillName).toLowerCase() : "";
      return (
        i.title.toLowerCase().includes(q) ||
        i.subtitle.toLowerCase().includes(q) ||
        (i.buyer ?? "").toLowerCase().includes(q) ||
        skillLabel.includes(q)
      );
    });
  }, [rangeFiltered, search]);

  const chipCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const def of QUEUE_CHIP_DEFS) {
      let n = 0;
      for (const item of searchFiltered) {
        if (def.predicate(item, priorityById.get(item.id) ?? "low")) n++;
      }
      counts.set(def.id, n);
    }
    return counts;
  }, [searchFiltered, priorityById]);

  const visibleItems = useMemo(() => {
    if (activeChipIds.size === 0) return searchFiltered;
    const activeDefs = QUEUE_CHIP_DEFS.filter((d) => activeChipIds.has(d.id));
    const groups = new Map<string, QueueChipDef[]>();
    for (const def of activeDefs) {
      const bucket = groups.get(def.group) ?? [];
      bucket.push(def);
      groups.set(def.group, bucket);
    }
    return searchFiltered.filter((item) => {
      const priority = priorityById.get(item.id) ?? "low";
      for (const defs of groups.values()) {
        if (!defs.some((d) => d.predicate(item, priority))) return false;
      }
      return true;
    });
  }, [searchFiltered, activeChipIds, priorityById]);

  // Collapse repeats *after* every filter has already narrowed visibleItems
  // down, so tab/chip counts stay honest (they count real items) while
  // what actually renders collapses identical repeats.
  const queueGroups = useMemo(() => {
    if (!savedView.groupRepeats) {
      return visibleItems.map((it) => ({ signature: it.id, items: [it], latest: it, count: 1 }));
    }
    return groupBySignature(visibleItems, queueSignature, (it) => it.createdAt);
  }, [visibleItems, savedView.groupRepeats]);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  function toggleGroupExpanded(signature: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(signature)) next.delete(signature);
      else next.add(signature);
      return next;
    });
  }

  const pageCount = Math.max(1, Math.ceil(queueGroups.length / pageSize));
  const clampedPage = Math.min(page, pageCount - 1);
  const pagedGroups = queueGroups.slice(clampedPage * pageSize, clampedPage * pageSize + pageSize);

  function handleTabChange(nextTab: QueueTab) {
    setTab(nextTab);
    setPage(0);
  }

  function handleViewChange(nextView: ClientScopeView) {
    setView(nextView);
    setPage(0);
  }

  function handleSelectClient(nextEngagementId: string | null) {
    setSelectedEngagementId(nextEngagementId);
    setPage(0);
  }

  function handleSearchChange(nextSearch: string) {
    setSearch(nextSearch);
    setPage(0);
  }

  function handleTimeRangeChange(nextRange: TimeRangeValue) {
    setTimeRange(nextRange);
    setPage(0);
  }

  function togglePinnedChip(id: string) {
    setPage(0);
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

  function toggleGroupRepeats() {
    setPage(0);
    setSavedView((prev) => ({ ...prev, groupRepeats: !prev.groupRepeats }));
  }

  function toggleActiveChip(id: string) {
    setPage(0);
    setActiveChipIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function changePageSize(size: 10 | 25 | 50) {
    setPage(0);
    setSavedView((prev) => ({ ...prev, pageSize: size }));
  }

  function clearFilters() {
    setTab("all");
    setSearch("");
    setTimeRange("all");
    setActiveChipIds(new Set());
    setPage(0);
  }

  const hasActiveFilters = tab !== "all" || search.trim() !== "" || timeRange !== "all" || activeChipIds.size > 0;

  const tabOptions: SegmentedTabOption<QueueTab>[] = [
    { key: "all", label: toolbarCopy.tabs.all, count: tabCounts.all },
    { key: "approve", label: toolbarCopy.tabs.approve, count: tabCounts.approve },
    { key: "action_needed", label: toolbarCopy.tabs.action_needed, count: tabCounts.action_needed },
    { key: "alerts", label: toolbarCopy.tabs.alerts, count: tabCounts.alerts },
  ];

  const customizerSections: CustomizerSection[] = [
    ...QUEUE_CHIP_SECTION_ORDER.map((sectionLabel) => ({
      label: sectionLabel,
      options: QUEUE_CHIP_DEFS.filter((d) => d.section === sectionLabel).map((d) => ({
        id: d.id,
        label: d.label,
        count: chipCounts.get(d.id) ?? 0,
      })),
    })).filter((s) => s.options.length > 0),
    {
      label: sharedToolbarCopy.displaySectionLabel,
      options: [{ id: DISPLAY_TOGGLE_IDS.groupRepeats, label: sharedToolbarCopy.groupRepeatsLabel }],
    },
  ];

  const customizerEnabledIds = new Set(pinnedChipIds);
  if (savedView.groupRepeats) customizerEnabledIds.add(DISPLAY_TOGGLE_IDS.groupRepeats);

  function handleCustomizeToggle(id: string) {
    if (id === DISPLAY_TOGGLE_IDS.groupRepeats) {
      toggleGroupRepeats();
      return;
    }
    togglePinnedChip(id);
  }

  const pinnedChips = QUEUE_CHIP_DEFS.filter((d) => pinnedChipIds.has(d.id)).map((d) => ({
    id: d.id,
    label: d.label,
    count: chipCounts.get(d.id) ?? 0,
  }));

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const res = await fetch("/api/queue", { cache: "no-store", signal });
      if (signal.aborted || !res.ok) return;
      const data = await res.json();
      if (signal.aborted) return;
      setItems(data.items ?? []);
    } catch {
      // Silent catch
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const interval = setInterval(() => load(controller.signal), POLL_MS);
    return () => {
      clearInterval(interval);
      controller.abort();
    };
  }, [load]);

  const refreshNow = useCallback(() => {
    const controller = new AbortController();
    load(controller.signal);
  }, [load]);

  useEffect(() => () => {
    if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
  }, []);

  function flashError(id: string, text: string) {
    setErrorId(id);
    setErrorText(text);
    if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    errorTimeoutRef.current = setTimeout(() => setErrorId(null), 4000);
  }

  async function runMutation(item: QueueItemDTO, url: string, body?: object, method: "POST" | "PATCH" = "POST") {
    setBusyId(item.id);
    setErrorId(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const message = res.status === 403
          ? copy.errors.adminOnly
          : await res.json().then((d) => d?.error).catch(() => null) || copy.errors.generic;
        flashError(item.id, message);
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch {
      flashError(item.id, copy.errors.generic);
    } finally {
      setBusyId(null);
    }
  }

  function decide(item: QueueItemDTO, decision: string) {
    if (item.source === "action") {
      return runMutation(item, `/api/actions/${item.id}/review`, { decision });
    }
    if (item.source === "blocker") {
      return runMutation(item, `/api/blockers/${item.id}/resolve`, { decision });
    }
    return runMutation(item, `/api/notifications/${item.id}/read`);
  }

  function dismissSyncSetup(item: QueueItemDTO) {
    if (!item.engagementId) return;
    return runMutation(
      item,
      `/api/engagements/${item.engagementId}/sync-mode`,
      { dismissSetupNudge: true },
      "PATCH"
    );
  }

  function dismissRunFailure(item: QueueItemDTO) {
    if (!item.engagementId || !item.skillName) return;
    return runMutation(
      item,
      `/api/engagements/${item.engagementId}/dismiss-run-failure`,
      { skillName: item.skillName },
      "PATCH"
    );
  }

  const openHref = (item: QueueItemDTO) =>
    item.fixHref ?? (item.runId ? `/dashboard/runs/${item.runId}` : item.engagementId ? `/dashboard/engagements/${item.engagementId}` : null);

  function renderQueueRow(
    item: QueueItemDTO,
    extra: { groupCount?: number; groupExpanded?: boolean; onToggleGroup?: () => void; nested?: boolean } = {}
  ) {
    return (
      <QueueRow
        key={item.id}
        item={item}
        isBusy={busyId === item.id}
        errorText={errorId === item.id ? errorText : null}
        href={openHref(item)}
        onDecide={(decision) => decide(item, decision)}
        onDismissSyncSetup={() => dismissSyncSetup(item)}
        onDismissRunFailure={() => dismissRunFailure(item)}
        onRunMutation={(url) => runMutation(item, url)}
        onLinkNavigate={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
        onActionComplete={refreshNow}
        {...extra}
      />
    );
  }

  // "Clients" scope with no client picked yet → the roster grain (one row
  // per client) instead of the item grain. This is what keeps the toggle
  // from being redundant with "All": different aggregation, not the same
  // rows with a filter applied. See client-rail.tsx's top comment.
  const showRoster = hasClientScope && view === "clients" && !selectedEngagementId && rosterRows.length > 0;

  const content = showRoster ? (
    <ClientRosterTable
      rows={rosterRows}
      onSelectClient={handleSelectClient}
      emptyTitle={railCopy.emptyState}
    />
  ) : clientScopedItems.length === 0 ? (
    <div className="pt-1 border-t border-border/60">
      <p className="text-xs font-mono font-medium text-muted-foreground/80 py-6 text-center">
        {selectedClientName ? `Nothing waiting on you for ${selectedClientName} right now.` : copy.emptyState}
      </p>
    </div>
  ) : (
    <div className="pt-1 border-t border-border/60 space-y-2.5">
      <div className="flex items-center gap-2 flex-wrap px-1">
        <SegmentedTabs options={tabOptions} value={tab} onChange={handleTabChange} />
        <TableSearchInput value={search} onChange={handleSearchChange} placeholder={toolbarCopy.searchPlaceholder} className="w-[200px]" />
        <TimeRangeMenu value={timeRange} onChange={handleTimeRangeChange} />
        <div className="ml-auto flex items-center gap-1.5">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
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
        <div className="px-1">
          <FilterChipBar chips={pinnedChips} activeIds={activeChipIds} onToggle={toggleActiveChip} />
        </div>
      )}

      {visibleItems.length === 0 ? (
        <div className="py-10 text-center space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{sharedToolbarCopy.noResultsTitle}</p>
          <p className="text-xs text-muted-foreground/70 font-mono max-w-sm mx-auto">{sharedToolbarCopy.noResultsSubtitle}</p>
        </div>
      ) : (
        <div className="divide-y divide-border/60">
          {pagedGroups.map((group) => {
            const expanded = expandedGroups.has(group.signature);
            return (
              <Fragment key={group.signature}>
                {renderQueueRow(group.latest, {
                  groupCount: group.count,
                  groupExpanded: expanded,
                  onToggleGroup: group.count > 1 ? () => toggleGroupExpanded(group.signature) : undefined,
                })}
                {expanded && group.items.slice(1).map((it) => renderQueueRow(it, { nested: true }))}
              </Fragment>
            );
          })}
        </div>
      )}

      {queueGroups.length > 10 && (
        <div className="flex items-center justify-between px-1 py-2 border-t border-border/60">
          <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
            {([10, 25, 50] as const).map((size) => (
              <button
                key={size}
                onClick={() => changePageSize(size)}
                className={`px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                  pageSize === size
                    ? "border-zinc-400 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-900/40 text-zinc-700 dark:text-zinc-300"
                    : "border-transparent hover:text-foreground"
                }`}
              >
                {sharedToolbarCopy.pageSizeLabel(size)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-muted-foreground">Page {clampedPage + 1} of {pageCount}</span>
            <button
              onClick={() => setPage(Math.max(0, clampedPage - 1))}
              disabled={clampedPage === 0}
              className="px-2 py-1 text-[10px] font-mono font-bold rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage(Math.min(pageCount - 1, clampedPage + 1))}
              disabled={clampedPage >= pageCount - 1}
              className="px-2 py-1 text-[10px] font-mono font-bold rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );

  if (!hasClientScope) {
    return content;
  }

  return (
    <div className="flex gap-4 items-start">
      <ClientRail
        view={view}
        onViewChange={handleViewChange}
        clients={railClients}
        selectedEngagementId={selectedEngagementId}
        onSelectClient={handleSelectClient}
        totalCount={items.length}
        allModeStats={[
          { label: "Needs approval", value: globalCounts.approve },
          { label: "Action needed", value: globalCounts.actionNeeded },
        ]}
      />
      <div className="flex-1 min-w-0 space-y-2">
        {view === "clients" && selectedEngagementId && (
          <button
            type="button"
            onClick={() => handleSelectClient(null)}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <ChevronLeft size={13} /> {railCopy.backToAllClients}
            {selectedClientName && <span className="text-foreground font-semibold">— {selectedClientName}</span>}
          </button>
        )}
        {content}
      </div>
    </div>
  );
}