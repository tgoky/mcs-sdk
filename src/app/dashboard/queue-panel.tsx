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
  RotateCcw,
  Copy,
  Search,
  Plus,
  ChevronDown,
  GripVertical,
  Layers,
  List,
  Tag as TagIcon,
  Trash2,
  UserX,
  UserCheck,
  CalendarClock,
} from "lucide-react";
import { QUEUE_COPY as copy, QUEUE_TOOLBAR_COPY as toolbarCopy, TABLE_TOOLBAR_COPY as sharedToolbarCopy, skillName as skillDisplayName, SKILLS } from "@/lib/copy";
import type { StackSection } from "@/lib/error-classification";
import { ActionPanel, useQuickActions, type ActionPanelSection } from "@/components/action-panel";
import { triggerSkillRun, copyToClipboard } from "@/lib/quick-actions";
import { getRepairAction, type RepairAction } from "@/lib/queue-repair-action";
import { SegmentedTabs, type SegmentedTabOption } from "@/components/segmented-tabs";
import { TableSearchInput } from "@/components/table-search-input";
import { TimeRangeMenu, computeTimeRangeBounds, isWithinTimeRange, type TimeRangeValue } from "@/components/time-range-menu";
import { ViewCustomizer, FilterChipBar, type CustomizerSection } from "@/components/view-customizer";
import { useLocalViewState } from "@/lib/use-local-view-state";
import { groupBySignature, normalizeForSignature } from "@/lib/list-grouping";
import { GroupCountToggle } from "@/components/group-toggle";
import { VerboseTime } from "@/components/relative-time";
import { cn } from "@/lib/utils";
import { QueueFixDrawer } from "@/components/queue-fix-drawer";

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
  skillEnabledForClient?: boolean;
  sweepNoShowReview?: { bookingId: string; prospectEmail: string } | null;
}

/** Client-side mirror of QueueArchiveItem (src/lib/queue.ts) — the "Closed" tab's data. */
export interface QueueArchiveItemDTO {
  id: string;
  source: "action" | "blocker";
  title: string;
  subtitle: string;
  engagementId: string | null;
  buyer: string | null;
  runId: string | null;
  outcome: "approved" | "rejected" | "execution_failed" | "resolved" | "abandoned";
  closedAt: string;
  closedBy: string | null;
}

export interface ClientOption {
  engagementId: string;
  buyer: string;
  pausedAt?: string | null;
}

export type RailGroupingMode = "platform" | "module" | "task_type" | "preset";

export interface CustomTag {
  id: string;
  name: string;
  colorHex: string;
  isDarkCheck?: boolean;
  targetSkill?: string;
  targetCategory?: string;
}

const TAG_SWATCHES = [
  { hex: "#5e0d39", label: "Plum" },
  { hex: "#e59a2f", label: "Amber" },
  { hex: "#a0d646", label: "Lime" },
  { hex: "#235e4b", label: "Forest" },
  { hex: "#2cb2b4", label: "Turquoise" },
  { hex: "#a2e2e0", label: "Ice Blue" },
  { hex: "#3b71e8", label: "Royal Blue" },
  { hex: "#8580f0", label: "Periwinkle" },
  { hex: "#b06ed6", label: "Purple" },
  { hex: "#f897a6", label: "Coral Pink" },
  { hex: "#e0e0e0", label: "Light Gray", darkCheck: true },
  { hex: "#1c1c1c", label: "Dark Charcoal", hasBorder: true },
];

const DEFAULT_TAGS: CustomTag[] = [
  { id: "tag-lime-alerts", name: "alerts", colorHex: "#a0d646", targetCategory: "alert" },
  { id: "tag-pindown", name: "tasks", colorHex: "#3b71e8", targetSkill: "pin-down" },
  { id: "tag-urgent", name: "actions", colorHex: "#f897a6", targetCategory: "action_needed" },
];

const POLL_MS = 8_000;
const CLOSE_ANIMATION_MS = 280;
type QueueTab = "all" | "approve" | "action_needed" | "alerts" | "closed";

const ARCHIVE_OUTCOME_LABEL: Record<QueueArchiveItemDTO["outcome"], string> = {
  approved: "Approved",
  rejected: "Rejected",
  execution_failed: "Approved — failed to run",
  resolved: "Resolved",
  abandoned: "Abandoned",
};

function archiveOutcomeClasses(outcome: QueueArchiveItemDTO["outcome"]): string {
  if (outcome === "approved" || outcome === "resolved") {
    return "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50";
  }
  if (outcome === "execution_failed") {
    return "bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/50";
  }
  return "bg-zinc-100 dark:bg-muted text-zinc-600 dark:text-muted-foreground border-zinc-200 dark:border-border";
}
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
          : "bg-zinc-100 dark:bg-muted text-zinc-600 dark:text-muted-foreground border border-zinc-200 dark:border-border"
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
      <p className="font-semibold text-zinc-900 dark:text-foreground leading-snug">{item.title}</p>
      <p className="text-zinc-600 dark:text-muted-foreground leading-snug">{item.subtitle}</p>
      {item.buyer && <p className="font-mono text-zinc-500 dark:text-muted-foreground/80">{item.buyer}</p>}
      <VerboseTime isoString={item.createdAt} className="text-zinc-400 dark:text-muted-foreground/70 text-[11px]" />
    </div>
  );
}

function repairActionItem(
  item: QueueItemDTO,
  repair: RepairAction,
  dispatch: ReturnType<typeof useQuickActions>["run"],
  closePanel: () => void,
  onDone: () => void,
  onOpenFixDrawer: (engagementId: string, type: "stack" | "credentials", section?: string | null) => void
): ActionPanelSection["items"][number] {
  if (repair.kind === "trigger") {
    return {
      key: repair.key,
      icon: RotateCcw,
      label: repair.label,
      onSelect: () =>
        dispatch(
          repair.key,
          () => triggerSkillRun(repair.engagementId, repair.skillName),
          () => {
            onDone();
            closePanel();
          }
        ),
    };
  }

  if (item.engagementId && repair.drawer) {
    const engagementId = item.engagementId;
    const drawer = repair.drawer;
    return {
      key: repair.key,
      icon: ArrowUpRight,
      label: repair.label,
      onSelect: () => {
        closePanel();
        onOpenFixDrawer(engagementId, drawer.type, drawer.section ?? null);
      },
    };
  }

  return { key: repair.key, icon: ArrowUpRight, label: repair.label, href: repair.href };
}

function buildQueueSections(
  item: QueueItemDTO,
  dispatch: ReturnType<typeof useQuickActions>["run"],
  closePanel: () => void,
  onDone: () => void,
  onOpenFixDrawer: (engagementId: string, type: "stack" | "credentials", section?: string | null) => void
): ActionPanelSection[] {
  const repair = getRepairAction(item);

  const fix: ActionPanelSection["items"] = repair
    ? [repairActionItem(item, repair, dispatch, closePanel, onDone, onOpenFixDrawer)]
    : [];

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

  const utility: ActionPanelSection["items"] = [
    { key: "copy", icon: Copy, label: "Copy item ID", onSelect: () => dispatch("copy", () => copyToClipboard(item.id)) },
  ];

  const sections: ActionPanelSection[] = [];
  if (fix.length > 0) sections.push({ label: "Fix", items: fix });
  if (nav.length > 0) sections.push({ label: "Go to", items: nav });
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
  onResolveSweepNoShow,
  onLinkNavigate,
  onActionComplete,
  onOpenFixDrawer,
  groupCount = 1,
  groupExpanded = false,
  onToggleGroup,
  nested = false,
  matchedTag,
}: {
  item: QueueItemDTO;
  isBusy: boolean;
  errorText: string | null;
  href: string | null;
  onDecide: (decision: string) => void;
  onDismissSyncSetup: () => void;
  onDismissRunFailure: () => void;
  onRunMutation: (url: string) => void;
  onResolveSweepNoShow: (outcome: "showed" | "rescheduled") => void;
  onLinkNavigate: () => void;
  onActionComplete: () => void;
  onOpenFixDrawer: (
    engagementId: string,
    type: "stack" | "credentials",
    section?: string | null
  ) => void;
  groupCount?: number;
  groupExpanded?: boolean;
  onToggleGroup?: () => void;
  nested?: boolean;
  matchedTag?: CustomTag | null;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const { busyKey, error, run: dispatch } = useQuickActions();
  const repair = getRepairAction(item);

  const handleFixLinkClick = (e: React.MouseEvent) => {
    if (item.engagementId && repair?.kind === "link" && repair.drawer) {
      e.preventDefault();
      onOpenFixDrawer(item.engagementId, repair.drawer.type, repair.drawer.section ?? null);
      return;
    }
    onLinkNavigate();
  };

  return (
    <div className={`group flex items-center gap-3 py-3 px-3.5 border-b border-zinc-100 dark:border-sidebar-border/60 last:border-b-0 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors ${nested ? "pl-6 bg-zinc-50/40 dark:bg-zinc-900/20" : "bg-white dark:bg-transparent"}`}>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <CategoryBadge category={item.category} />
          {matchedTag && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-zinc-950 shrink-0 shadow-xs"
              style={{ backgroundColor: matchedTag.colorHex }}
            >
              {matchedTag.name}
            </span>
          )}
          <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">{item.title}</p>
          {onToggleGroup && (
            <GroupCountToggle count={groupCount} expanded={groupExpanded} onToggle={onToggleGroup} />
          )}
        </div>
        <p className="text-xs text-zinc-600 dark:text-zinc-300 line-clamp-2 leading-relaxed">{item.subtitle}</p>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">
          {item.buyer ? `${item.buyer} · ` : ""}
          <VerboseTime isoString={item.createdAt} className="text-[11px] text-zinc-400 dark:text-zinc-500" />
        </p>
        {errorText && (
          <p className="text-xs text-rose-600 dark:text-rose-400 font-mono">{errorText}</p>
        )}
        {error && !errorText && (
          <p className="text-xs text-rose-600 dark:text-rose-400 font-mono">{error}</p>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {item.category === "approve" && item.sweepNoShowReview ? (
          // Fix: a plain Approve/Reject was the wrong shape for "did this
          // person actually no-show" — see QueueItem.sweepNoShowReview's
          // doc. Reject specifically promised "reject if they actually
          // showed and just weren't logged" but recorded nothing; these
          // three map directly to the real outcomes a reviewer is
          // actually choosing between, and each one (besides "not sure")
          // logs the real outcome, not just a status flip.
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1.5">
              <button
                disabled={isBusy}
                onClick={() => onDecide("approved")}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-rose-600 dark:bg-rose-500 text-white hover:bg-rose-700 dark:hover:bg-rose-400 transition-colors cursor-pointer shadow-2xs"
                title="Confirm no-show and start Win-Back recovery"
              >
                <UserX size={12} /> Confirm no-show
              </button>
              <button
                disabled={isBusy}
                onClick={() => onResolveSweepNoShow("showed")}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-600 dark:bg-emerald-500 text-white dark:text-zinc-950 hover:bg-emerald-700 dark:hover:bg-emerald-400 transition-colors cursor-pointer shadow-2xs"
                title="Log that they actually showed — no Win-Back"
              >
                <UserCheck size={12} /> Showed
              </button>
              <button
                disabled={isBusy}
                onClick={() => onResolveSweepNoShow("rescheduled")}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-500 text-zinc-950 hover:bg-amber-400 transition-colors cursor-pointer shadow-2xs"
                title="Log that they rescheduled — no Win-Back"
              >
                <CalendarClock size={12} /> Rescheduled
              </button>
            </div>
            <button
              disabled={isBusy}
              onClick={() => onDecide("rejected")}
              className="text-[10.5px] font-medium text-zinc-500 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 underline cursor-pointer"
              title="Dismiss without logging anything — resolve it later from the roster"
            >
              Not sure — dismiss
            </button>
          </div>
        ) : (
          item.category === "approve" && (
            <>
              <button
                disabled={isBusy}
                onClick={() => onDecide("approved")}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-600 dark:bg-emerald-500 text-white dark:text-zinc-950 hover:bg-emerald-700 dark:hover:bg-emerald-400 transition-colors cursor-pointer shadow-2xs"
              >
                <Check size={12} /> {copy.actions.approve}
              </button>
              <button
                disabled={isBusy}
                onClick={() => onDecide("rejected")}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-amber-200 dark:border-amber-500/30 bg-white dark:bg-transparent text-zinc-700 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors cursor-pointer shadow-2xs"
              >
                <X size={12} /> {copy.actions.reject}
              </button>
            </>
          )
        )}

        {item.category === "action_needed" && item.source === "sync_setup" && (
          <>
            {(repair?.kind === "link" ? repair.href : href) ? (
              <Link
                href={repair?.kind === "link" ? repair.href : (href as string)}
                onClick={handleFixLinkClick}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-400 text-white dark:text-zinc-950 hover:bg-amber-500 transition-colors shadow-2xs"
              >
                <ArrowUpRight size={12} /> {repair?.label ?? "Review"}
              </Link>
            ) : null}
            <button
              disabled={isBusy}
              onClick={onDismissSyncSetup}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-amber-200 dark:border-amber-500/30 bg-white dark:bg-transparent text-zinc-700 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors cursor-pointer shadow-2xs"
            >
              <X size={12} /> Not now
            </button>
          </>
        )}

        {item.category === "action_needed" && item.source === "run_failure" && (
          <>
            {repair?.kind === "trigger" ? (
              <button
                disabled={isBusy || busyKey === repair.key}
                onClick={() =>
                  dispatch(repair.key, () => triggerSkillRun(repair.engagementId, repair.skillName), onActionComplete)
                }
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-400 text-white dark:text-zinc-950 hover:bg-amber-500 transition-colors disabled:opacity-60 shadow-2xs"
              >
                <RotateCcw size={12} /> {busyKey === repair.key ? "Running…" : repair.label}
              </button>
            ) : (repair?.kind === "link" ? repair.href : href) ? (
              <Link
                href={repair?.kind === "link" ? repair.href : (href as string)}
                onClick={handleFixLinkClick}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-400 text-white dark:text-zinc-950 hover:bg-amber-500 transition-colors shadow-2xs"
              >
                <ArrowUpRight size={12} /> {repair?.label ?? "Fix now"}
              </Link>
            ) : null}
            <button
              disabled={isBusy}
              onClick={onDismissRunFailure}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-amber-200 dark:border-amber-500/30 bg-white dark:bg-transparent text-zinc-700 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors cursor-pointer shadow-2xs"
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
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-600 dark:bg-emerald-500 text-white dark:text-zinc-950 hover:bg-emerald-700 dark:hover:bg-emerald-400 transition-colors cursor-pointer shadow-2xs"
            >
              <Check size={12} /> {copy.actions.resolve}
            </button>
            <button
              disabled={isBusy}
              onClick={() => onDecide("abandoned")}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-amber-200 dark:border-amber-500/30 bg-white dark:bg-transparent text-zinc-700 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors cursor-pointer shadow-2xs"
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
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-400 text-white dark:text-zinc-950 hover:bg-amber-500 transition-colors shadow-2xs"
              >
                <ArrowUpRight size={12} /> {copy.actions.open}
              </Link>
            ) : null}
            <button
              disabled={isBusy}
              onClick={() => onRunMutation(`/api/notifications/${item.id}/read`)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-amber-200 dark:border-amber-500/30 bg-white dark:bg-transparent text-zinc-700 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors cursor-pointer shadow-2xs"
            >
              <X size={12} /> {copy.actions.dismiss}
            </button>
          </>
        )}

        <ActionPanel
          open={panelOpen}
          onOpenChange={setPanelOpen}
          header={<QueueItemPreview item={item} />}
          sections={buildQueueSections(item, dispatch, () => setPanelOpen(false), onActionComplete, onOpenFixDrawer)}
          errorText={error}
          busyKey={busyKey}
          triggerLabel={`Quick actions for ${item.title}`}
        />
      </div>
    </div>
  );
}

/**
 * A row in the "Closed" tab — deliberately read-only (no decide/dismiss
 * buttons, nothing to accidentally re-trigger). Shows what it was, what
 * happened to it, when, and by whom, plus the same "go to" link a live
 * row offers. See getQueueArchiveItems for what closedBy can be null for
 * (a Slack-button decision doesn't always carry a resolvable name).
 */
function ClosedQueueRow({ item }: { item: QueueArchiveItemDTO }) {
  const href =
    item.runId ? `/dashboard/runs/${item.runId}` : item.engagementId ? `/dashboard/engagements/${item.engagementId}` : null;

  const body = (
    <div className="group flex items-center gap-3 py-3 px-3.5 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors bg-white dark:bg-transparent">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              "inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-wider shrink-0 border",
              archiveOutcomeClasses(item.outcome)
            )}
          >
            {ARCHIVE_OUTCOME_LABEL[item.outcome]}
          </span>
          <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">{item.title}</p>
        </div>
        <p className="text-xs text-zinc-600 dark:text-zinc-300 line-clamp-2 leading-relaxed">{item.subtitle}</p>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">
          {item.buyer ? `${item.buyer} · ` : ""}
          <VerboseTime isoString={item.closedAt} className="text-[11px] text-zinc-400 dark:text-zinc-500" showFreshIndicator={false} />
          {item.closedBy ? ` · by ${item.closedBy}` : ""}
        </p>
      </div>
      {href && <ArrowUpRight className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />}
    </div>
  );

  if (!href) return body;
  return (
    <Link href={href} className="block">
      {body}
    </Link>
  );
}

export function QueuePanel({
  initialItems,
  clients = [],
  title = "Queue",
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

  // Items mid-exit-animation — still rendered (collapsing/fading out) so a
  // resolved item doesn't just vanish, but no longer counted or actionable.
  // Fix: a row used to disappear the instant a mutation resolved, with
  // nothing telling the user their click actually landed.
  const [closingIds, setClosingIds] = useState<Set<string>>(new Set());
  const closeItemWithAnimation = useCallback((id: string) => {
    setClosingIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setItems((prev) => prev.filter((i) => i.id !== id));
      setClosingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, CLOSE_ANIMATION_MS);
  }, []);

  // "Closed" tab — what the user already decided, read back from the DB
  // (see getQueueArchiveItems). Loaded lazily on first visit to the tab,
  // not polled — this is a look-back, not a live view.
  const [archiveItems, setArchiveItems] = useState<QueueArchiveItemDTO[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveLoaded, setArchiveLoaded] = useState(false);
  const fetchArchive = useCallback(async () => {
    setArchiveLoading(true);
    try {
      const res = await fetch("/api/queue/archive", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setArchiveItems(data.items ?? []);
      }
    } catch {
      // Archive is supplementary — a failed fetch just leaves the last
      // known list (or empty) rather than blocking the whole panel.
    } finally {
      setArchiveLoading(false);
      setArchiveLoaded(true);
    }
  }, []);

  // Event-handler-triggered, not effect-triggered — this fetch is a
  // response to the user clicking the tab, not a render needing to stay
  // in sync with `tab`, so it belongs in the SegmentedTabs onChange
  // below rather than a useEffect watching `tab`.
  function handleTabChange(next: QueueTab) {
    setTab(next);
    setPage(0);
    if (next === "closed" && !archiveLoaded) fetchArchive();
  }

  const [activeFix, setActiveFix] = useState<{
    engagementId: string;
    type: "stack" | "credentials";
    section?: string | null;
  } | null>(null);

  // Rail Scope State
  const [railView, setRailView] = useState<ClientScopeView>("all");
  const [groupingMode, setGroupingMode] = useState<RailGroupingMode>("platform");
  const [isGroupingPopoverOpen, setIsGroupingPopoverOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  // Tags State
  const [tags, setTags] = useLocalViewState<CustomTag[]>("mcs:queue:tags", DEFAULT_TAGS);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [isAddTagOpen, setIsAddTagOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_SWATCHES[2].hex);
  const [newTagTargetSkill, setNewTagTargetSkill] = useState<string>("all");
  const [newTagTargetCategory, setNewTagTargetCategory] = useState<string>("all");

  const [isSkillDropdownOpen, setIsSkillDropdownOpen] = useState(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);

  // Table State
  const [savedView, setSavedView] = useLocalViewState<QueueViewState>("mcs:queue:view", DEFAULT_QUEUE_VIEW);
  const [tab, setTab] = useState<QueueTab>("all");

  const [search, setSearch] = useState("");
  const [timeRange, setTimeRange] = useState<TimeRangeValue>("all");
  const [activeChipIds, setActiveChipIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);

  const pinnedChipIds = new Set(savedView.pinnedChipIds);
  const pageSize = savedView.pageSize ?? 5;

  const categories = useMemo(() => {
    const counts: Record<string, { label: string; count: number }> = {};

    for (const item of items) {
      let key = "other";
      let label = "Other";

      if (groupingMode === "platform") {
        const str = (item.title + " " + item.subtitle).toLowerCase();
        if (str.includes("gohighlevel") || str.includes("ghl")) { label = "GoHighLevel"; key = "ghl"; }
        else if (str.includes("calendly")) { label = "Calendly"; key = "calendly"; }
        else if (str.includes("klaviyo")) { label = "Klaviyo"; key = "klaviyo"; }
        else if (str.includes("twilio")) { label = "Twilio"; key = "twilio"; }
        else if (str.includes("activecampaign")) { label = "ActiveCampaign"; key = "activecampaign"; }
      } else if (groupingMode === "module") {
        label = item.skillName ? skillDisplayName(item.skillName) : "General";
        key = item.skillName ?? "general";
      } else if (groupingMode === "task_type") {
        if (item.source === "action") { label = "Approvals Needed"; key = "action"; }
        else if (item.source === "blocker") { label = "Human Holds"; key = "blocker"; }
        else if (item.source === "run_failure") { label = "Fix-It Cards"; key = "run_failure"; }
        else if (item.source === "sync_setup") { label = "Sync Setup Nudges"; key = "sync_setup"; }
        else { label = "System Alerts & FYIs"; key = "notification"; }
      } else if (groupingMode === "preset") {
        if (item.isCredentialIssue) { label = "Broken Credentials"; key = "broken_keys"; }
        else if (item.source === "blocker") { label = "Human Holds"; key = "human_holds"; }
        else if (item.source === "sync_setup") { label = "Polling Fallbacks"; key = "polling_fallbacks"; }
      }

      if (!counts[key]) counts[key] = { label, count: 0 };
      counts[key].count++;
    }

    return Object.entries(counts).map(([id, { label, count }]) => ({ id, label, count }));
  }, [items, groupingMode]);

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

  const priorityById = useMemo(() => {
    const map = new Map<string, QueuePriority>();
    for (const item of items) map.set(item.id, computeQueuePriority(item));
    return map;
  }, [items]);

  const itemMatchesTag = useCallback((item: QueueItemDTO, tag: CustomTag) => {
    if (tag.targetSkill && tag.targetSkill !== "all") {
      if (item.skillName !== tag.targetSkill) return false;
    }
    if (tag.targetCategory && tag.targetCategory !== "all") {
      if (item.category !== tag.targetCategory) return false;
    }
    if (!tag.targetSkill && !tag.targetCategory) {
      const q = tag.name.toLowerCase();
      return item.title.toLowerCase().includes(q) || item.subtitle.toLowerCase().includes(q);
    }
    return true;
  }, []);

  const tagCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const tag of tags) {
      map[tag.id] = items.filter((item) => itemMatchesTag(item, tag)).length;
    }
    return map;
  }, [items, tags, itemMatchesTag]);

  const railFilteredItems = useMemo(() => {
    return items.filter((item) => {
      if (selectedTagId) {
        const activeTag = tags.find((t) => t.id === selectedTagId);
        if (activeTag && !itemMatchesTag(item, activeTag)) return false;
      }

      if (railView === "clients" && selectedClientId) {
        if (item.engagementId !== selectedClientId) return false;
      }
      if (railView === "all" && selectedCategory) {
        if (groupingMode === "module") {
          return item.skillName === selectedCategory;
        }
        if (groupingMode === "task_type") {
          if (selectedCategory === "action") return item.source === "action";
          if (selectedCategory === "blocker") return item.source === "blocker";
          if (selectedCategory === "run_failure") return item.source === "run_failure";
          if (selectedCategory === "sync_setup") return item.source === "sync_setup";
          return item.source === "notification";
        }
        if (groupingMode === "preset") {
          if (selectedCategory === "broken_keys") return !!item.isCredentialIssue;
          if (selectedCategory === "human_holds") return item.source === "blocker";
          if (selectedCategory === "polling_fallbacks") return item.source === "sync_setup";
        }
        const itemPlatform = (item.title + " " + item.subtitle).toLowerCase();
        const catLabel = categories.find((c) => c.id === selectedCategory)?.label.toLowerCase() ?? "";
        if (!itemPlatform.includes(catLabel)) return false;
      }
      return true;
    });
  }, [items, railView, selectedClientId, selectedCategory, categories, groupingMode, selectedTagId, tags, itemMatchesTag]);

  const tabCounts = useMemo(() => {
    const counts: Record<QueueTab, number> = { all: railFilteredItems.length, approve: 0, action_needed: 0, alerts: 0, closed: 0 };
    for (const item of railFilteredItems) {
      if (item.category === "approve") counts.approve++;
      else if (item.category === "action_needed") counts.action_needed++;
      else counts.alerts++;
    }
    return counts;
  }, [railFilteredItems]);

  const tabFiltered = useMemo(() => {
    if (tab === "closed") return []; // Closed tab reads from archiveItems, a separate fetch — not the live queue pipeline.
    if (tab === "all") return railFilteredItems;
    if (tab === "alerts") return railFilteredItems.filter((i) => i.category === "alert" || i.category === "fyi");
    return railFilteredItems.filter((i) => i.category === tab);
  }, [railFilteredItems, tab]);

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

  const rosterCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of visibleItems) {
      if (!item.engagementId) continue;
      counts.set(item.engagementId, (counts.get(item.engagementId) ?? 0) + 1);
    }
    return counts;
  }, [visibleItems]);

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

  function handleCreateTag() {
    if (!newTagName.trim()) return;
    const swatch = TAG_SWATCHES.find((s) => s.hex === newTagColor);
    const created: CustomTag = {
      id: `tag-${Date.now()}`,
      name: newTagName.trim(),
      colorHex: newTagColor,
      isDarkCheck: swatch?.darkCheck,
      targetSkill: newTagTargetSkill !== "all" ? newTagTargetSkill : undefined,
      targetCategory: newTagTargetCategory !== "all" ? newTagTargetCategory : undefined,
    };

    setTags((prev) => [...prev, created]);
    setNewTagName("");
    setIsAddTagOpen(false);
  }

  function handleDeleteTag(id: string) {
    setTags((prev) => prev.filter((t) => t.id !== id));
    if (selectedTagId === id) setSelectedTagId(null);
  }

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
      closeItemWithAnimation(item.id);
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

  // Richer resolution for a sweep-inferred no-show — see
  // QueueItem.sweepNoShowReview's doc. Logs the real outcome (via the
  // general per-booking endpoint, same one the master roster's inline
  // buttons use) before closing out the pending action, instead of a
  // plain reject that recorded nothing and left the booking's own status
  // exactly as ambiguous as it was before the sweep ever looked at it.
  async function resolveSweepNoShow(item: QueueItemDTO, outcome: "showed" | "rescheduled") {
    if (!item.engagementId || !item.sweepNoShowReview) return;
    setBusyId(item.id);
    setErrorId(null);
    try {
      const res = await fetch(
        `/api/engagements/${item.engagementId}/bookings/${item.sweepNoShowReview.bookingId}/outcome`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ outcome }),
        }
      );
      if (!res.ok) {
        const message =
          res.status === 403
            ? copy.errors.adminOnly
            : (await res.json().then((d) => d?.error).catch(() => null)) || copy.errors.generic;
        setErrorId(item.id);
        setErrorText(message);
        return;
      }
      // The real outcome is on file now — this pending action's own
      // question is already answered, so close it the same way a plain
      // reject would, just with something more specific already recorded.
      await fetch(`/api/actions/${item.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "rejected" }),
      }).catch(() => {});
      closeItemWithAnimation(item.id);
    } catch {
      setErrorId(item.id);
      setErrorText(copy.errors.generic);
    } finally {
      setBusyId(null);
    }
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
    const matchedTag = selectedTagId ? tags.find((t) => t.id === selectedTagId && itemMatchesTag(item, t)) : null;
    const isClosing = closingIds.has(item.id);
    return (
      // Collapses height + fades out on close instead of vanishing
      // instantly, so acting on an item reads as "this closed" rather
      // than "this disappeared" — see closeItemWithAnimation above.
      <div
        key={item.id}
        className="grid overflow-hidden"
        style={{
          gridTemplateRows: isClosing ? "0fr" : "1fr",
          opacity: isClosing ? 0 : 1,
          transition: "grid-template-rows 280ms ease-in-out, opacity 280ms ease-in-out",
        }}
      >
        <div className={`overflow-hidden ${isClosing ? "pointer-events-none" : ""}`}>
          <QueueRow
            item={item}
            isBusy={busyId === item.id}
            errorText={errorId === item.id ? errorText : null}
            href={openHref(item)}
            onDecide={(decision) => decide(item, decision)}
            onDismissSyncSetup={() => dismissSyncSetup(item)}
            onDismissRunFailure={() => dismissRunFailure(item)}
            onRunMutation={(url) => runMutation(item, url)}
            onResolveSweepNoShow={(outcome) => resolveSweepNoShow(item, outcome)}
            onLinkNavigate={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
            onActionComplete={refreshNow}
            matchedTag={matchedTag}
            onOpenFixDrawer={(engagementId, type, section) => {
              setActiveFix({ engagementId, type, section });
            }}
            {...extra}
          />
        </div>
      </div>
    );
  }

  const tabOptions: SegmentedTabOption<QueueTab>[] = [
    { key: "all", label: toolbarCopy.tabs.all, count: tabCounts.all },
    { key: "approve", label: toolbarCopy.tabs.approve, count: tabCounts.approve },
    { key: "action_needed", label: toolbarCopy.tabs.action_needed, count: tabCounts.action_needed },
    { key: "alerts", label: toolbarCopy.tabs.alerts, count: tabCounts.alerts },
    // What you already decided on — read from the DB, not polled. See
    // getQueueArchiveItems' doc for why some closed items don't appear.
    { key: "closed", label: "Closed", count: archiveLoaded ? archiveItems.length : undefined },
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

  const groupingModeLabels: Record<RailGroupingMode, string> = {
    platform: "By CRM / Platform",
    module: "By Automation Module",
    task_type: "By Task Type",
    preset: "By Smart Presets",
  };

  const skillTargetLabels: Record<string, string> = {
    all: "Any Skill",
    ...Object.fromEntries(SKILLS.map((id) => [id, skillDisplayName(id)])),
  };

  const categoryTargetLabels: Record<string, string> = {
    all: "Any Category",
    approve: "Approve",
    action_needed: "Action Needed",
    alert: "Alert",
    fyi: "FYI",
  };

  return (
    <div className="space-y-3 w-full font-sans antialiased text-zinc-800 dark:text-zinc-300 select-none">
      {/* TOP ROW (NORTH): [ All | Clients ] Toggle on Left | Title on Right */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="w-full md:w-64 shrink-0">
          {clients.length > 0 && (
            <div role="tablist" className="grid grid-cols-2 p-1 rounded-xl bg-zinc-200/60 dark:bg-zinc-900 border border-zinc-300/60 dark:border-zinc-800 text-xs font-medium">
              <button
                type="button"
                role="tab"
                aria-selected={railView === "all"}
                onClick={() => {
                  setRailView("all");
                  setSelectedCategory(null);
                  setSelectedClientId(null);
                  setPage(0);
                }}
                className={cn(
                  "py-1.5 rounded-lg text-center transition-all cursor-pointer",
                  railView === "all"
                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white font-semibold shadow-xs"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                )}
              >
                All
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={railView === "clients"}
                onClick={() => {
                  setRailView("clients");
                  setSelectedCategory(null);
                  setSelectedClientId(null);
                  setIsRailSearchOpen(true);
                  setPage(0);
                }}
                className={cn(
                  "py-1.5 rounded-lg text-center transition-all cursor-pointer",
                  railView === "clients"
                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white font-semibold shadow-xs"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                )}
              >
                Clients
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 flex items-center justify-between w-full min-w-0 pl-1">
          <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            {title}
          </h2>
          {viewAllHref && items.length > 0 && (
            <Link
              href={viewAllHref}
              title="Open full Queue"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 bg-white dark:bg-zinc-900/60 hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-800 transition-all duration-150 shadow-2xs group"
            >
              <span>View all</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 transition-colors" />
            </Link>
          )}
        </div>
      </div>

      {/* MAIN CONTAINER FRAME (Integrated Rail + Table) */}
      <div className="border border-zinc-200/80 dark:border-sidebar-border rounded-2xl bg-white/60 dark:bg-sidebar shadow-xs overflow-visible flex flex-col md:flex-row min-h-[400px] w-full">
        {/* LEFT RAIL */}
        <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-zinc-200/80 dark:border-sidebar-border bg-[#f8f7fa] dark:bg-sidebar p-3 flex flex-col shrink-0 space-y-3 select-none rounded-t-2xl md:rounded-tr-none md:rounded-l-2xl">
          {/* SCOPE CARD */}
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-white dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/50 text-xs font-semibold text-zinc-900 dark:text-zinc-100 shadow-xs">
            <span>{railView === "all" ? "All queues" : "All clients"}</span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-700/80 text-zinc-700 dark:text-zinc-200 font-bold tabular-nums">
              {railView === "all" ? items.length : clients.length}
            </span>
          </div>

          {/* GROUPING MODE SELECTOR */}
          {railView === "all" && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsGroupingPopoverOpen((p) => !p)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-white dark:bg-zinc-900/80 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-800 text-xs text-zinc-800 dark:text-zinc-200 font-medium transition-colors cursor-pointer shadow-2xs"
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
                  <div className="absolute top-full left-0 mt-1 w-full z-40 p-1 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl space-y-0.5 text-xs">
                    {(Object.keys(groupingModeLabels) as RailGroupingMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          setGroupingMode(mode);
                          setSelectedCategory(null);
                          setPage(0);
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
          )}

          {/* HEADER */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10.5px] font-bold text-zinc-500 dark:text-zinc-300 uppercase tracking-wider">
                {railView === "all" ? "Lists" : "Clients"}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsRailSearchOpen((p) => !p)}
                  className="p-1 rounded-md text-zinc-400 hover:text-zinc-800 dark:hover:text-white hover:bg-zinc-200/50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                  title="Search"
                >
                  <Search size={13} />
                </button>
                <Link
                  href="/dashboard/engagements/new"
                  className="p-1 rounded-md text-zinc-400 hover:text-zinc-800 dark:hover:text-white hover:bg-zinc-200/50 dark:hover:bg-zinc-800 transition-colors"
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
                placeholder={railView === "all" ? "Search lists..." : "Search clients..."}
                className="w-full px-2.5 py-1 text-xs bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-700"
                autoFocus
              />
            )}
          </div>

          {/* SUB-LIST ITEMS */}
          <div className="overflow-y-auto space-y-0.5 pt-1 max-h-[220px] [scrollbar-width:none]">
            {railView === "all" ? (
              <>
                <button
                  type="button"
                  onClick={() => { setSelectedCategory(null); setPage(0); }}
                  className={cn(
                    "w-full flex items-center justify-between px-2.5 py-2 rounded-[10px] text-xs font-medium transition-colors cursor-pointer",
                    selectedCategory === null && !selectedTagId
                      ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white font-semibold shadow-xs"
                      : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-white"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Layers size={14} className={selectedCategory === null && !selectedTagId ? "text-zinc-900 dark:text-white shrink-0" : "text-zinc-400 shrink-0"} />
                    <span className="truncate">Every item</span>
                  </div>
                  <span className={cn(
                    "text-[11px] font-mono tabular-nums font-bold",
                    selectedCategory === null && !selectedTagId ? "text-zinc-900 dark:text-white" : "text-zinc-400"
                  )}>
                    {items.length}
                  </span>
                </button>

                {filteredRailCategories.map((cat) => {
                  const active = selectedCategory === cat.id && !selectedTagId;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => { setSelectedCategory(cat.id); setSelectedTagId(null); setPage(0); }}
                      className={cn(
                        "w-full flex items-center justify-between px-2.5 py-2 rounded-[10px] text-xs font-medium transition-colors cursor-pointer",
                        active
                          ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white font-semibold shadow-xs"
                          : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-white"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Layers size={14} className={active ? "text-zinc-900 dark:text-white shrink-0" : "text-zinc-400 shrink-0"} />
                        <span className="truncate">{cat.label}</span>
                      </div>
                      <span className={cn(
                        "text-[11px] font-mono tabular-nums font-bold",
                        active ? "text-zinc-900 dark:text-white" : "text-zinc-400"
                      )}>
                        {cat.count}
                      </span>
                    </button>
                  );
                })}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => { setSelectedClientId(null); setPage(0); }}
                  className={cn(
                    "w-full flex items-center justify-between px-2.5 py-2 rounded-[10px] text-xs font-medium transition-colors cursor-pointer",
                    selectedClientId === null
                      ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white font-semibold shadow-xs"
                      : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-white"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
<div className="w-5 h-5 rounded-[5px] bg-amber-400 text-zinc-950 flex items-center justify-center shrink-0">                
                      <List className="w-3 h-3 stroke-[2.5]" />
                    </div>
                    <span className="truncate">All clients</span>
                  </div>
                  <span className={cn(
                    "text-[11px] font-mono tabular-nums font-bold",
                    selectedClientId === null ? "text-zinc-900 dark:text-white" : "text-zinc-400"
                  )}>
                    {clients.length}
                  </span>
                </button>

                {filteredRailClients.map((client) => {
                  const active = selectedClientId === client.engagementId;
                  return (
                    <button
                      key={client.engagementId}
                      type="button"
                      data-testid={`rail-client-${client.engagementId}`}
                      onClick={() => { setSelectedClientId(client.engagementId); setPage(0); }}
                      className={cn(
                        "w-full flex items-center justify-between px-2.5 py-2 rounded-[10px] text-xs font-medium transition-colors cursor-pointer",
                        active
                          ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white font-semibold shadow-xs"
                          : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-white"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
<div className="w-5 h-5 rounded-[5px] bg-amber-400 text-zinc-950 flex items-center justify-center shrink-0 shadow-xs">                    
                          <List className="w-3 h-3 stroke-[2.5]" />
                        </div>
                        <span className="truncate">{client.buyer}</span>
                      </div>
                      {client.count !== undefined && client.count > 0 && (
                        <span className={cn(
                          "text-[11px] font-mono tabular-nums font-bold",
                          active ? "text-zinc-900 dark:text-white" : "text-zinc-400"
                        )}>
                          {client.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </>
            )}
          </div>

          {/* TAGS SECTION */}
          <div className="pt-2 border-t border-zinc-200/80 dark:border-sidebar-border/60 space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10.5px] font-bold text-zinc-500 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <TagIcon size={12} className="text-zinc-400" />
                Tags
              </span>
              <button
                type="button"
                onClick={() => setIsAddTagOpen((p) => !p)}
                className="p-1 rounded-md text-zinc-400 hover:text-zinc-800 dark:hover:text-white hover:bg-zinc-200/50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Create tag"
              >
                <Plus size={13} />
              </button>
            </div>

            {tags.length === 0 ? (
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 italic px-1 font-sans">No custom tags created yet.</p>
            ) : (
              <div className="space-y-1 max-h-[160px] overflow-y-auto [scrollbar-width:none]">
                {tags.map((tag) => {
                  const active = selectedTagId === tag.id;
                  const count = tagCounts[tag.id] ?? 0;
                  return (
                    <div key={tag.id} className="group relative flex items-center">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTagId(active ? null : tag.id);
                          setSelectedCategory(null);
                          setPage(0);
                        }}
                        className={cn(
                          "w-full flex items-center justify-between px-2.5 py-1.5 rounded-[10px] text-xs font-medium transition-colors cursor-pointer pr-6",
                          active
                            ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white font-semibold shadow-xs"
                            : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-white"
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs border border-black/10 dark:border-white/20"
                            style={{ backgroundColor: tag.colorHex }}
                          />
                          <span className="truncate font-semibold">{tag.name}</span>
                        </div>
                        <span className={cn(
                          "text-[11px] font-mono tabular-nums font-bold",
                          active ? "text-zinc-900 dark:text-white" : "text-zinc-400"
                        )}>
                          {count}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTag(tag.id)}
                        className="absolute right-1 opacity-0 group-hover:opacity-100 p-1 text-zinc-400 dark:text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 transition-opacity cursor-pointer"
                        title="Delete tag"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* TABLE AREA */}
        <div className="flex-1 flex flex-col min-w-0 bg-white/60 dark:bg-sidebar p-3 space-y-3">
          {/* TOOLBAR */}
          <div className="flex items-center gap-2 flex-wrap">
            <SegmentedTabs options={tabOptions} value={tab} onChange={handleTabChange} />
            <TableSearchInput value={search} onChange={(s) => { setSearch(s); setPage(0); }} placeholder={toolbarCopy.searchPlaceholder} className="w-[180px]" />
            <TimeRangeMenu value={timeRange} onChange={(r) => { setTimeRange(r); setPage(0); }} />
            <div className="ml-auto flex items-center gap-1.5">
              {tab !== "all" || search || timeRange !== "all" || activeChipIds.size > 0 || selectedTagId ? (
                <button
                  type="button"
                  onClick={() => { setTab("all"); setSearch(""); setTimeRange("all"); setActiveChipIds(new Set()); setSelectedTagId(null); setPage(0); }}
                  className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
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

          {/* ROWS CONTAINER */}
          {tab === "closed" ? (
            archiveLoading && archiveItems.length === 0 ? (
              <div className="flex-1 flex items-center justify-center py-12 text-xs font-mono text-zinc-400 dark:text-zinc-600">
                Loading closed items…
              </div>
            ) : archiveItems.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-center text-zinc-500 space-y-1">
                <p className="text-sm font-medium">Nothing closed yet</p>
                <p className="text-xs font-mono text-zinc-400 dark:text-zinc-600 max-w-xs mx-auto">
                  Approvals and blockers you decide on show up here — so you can double-check what you already acted on.
                </p>
              </div>
            ) : (
              <div className="flex-1 divide-y divide-zinc-100 dark:divide-sidebar-border border border-zinc-200/80 dark:border-sidebar-border rounded-xl overflow-hidden bg-white dark:bg-zinc-900/30 shadow-xs">
                {archiveItems.map((it) => (
                  <ClosedQueueRow key={it.id} item={it} />
                ))}
              </div>
            )
          ) : railView === "clients" && !selectedClientId ? (
            clients.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-center text-zinc-500 space-y-1">
                <p className="text-sm font-medium">{sharedToolbarCopy.noResultsTitle}</p>
                <p className="text-xs font-mono text-zinc-400 dark:text-zinc-600">{sharedToolbarCopy.noResultsSubtitle}</p>
              </div>
            ) : (
              <div className="flex-1 divide-y divide-zinc-100 dark:divide-sidebar-border border border-zinc-200/80 dark:border-sidebar-border rounded-xl overflow-hidden bg-white dark:bg-zinc-900/30 shadow-xs">
                {clients.map((client) => (
                  <button
                    key={client.engagementId}
                    type="button"
                    data-testid={`roster-row-${client.engagementId}`}
                    onClick={() => { setSelectedClientId(client.engagementId); setPage(0); }}
                    className="w-full flex items-center justify-between px-4 py-3 text-left text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
<div className="w-5 h-5 rounded-[5px] bg-amber-400 text-zinc-950 flex items-center justify-center shrink-0 shadow-xs">
                        <List className="w-3 h-3 stroke-[2.5]" />
                      </div>
                      <span className="truncate font-semibold">{client.buyer}</span>
                    </div>
                    <span className="text-[11px] font-mono text-zinc-400 font-bold tabular-nums">
                      {rosterCounts.get(client.engagementId) ?? 0}
                    </span>
                  </button>
                ))}
              </div>
            )
          ) : visibleItems.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-center text-zinc-500 space-y-1">
              <p className="text-sm font-medium">{sharedToolbarCopy.noResultsTitle}</p>
              <p className="text-xs font-mono text-zinc-400 dark:text-zinc-600">{sharedToolbarCopy.noResultsSubtitle}</p>
            </div>
          ) : (
            <div className="flex-1 divide-y divide-zinc-100 dark:divide-sidebar-border border border-zinc-200/80 dark:border-sidebar-border rounded-xl overflow-hidden bg-white dark:bg-zinc-900/30 shadow-xs">
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

          {/* PAGINATION — not shown on the Closed tab, which is a flat, non-paginated look-back */}
          {tab !== "closed" && (
          <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-sidebar-border text-xs text-zinc-500 dark:text-zinc-400">
            {pageSize === 5 && queueGroups.length > 5 ? (
              <button
                type="button"
                onClick={() => setSavedView((p) => ({ ...p, pageSize: 10 }))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-zinc-800/80 hover:bg-zinc-50 dark:hover:bg-zinc-700/80 text-zinc-800 dark:text-zinc-200 border border-zinc-200/80 dark:border-zinc-700/60 transition-colors cursor-pointer shadow-2xs"
              >
                <span>View more</span>
                <span className="font-mono text-[11px] text-zinc-400">({queueGroups.length - 5} remaining)</span>
                <ChevronDown size={13} className="text-zinc-400" />
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
                        ? "border-zinc-300 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-200 font-bold"
                        : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
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
                  className="px-2 py-1 rounded border border-zinc-200 dark:border-sidebar-border bg-white dark:bg-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 cursor-pointer shadow-2xs"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => setPage(Math.min(pageCount - 1, clampedPage + 1))}
                  disabled={clampedPage >= pageCount - 1}
                  className="px-2 py-1 rounded border border-zinc-200 dark:border-sidebar-border bg-white dark:bg-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 cursor-pointer shadow-2xs"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
          )}
        </div>
      </div>

      {/* CREATE TAG MODAL */}
      {isAddTagOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="absolute inset-0" onClick={() => setIsAddTagOpen(false)} />

          <div className="relative z-10 w-full max-w-sm max-h-[90vh] overflow-y-auto p-4 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-2xl text-xs space-y-3.5 font-sans [scrollbar-width:none]">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/80 pb-2.5">
              <span className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">Create New Tag</span>
              <button
                type="button"
                onClick={() => setIsAddTagOpen(false)}
                className="p-1 rounded-lg text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Tag Name</label>
              <input
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="e.g. alerts"
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-700 text-xs"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1 relative">
                <label className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Skill Target</label>
                <button
                  type="button"
                  onClick={() => { setIsSkillDropdownOpen((p) => !p); setIsCategoryDropdownOpen(false); }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-800 dark:text-zinc-300 text-[11px] hover:bg-zinc-100 dark:hover:bg-zinc-800/80 cursor-pointer"
                >
                  <span className="truncate">{skillTargetLabels[newTagTargetSkill]}</span>
                  <ChevronDown size={11} className="text-zinc-400 dark:text-zinc-500 shrink-0" />
                </button>

                {isSkillDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 w-full z-50 p-1 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl space-y-0.5">
                    {Object.entries(skillTargetLabels).map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => { setNewTagTargetSkill(k); setIsSkillDropdownOpen(false); }}
                        className={cn("w-full text-left px-2 py-1 rounded-lg text-[11px] cursor-pointer", newTagTargetSkill === k ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white font-semibold" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800/50")}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1 relative">
                <label className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Category</label>
                <button
                  type="button"
                  onClick={() => { setIsCategoryDropdownOpen((p) => !p); setIsSkillDropdownOpen(false); }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-800 dark:text-zinc-300 text-[11px] hover:bg-zinc-100 dark:hover:bg-zinc-800/80 cursor-pointer"
                >
                  <span className="truncate">{categoryTargetLabels[newTagTargetCategory]}</span>
                  <ChevronDown size={11} className="text-zinc-400 dark:text-zinc-500 shrink-0" />
                </button>

                {isCategoryDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 w-full z-50 p-1 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl space-y-0.5">
                    {Object.entries(categoryTargetLabels).map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => { setNewTagTargetCategory(k); setIsCategoryDropdownOpen(false); }}
                        className={cn("w-full text-left px-2 py-1 rounded-lg text-[11px] cursor-pointer", newTagTargetCategory === k ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white font-semibold" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800/50")}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Select Color</label>
              <div className="grid grid-cols-6 gap-2 pt-1 justify-items-center">
                {TAG_SWATCHES.map((swatch) => {
                  const selected = newTagColor === swatch.hex;
                  return (
                    <button
                      key={swatch.hex}
                      type="button"
                      onClick={() => setNewTagColor(swatch.hex)}
                      className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110 cursor-pointer relative",
                        swatch.hasBorder ? "border border-zinc-300 dark:border-zinc-700" : ""
                      )}
                      style={{ backgroundColor: swatch.hex }}
                      title={swatch.label}
                    >
                      {selected && (
                        <Check
                          size={14}
                          className={swatch.darkCheck ? "text-zinc-950 font-bold" : "text-white font-bold"}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleCreateTag}
                disabled={!newTagName.trim()}
                className="w-full py-2 text-xs font-semibold rounded-xl bg-amber-400 text-white dark:text-zinc-950 hover:bg-amber-500 disabled:opacity-40 cursor-pointer transition-colors shadow-xs"
              >
                Create Tag
              </button>
            </div>
          </div>
        </div>
      )}

      <QueueFixDrawer
        isOpen={!!activeFix}
        engagementId={activeFix?.engagementId ?? null}
        type={activeFix?.type ?? null}
        section={activeFix?.section ?? null}
        onClose={() => setActiveFix(null)}
        onSuccess={refreshNow}
      />
    </div>
  );
}