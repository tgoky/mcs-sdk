// src/lib/unified-activity.ts
//
// Merges the two things dashboard/page.tsx used to render as separate,
// stacked sections — the Queue (pending approvals/action items from
// getQueueItems) and the Live Execution Feed (recent skillRuns) — into
// one sorted, de-duplicated list. See UnifiedActivityPanel for the UI
// this feeds.
//
// Pure merge, no DB access of its own: both inputs are already fetched by
// the caller (dashboard/page.tsx already needs queueItems for
// OverviewStatsPanel, and already needs a recent-runs query for what used
// to be the feed), so this only combines and sorts what it's handed.
//
// The one real bug this fixes, not just a layout change: a failed run
// that got a confident auto-diagnosis becomes a "run_failure" queue item
// (see queue.ts's failedRunQueueItems) — id'd as `run-failure:${run.id}`
// but carrying that same run's id in its own `runId` field. That same run
// was ALSO showing up as a second, plainer row in the Live Execution Feed
// (the feed's dashboard query has no status filter). Same event, twice,
// on the same page. dedupe() below drops the feed-side duplicate and
// keeps only the richer, actionable queue-item version.

import type { QueueItem } from "@/lib/queue";
import { anySkillDisplayName } from "@/lib/any-skill";
import { PRODUCT_IDS, PRODUCT_SKILL_IDS, type ProductId } from "@/lib/product-catalog";
import { workerIdForSkill, workerCategoryForSkill } from "@/lib/worker-skill-hierarchy";
import { WORKER_IDS, WORKER_CATEGORY_LIST, type WorkerId, type WorkerCategory } from "@/lib/worker-registry";

export type UnifiedActivityStatus = "needs_action" | "running" | "completed" | "other";

/** Matches dashboard/page.tsx's `recentRuns` shape after its own mapping
 * (steps -> subjectLabel, dates -> ISO strings) — kept as a local type
 * rather than importing live-execution-feed.tsx's unexported SkillRun so
 * this file has no UI-layer dependency. */
export interface UnifiedRunInput {
  id: string;
  skillName: string;
  status: string;
  phase: string | null;
  startedAt: string;
  engagementId: string | null;
  buyerName: string | null;
  engagementPausedAt: string | null;
  errorMessage: string | null;
  subjectLabel: string | null;
}

export interface UnifiedActivityItem {
  id: string;
  kind: "queue" | "run";
  status: UnifiedActivityStatus;
  title: string;
  subtitle: string;
  engagementId: string | null;
  buyer: string | null;
  skillName: string | null;
  /** Resolved once here from skillName via worker-skill-hierarchy.ts —
   * the worker this item's skill belongs under (a worker's own runs map
   * to themselves; a chat sub-skill's run maps to its parent worker). */
  workerId: WorkerId | null;
  /** This item's WorkerCategory (Setup / Monitoring / Outreach &
   * Sequences / Analysis & Briefing / Crisis & Recovery) — the rail's "By
   * Category" grouping reads this directly rather than re-deriving it. */
  category: WorkerCategory | null;
  runId: string | null;
  /** ISO timestamp used for sorting and display. */
  timestamp: string;
  href: string;
  engagementPausedAt?: string | null;
  /** Present only for kind "queue" — full fidelity for the detail panel
   * and for wiring the exact same action buttons queue-panel.tsx uses
   * (via useQueueItemActions / getRepairAction, both keyed off this). */
  queueItem?: QueueItem;
  /** Present only for kind "run". */
  run?: {
    status: string;
    phase: string | null;
    errorMessage: string | null;
    subjectLabel: string | null;
  };
}

export interface UnifiedActivityCounts {
  needsAction: number;
  running: number;
  completed: number;
  total: number;
  byProduct: Record<ProductId, number>;
  /** Per-worker item count, for the rail's "By Worker" list — every
   * WorkerId is present (0 for a worker with no activity), the rail
   * itself decides which of those to actually show (only this
   * engagement's enabled workers). */
  byWorker: Record<WorkerId, number>;
  byCategory: Record<WorkerCategory, number>;
}

const STATUS_PRIORITY: Record<UnifiedActivityStatus, number> = {
  needs_action: 0,
  running: 1,
  completed: 2,
  other: 3,
};

function statusForRun(status: string): UnifiedActivityStatus {
  const s = status.toLowerCase();
  if (s === "running" || s === "in_progress") return "running";
  if (s === "success" || s === "completed") return "completed";
  if (s === "failed" || s === "error" || s === "timed_out") return "needs_action";
  return "other"; // cancelled, skipped
}

function statusForQueueCategory(category: QueueItem["category"]): UnifiedActivityStatus {
  return category === "fyi" ? "other" : "needs_action";
}

function productForSkill(skillName: string | null): ProductId | null {
  if (!skillName) return null;
  for (const productId of PRODUCT_IDS) {
    if ((PRODUCT_SKILL_IDS[productId] as readonly string[]).includes(skillName)) return productId;
  }
  return null;
}

export function mergeUnifiedActivity(
  queueItems: QueueItem[],
  runs: UnifiedRunInput[]
): { items: UnifiedActivityItem[]; counts: UnifiedActivityCounts } {
  // See file header — a run this specific already has a richer queue-item
  // representation shouldn't also render as a second, plainer feed row.
  const queueRunIds = new Set(queueItems.map((q) => q.runId).filter((id): id is string => !!id));

  const queueAsItems: UnifiedActivityItem[] = queueItems.map((q) => ({
    id: `queue:${q.id}`,
    kind: "queue",
    status: statusForQueueCategory(q.category),
    title: q.title,
    subtitle: q.subtitle,
    engagementId: q.engagementId,
    buyer: q.buyer,
    skillName: q.skillName ?? null,
    workerId: workerIdForSkill(q.skillName),
    category: workerCategoryForSkill(q.skillName),
    runId: q.runId,
    timestamp: q.createdAt,
    href: q.fixHref ?? (q.engagementId ? `/dashboard/engagements/${q.engagementId}` : "/dashboard/queue"),
    engagementPausedAt: q.engagementPausedAt,
    queueItem: q,
  }));

  const runAsItems: UnifiedActivityItem[] = runs
    .filter((r) => !queueRunIds.has(r.id))
    .map((r) => ({
      id: `run:${r.id}`,
      kind: "run",
      status: statusForRun(r.status),
      title: anySkillDisplayName(r.skillName),
      subtitle: r.subjectLabel ?? r.errorMessage ?? "",
      engagementId: r.engagementId,
      buyer: r.buyerName,
      skillName: r.skillName,
      workerId: workerIdForSkill(r.skillName),
      category: workerCategoryForSkill(r.skillName),
      runId: r.id,
      timestamp: r.startedAt,
      href: `/dashboard/runs/${r.id}`,
      engagementPausedAt: r.engagementPausedAt,
      run: {
        status: r.status,
        phase: r.phase,
        errorMessage: r.errorMessage,
        subjectLabel: r.subjectLabel,
      },
    }));

  const items = [...queueAsItems, ...runAsItems].sort((a, b) => {
    const priorityDelta = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
    if (priorityDelta !== 0) return priorityDelta;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  const byProduct = Object.fromEntries(PRODUCT_IDS.map((id) => [id, 0])) as Record<ProductId, number>;
  const byWorker = Object.fromEntries(WORKER_IDS.map((id) => [id, 0])) as Record<WorkerId, number>;
  const byCategory = Object.fromEntries(WORKER_CATEGORY_LIST.map((c) => [c, 0])) as Record<WorkerCategory, number>;
  for (const item of items) {
    const productId = productForSkill(item.skillName);
    if (productId) byProduct[productId] += 1;
    if (item.workerId) byWorker[item.workerId] += 1;
    if (item.category) byCategory[item.category] += 1;
  }

  const counts: UnifiedActivityCounts = {
    needsAction: items.filter((i) => i.status === "needs_action").length,
    running: items.filter((i) => i.status === "running").length,
    completed: items.filter((i) => i.status === "completed").length,
    total: items.length,
    byProduct,
    byWorker,
    byCategory,
  };

  return { items, counts };
}
