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
  Search,
  Plus,
  ChevronDown,
  GripVertical,
  Layers,
  List,
} from "lucide-react";
import { QUEUE_COPY as copy, QUEUE_TOOLBAR_COPY as toolbarCopy, TABLE_TOOLBAR_COPY as sharedToolbarCopy, skillName as skillDisplayName } from "@/lib/copy";
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
import { cn } from "@/lib/utils";

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
  engagementPausedAt?: string | null;
  isCredentialIssue?: boolean;
  diagnosisSection?: StackSection;
}

export interface ClientOption {
  engagementId: string;
  buyer: string;
  pausedAt?: string | null;
}

const POLL_MS = 8_000;

type QueueTab = "all" | "approve" | "action_needed" | "alerts";
type QueuePriority = "high" | "medium" | "low";
export type ClientScopeView = "all" | "clients";

function computeQueuePriority(item: QueueItemDTO): QueuePriority {
  const hoursWaiting = (Date.now() - new Date(item.createdAt).getTime()) / 3_600_000;
  if (item.category === "alert") return "high";
  if (item.category === "approve") return hoursWaiting > 4 ? "high" : "medium";
  if (item.category === "action_needed") return hoursWaiting > 24 ? "high" : "medium";
  return "low";
}

interface QueueChipDef {
  id: string;
  label: string;
  section: string;
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
  pageSize: 5 | 10 | 25 | 50;
  groupRepeats: boolean;
}

// Default page size changed to 5 rows
const DEFAULT_QUEUE_VIEW: QueueViewState = { pinnedChipIds: [], pageSize: 5, groupRepeats: true };

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
  groupCount?: number;
  groupExpanded?: boolean;
  onToggleGroup?: () => void;
  nested?: boolean;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const { busyKey, error, run: dispatch } = useQuickActions();

  return (
    <div className={`group flex items-center gap-3 py-3 px-3 border-b border-sidebar-border/60 last:border-b-0 hover:bg-zinc-800/40 transition-colors ${nested ? "pl-6 bg-zinc-900/20" : ""}`}>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <CategoryBadge category={item.category} />
          <p className="text-xs font-bold text-zinc-100 truncate">{item.title}</p>
          {onToggleGroup && (
            <GroupCountToggle count={groupCount} expanded={groupExpanded} onToggle={onToggleGroup} />
          )}
        </div>
        <p className="text-xs text-zinc-400 truncate">
          {item.buyer ? `${item.buyer} · ` : ""}
          {item.subtitle}
          {" · "}
          {relativeTime(item.createdAt)}
        </p>
        {errorText && (
          <p className="text-xs text-rose-400 font-mono">{errorText}</p>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {item.category === "approve" && (
          <>
            <button
              disabled={isBusy}
              onClick={() => onDecide("approved")}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-500 text-zinc-950 hover:bg-emerald-400 transition-colors cursor-pointer"
            >
              <Check size={12} /> {copy.actions.approve}
            </button>
            <button
              disabled={isBusy}
              onClick={() => onDecide("rejected")}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <X size={12} /> {copy.actions.reject}
            </button>
          </>
        )}

        {item.category === "action_needed" && item.source === "sync_setup" && (
          <>
            {href ? (
              <Link
                href={href}
                onClick={onLinkNavigate}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-zinc-100 text-zinc-950 hover:bg-white transition-colors"
              >
                <ArrowUpRight size={12} /> Review
              </Link>
            ) : null}
            <button
              disabled={isBusy}
              onClick={onDismissSyncSetup}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <X size={12} /> Not now
            </button>
          </>
        )}

        {item.category === "action_needed" && item.source === "run_failure" && (
          <>
            {href ? (
              <Link
                href={href}
                onClick={onLinkNavigate}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-zinc-100 text-zinc-950 hover:bg-white transition-colors"
              >
                <ArrowUpRight size={12} /> Fix now
              </Link>
            ) : null}
            <button
              disabled={isBusy}
              onClick={onDismissRunFailure}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <X size={12} /> Not now
            </button>
          </>
        )}

        {item.category === "action_needed" && item.source !== "sync_setup" && item.source !== "run_failure" && (
          <>
            <button
              disabled={isBusy}
              onClick={() => onDecide("resolved")}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-500 text-zinc-950 hover:bg-emerald-400 transition-colors cursor-pointer"
            >
              <Check size={12} /> {copy.actions.resolve}
            </button>
            <button
              disabled={isBusy}
              onClick={() => onDecide("abandoned")}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <X size={12} /> {copy.actions.dismiss}
            </button>
          </>
        )}

        {(item.category === "alert" || item.category === "fyi") && (
          <>
            {href ? (
              <Link
                href={href}
                onClick={onLinkNavigate}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-zinc-100 text-zinc-950 hover:bg-white transition-colors"
              >
                <ArrowUpRight size={12} /> {copy.actions.open}
              </Link>
            ) : null}
            <button
              disabled={isBusy}
              onClick={() => onRunMutation(`/api/notifications/${item.id}/read`)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <X size={12} /> {copy.actions.dismiss}
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
  );
}

export function QueuePanel({
  initialItems,
  clients = [],
  title = "QUEUE",
  viewAllHref,
}: {
  initialItems: QueueItemDTO[];
  clients?: ClientOption[];
  title?: string;
  viewAllHref?: string;
}) {
  const [items, setItems] = useState<QueueItemDTO[]>(initialItems);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string>(copy.errors.generic);

  // Rail Scope State
  const [railView, setRailView] = useState<ClientScopeView>("all");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  // Table State
  const [savedView, setSavedView] = useLocalViewState<QueueViewState>("mcs:queue:view", DEFAULT_QUEUE_VIEW);
  const [tab, setTab] = useState<QueueTab>("all");
  const [search, setSearch] = useState("");
  const [timeRange, setTimeRange] = useState<TimeRangeValue>("all");
  const [activeChipIds, setActiveChipIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);

  const pinnedChipIds = new Set(savedView.pinnedChipIds);
  const pageSize = savedView.pageSize;

  // Rail Categories (Platforms/CRMs)
  const categories = useMemo(() => {
    const platformCounts: Record<string, { label: string; count: number }> = {};

    for (const item of items) {
      let label = "Other";
      const str = (item.title + " " + item.subtitle).toLowerCase();
      if (str.includes("gohighlevel") || str.includes("ghl")) label = "GoHighLevel";
      else if (str.includes("calendly")) label = "Calendly";
      else if (str.includes("klaviyo")) label = "Klaviyo";
      else if (str.includes("twilio")) label = "Twilio";
      else if (str.includes("activecampaign")) label = "ActiveCampaign";

      const key = label.toLowerCase().replace(/\s+/g, "_");
      if (!platformCounts[key]) platformCounts[key] = { label, count: 0 };
      platformCounts[key].count++;
    }

    return Object.entries(platformCounts).map(([id, { label, count }]) => ({ id, label, count }));
  }, [items]);

  // Rail Clients
  const clientRailItems = useMemo(() => {
    const countsByClient: Record<string, number> = {};
    for (const item of items) {
      if (item.engagementId) {
        countsByClient[item.engagementId] = (countsByClient[item.engagementId] ?? 0) + 1;
      }
    }
    return clients.map((c) => ({
      engagementId: c.engagementId,
      buyer: c.buyer,
      count: countsByClient[c.engagementId] ?? 0,
      pausedAt: c.pausedAt,
    }));
  }, [items, clients]);

  // Compute Priorities
  const priorityById = useMemo(() => {
    const map = new Map<string, QueuePriority>();
    for (const item of items) map.set(item.id, computeQueuePriority(item));
    return map;
  }, [items]);

  // 1. Rail-level Filtered Set
  const railFilteredItems = useMemo(() => {
    return items.filter((item) => {
      if (railView === "clients" && selectedClientId) {
        if (item.engagementId !== selectedClientId) return false;
      }
      if (railView === "all" && selectedCategory) {
        const itemPlatform = (item.title + " " + item.subtitle).toLowerCase();
        const catLabel = categories.find((c) => c.id === selectedCategory)?.label.toLowerCase() ?? "";
        if (!itemPlatform.includes(catLabel)) return false;
      }
      return true;
    });
  }, [items, railView, selectedClientId, selectedCategory, categories]);

  // Tab Counts based on current Rail scope
  const tabCounts = useMemo(() => {
    const counts: Record<QueueTab, number> = { all: railFilteredItems.length, approve: 0, action_needed: 0, alerts: 0 };
    for (const item of railFilteredItems) {
      if (item.category === "approve") counts.approve++;
      else if (item.category === "action_needed") counts.action_needed++;
      else counts.alerts++;
    }
    return counts;
  }, [railFilteredItems]);

  // 2. Tab Filtered Set
  const tabFiltered = useMemo(() => {
    if (tab === "all") return railFilteredItems;
    if (tab === "alerts") return railFilteredItems.filter((i) => i.category === "alert" || i.category === "fyi");
    return railFilteredItems.filter((i) => i.category === tab);
  }, [railFilteredItems, tab]);

  // 3. Time Range Filtered
  const rangeFiltered = useMemo(() => {
    if (timeRange === "all") return tabFiltered;
    const bounds = computeTimeRangeBounds(timeRange);
    return tabFiltered.filter((i) => isWithinTimeRange(i.createdAt, bounds));
  }, [tabFiltered, timeRange]);

  // 4. Search Filtered
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

  // Chip Counts
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

  // 5. Chips Filtered
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

  // 6. Grouped Repeats
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

  // Auto-refresh polling
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
        setErrorId(item.id);
        setErrorText(message);
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch {
      setErrorId(item.id);
      setErrorText(copy.errors.generic);
    } finally {
      setBusyId(null);
    }
  }

  function decide(item: QueueItemDTO, decision: string) {
    if (item.source === "action") return runMutation(item, `/api/actions/${item.id}/review`, { decision });
    if (item.source === "blocker") return runMutation(item, `/api/blockers/${item.id}/resolve`, { decision });
    return runMutation(item, `/api/notifications/${item.id}/read`);
  }

  function dismissSyncSetup(item: QueueItemDTO) {
    if (!item.engagementId) return;
    return runMutation(item, `/api/engagements/${item.engagementId}/sync-mode`, { dismissSetupNudge: true }, "PATCH");
  }

  function dismissRunFailure(item: QueueItemDTO) {
    if (!item.engagementId || !item.skillName) return;
    return runMutation(item, `/api/engagements/${item.engagementId}/dismiss-run-failure`, { skillName: item.skillName }, "PATCH");
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
  ];

  const pinnedChips = QUEUE_CHIP_DEFS.filter((d) => pinnedChipIds.has(d.id)).map((d) => ({
    id: d.id,
    label: d.label,
    count: chipCounts.get(d.id) ?? 0,
  }));

  // Rail Search
  const [railSearch, setRailSearch] = useState("");
  const [isRailSearchOpen, setIsRailSearchOpen] = useState(false);

  const filteredRailCategories = useMemo(() => {
    if (!railSearch.trim()) return categories;
    return categories.filter((c) => c.label.toLowerCase().includes(railSearch.toLowerCase()));
  }, [categories, railSearch]);

  const filteredRailClients = useMemo(() => {
    if (!railSearch.trim()) return clientRailItems;
    return clientRailItems.filter((c) => c.buyer.toLowerCase().includes(railSearch.toLowerCase()));
  }, [clientRailItems, railSearch]);

  return (
    <div className="space-y-3 w-full font-sans antialiased text-zinc-300 select-none">
      {/* ----------------------------------------------------------------- */}
      {/* TOP ROW (NORTH): [ All | Clients ] Toggle on Left | Title on Right */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Left Side: [ All | Clients ] Toggle */}
        <div className="w-full md:w-64 shrink-0">
          <div className="grid grid-cols-2 p-1 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-medium">
            <button
              type="button"
              onClick={() => {
                setRailView("all");
                setSelectedCategory(null);
                setSelectedClientId(null);
                setPage(0);
              }}
              className={cn(
                "py-1.5 rounded-lg text-center transition-all cursor-pointer",
                railView === "all"
                  ? "bg-[#3f3f42] text-white font-semibold shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => {
                setRailView("clients");
                setSelectedCategory(null);
                setSelectedClientId(null);
                setPage(0);
              }}
              className={cn(
                "py-1.5 rounded-lg text-center transition-all cursor-pointer",
                railView === "clients"
                  ? "bg-[#3f3f42] text-white font-semibold shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              Clients
            </button>
          </div>
        </div>

        {/* Right Side: Title & View All */}
        <div className="flex-1 flex items-center justify-between w-full min-w-0">
          <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 font-mono tracking-wider uppercase">
            {title}
          </p>
          {viewAllHref && items.length > 0 && (
            <Link
              href={viewAllHref}
              className="text-xs font-mono text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
            >
              View all →
            </Link>
          )}
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* MAIN CONTAINER FRAME (Integrated Rail + Table)                    */}
      {/* ----------------------------------------------------------------- */}
      <div className="border border-sidebar-border rounded-2xl bg-sidebar overflow-hidden flex flex-col md:flex-row min-h-[400px] w-full">
        {/* 1. SEAMLESS INTEGRATED LEFT RAIL */}
        <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-sidebar-border bg-sidebar p-3 flex flex-col shrink-0 space-y-3 select-none">
          {/* GREY SCOPE CARD (Row 2 Aligned) */}
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-zinc-800/80 border border-zinc-700/50 text-xs font-semibold text-zinc-100 shadow-xs">
            <span>{railView === "all" ? "All queues" : "All clients"}</span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-zinc-700/80 text-zinc-200 font-bold tabular-nums">
              {railView === "all" ? items.length : clients.length}
            </span>
          </div>

          {/* LISTS / CLIENTS HEADER */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-zinc-300 tracking-tight">
                {railView === "all" ? "Lists" : "Clients"}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsRailSearchOpen((p) => !p)}
                  className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                  title="Search"
                >
                  <Search size={13} />
                </button>
                <Link
                  href="/dashboard/engagements/new"
                  className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                  title="Add client"
                >
                  <Plus size={13} />
                </Link>
              </div>
            </div>

            {isRailSearchOpen && (
              <input
                type="text"
                value={railSearch}
                onChange={(e) => setRailSearch(e.target.value)}
                placeholder={railView === "all" ? "Search platforms..." : "Search clients..."}
                className="w-full px-2.5 py-1 text-xs bg-zinc-900 border border-zinc-800 rounded-md text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-700"
                autoFocus
              />
            )}

            {/* BY CRM / BY CLIENT NAME PILL */}
            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-xs text-zinc-300 font-medium">
              <div className="flex items-center gap-2">
                <GripVertical size={13} className="text-zinc-500 shrink-0" />
                <span className="truncate">
                  {railView === "all" ? "By CRM / Platform" : "By Client Name"}
                </span>
              </div>
              <ChevronDown size={13} className="text-zinc-500 shrink-0" />
            </div>
          </div>

          {/* SUB-LIST ITEMS */}
          <div className="flex-1 overflow-y-auto space-y-0.5 pt-1 max-h-[360px] [scrollbar-width:none]">
            {railView === "all" ? (
              <>
                <button
                  type="button"
                  onClick={() => { setSelectedCategory(null); setPage(0); }}
                  className={cn(
                    "w-full flex items-center justify-between px-2.5 py-2 rounded-[10px] text-xs font-medium transition-colors cursor-pointer",
                    selectedCategory === null
                      ? "bg-[#3f3f42] text-white font-semibold"
                      : "text-zinc-300 hover:bg-zinc-800/60 hover:text-white"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Layers size={14} className="text-zinc-400 shrink-0" />
                    <span className="truncate">Every platform</span>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-400 font-bold tabular-nums">
                    {items.length}
                  </span>
                </button>

                {filteredRailCategories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => { setSelectedCategory(cat.id); setPage(0); }}
                    className={cn(
                      "w-full flex items-center justify-between px-2.5 py-2 rounded-[10px] text-xs font-medium transition-colors cursor-pointer",
                      selectedCategory === cat.id
                        ? "bg-[#3f3f42] text-white font-semibold"
                        : "text-zinc-300 hover:bg-zinc-800/60 hover:text-white"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Layers size={14} className="text-zinc-400 shrink-0" />
                      <span className="truncate">{cat.label}</span>
                    </div>
                    <span className="text-[11px] font-mono text-zinc-400 font-bold tabular-nums">
                      {cat.count}
                    </span>
                  </button>
                ))}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => { setSelectedClientId(null); setPage(0); }}
                  className={cn(
                    "w-full flex items-center justify-between px-2.5 py-2 rounded-[10px] text-xs font-medium transition-colors cursor-pointer",
                    selectedClientId === null
                      ? "bg-[#3f3f42] text-white font-semibold"
                      : "text-zinc-300 hover:bg-zinc-800/60 hover:text-white"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-5 h-5 rounded-[5px] bg-[#7fe3d4] text-zinc-950 flex items-center justify-center shrink-0">
                      <List className="w-3 h-3 stroke-[2.5]" />
                    </div>
                    <span className="truncate">All clients</span>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-400 font-bold tabular-nums">
                    {clients.length}
                  </span>
                </button>

                {filteredRailClients.map((client) => (
                  <button
                    key={client.engagementId}
                    type="button"
                    onClick={() => { setSelectedClientId(client.engagementId); setPage(0); }}
                    className={cn(
                      "w-full flex items-center justify-between px-2.5 py-2 rounded-[10px] text-xs font-medium transition-colors cursor-pointer",
                      selectedClientId === client.engagementId
                        ? "bg-[#3f3f42] text-white font-semibold"
                        : "text-zinc-300 hover:bg-zinc-800/60 hover:text-white"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-5 h-5 rounded-[5px] bg-[#7fe3d4] text-zinc-950 flex items-center justify-center shrink-0 shadow-xs">
                        <List className="w-3 h-3 stroke-[2.5]" />
                      </div>
                      <span className="truncate">{client.buyer}</span>
                    </div>
                    {client.count !== undefined && client.count > 0 && (
                      <span className="text-[11px] font-mono text-zinc-400 font-bold tabular-nums">
                        {client.count}
                      </span>
                    )}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>

        {/* 2. FULL TABLE AREA */}
        <div className="flex-1 flex flex-col min-w-0 bg-sidebar p-3 space-y-3">
          {/* TABLE TOOLBAR */}
          <div className="flex items-center gap-2 flex-wrap">
            <SegmentedTabs options={tabOptions} value={tab} onChange={(t) => { setTab(t); setPage(0); }} />
            <TableSearchInput value={search} onChange={(s) => { setSearch(s); setPage(0); }} placeholder={toolbarCopy.searchPlaceholder} className="w-[180px]" />
            <TimeRangeMenu value={timeRange} onChange={(r) => { setTimeRange(r); setPage(0); }} />
            <div className="ml-auto flex items-center gap-1.5">
              {tab !== "all" || search || timeRange !== "all" || activeChipIds.size > 0 ? (
                <button
                  type="button"
                  onClick={() => { setTab("all"); setSearch(""); setTimeRange("all"); setActiveChipIds(new Set()); setPage(0); }}
                  className="text-[11px] font-mono text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  {sharedToolbarCopy.clearFiltersButton}
                </button>
              ) : null}
              <ViewCustomizer
                sections={customizerSections}
                enabledIds={pinnedChipIds}
                onToggle={(id) => {
                  setPage(0);
                  setSavedView((p) => {
                    const s = new Set(p.pinnedChipIds);
                    if (s.has(id)) s.delete(id); else s.add(id);
                    return { ...p, pinnedChipIds: Array.from(s) };
                  });
                }}
                menuTitle={sharedToolbarCopy.customizeMenuTitle}
              />
            </div>
          </div>

          {pinnedChips.length > 0 && (
            <FilterChipBar
              chips={pinnedChips}
              activeIds={activeChipIds}
              onToggle={(id) => {
                setPage(0);
                setActiveChipIds((prev) => {
                  const s = new Set(prev);
                  if (s.has(id)) s.delete(id); else s.add(id);
                  return s;
                });
              }}
            />
          )}

          {/* ROWS */}
          {visibleItems.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-center text-zinc-500 space-y-1">
              <p className="text-sm font-medium">{sharedToolbarCopy.noResultsTitle}</p>
              <p className="text-xs font-mono text-zinc-600">{sharedToolbarCopy.noResultsSubtitle}</p>
            </div>
          ) : (
            <div className="flex-1 divide-y divide-sidebar-border border border-sidebar-border rounded-xl overflow-hidden bg-zinc-900/30">
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

          {/* PAGINATION / EXPAND VIEW MORE */}
          <div className="flex items-center justify-between pt-2 border-t border-sidebar-border text-xs text-zinc-400">
            {pageSize === 5 && queueGroups.length > 5 ? (
              <button
                type="button"
                onClick={() => setSavedView((p) => ({ ...p, pageSize: 10 }))}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-sidebar-border text-zinc-300 hover:text-white hover:bg-zinc-800/60 transition-colors cursor-pointer"
              >
                View more ({queueGroups.length - 5} remaining)
              </button>
            ) : (
              <div className="flex items-center gap-1 font-mono text-[10px]">
                {([5, 10, 25, 50] as const).map((size) => (
                  <button
                    key={size}
                    onClick={() => { setPage(0); setSavedView((p) => ({ ...p, pageSize: size })); }}
                    className={cn(
                      "px-1.5 py-0.5 rounded border transition-colors cursor-pointer",
                      pageSize === size
                        ? "border-zinc-600 bg-zinc-800 text-zinc-200"
                        : "border-transparent hover:text-white"
                    )}
                  >
                    {sharedToolbarCopy.pageSizeLabel(size)}
                  </button>
                ))}
              </div>
            )}

            {queueGroups.length > pageSize && (
              <div className="flex items-center gap-2 font-mono text-[11px] ml-auto">
                <span>Page {clampedPage + 1} of {pageCount}</span>
                <button
                  onClick={() => setPage(Math.max(0, clampedPage - 1))}
                  disabled={clampedPage === 0}
                  className="px-2 py-1 rounded border border-sidebar-border text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => setPage(Math.min(pageCount - 1, clampedPage + 1))}
                  disabled={clampedPage >= pageCount - 1}
                  className="px-2 py-1 rounded border border-sidebar-border text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}