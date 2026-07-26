// src/lib/queue.ts
//
// The "Queue" is not a new table — it's a read-time merge of three
// human-in-the-loop systems that already existed with full mutation
// endpoints but zero UI surfacing them anywhere:
//
//   pending_actions  (GET /api/actions,  POST /api/actions/[id]/review)
//   human_blockers   (GET /api/blockers, POST /api/blockers/[id]/resolve)
//   notifications    (GET /api/notifications, POST /api/notifications/[id]/read)
//
// This file is the single place that decides how a row from each of those
// tables maps onto one shared "queue item" shape, and how the combined
// list is prioritized. Both the /api/queue route and the sidebar badge
// count import from here so they can never drift out of sync with each
// other or with what the panel's own polling shows.
//
// Every query below joins through `engagements` and filters on
// `engagements.whopUserId`, matching the tenant-scoping pattern already
// used by GET /api/actions and GET /api/blockers (see the comment on the
// latter — it exists specifically to not repeat the unscoped-query
// mistake this codebase already found and fixed once).

import { db } from "@/lib/db";
import { pendingActions, humanBlockers, notifications, engagements, type EngagementStack } from "@/models/schema";
import { and, eq, desc } from "drizzle-orm";
import { ACTION_TYPE_LABELS, BLOCKER_TYPE_LABELS, bookingPlatformLabel } from "@/lib/copy";
import { needsWebhookSetupNudge } from "@/lib/booking-sync-status";

export type QueueCategory = "approve" | "action_needed" | "alert" | "fyi";
export type QueueSource = "action" | "blocker" | "notification" | "sync_setup";

export interface QueueItem {
  id: string;
  source: QueueSource;
  category: QueueCategory;
  title: string;
  subtitle: string;
  engagementId: string | null;
  buyer: string | null;
  runId: string | null;
  createdAt: string; // ISO
}

const CATEGORY_PRIORITY: Record<QueueCategory, number> = {
  approve: 0,
  action_needed: 1,
  alert: 2,
  fyi: 3,
};

/**
 * Every open/pending/unread item across the tenant's engagements, ranked
 * "most in need of a human, longest-waiting first" — approvals and open
 * blockers (things a run is durably paused on) always outrank alerts and
 * FYIs (things nothing is waiting on).
 */
/**
 * Synthesized, not stored — read-time derived from each engagement's
 * stack via needsWebhookSetupNudge (src/lib/booking-sync-status.ts), the
 * same predicate the Booking Sync status card uses. No new table, and it
 * self-heals the instant a buyer flips to webhook mode or dismisses it:
 * there's nothing to clean up on either transition, unlike a real
 * pendingActions/humanBlockers row would need.
 */
function syncSetupQueueItems(
  rows: { engagementId: string; buyer: string; stack: unknown }[]
): QueueItem[] {
  const items: QueueItem[] = [];
  for (const row of rows) {
    const stack = row.stack as EngagementStack | null;
    if (!needsWebhookSetupNudge(stack)) continue;
    items.push({
      id: `sync-setup:${row.engagementId}`,
      source: "sync_setup",
      category: "action_needed",
      title: `Add webhook to ${bookingPlatformLabel(stack?.booking_platform)}`,
      subtitle: `${row.buyer} · currently on auto-polling`,
      engagementId: row.engagementId,
      buyer: row.buyer,
      runId: null,
      // Nothing is actually blocked on this (unlike a real human_blocker
      // pausing a run), so it deliberately sorts to the back of the
      // action_needed tier rather than outranking genuine blockers —
      // "now" sorts last under the ascending-createdAt tiebreak below.
      createdAt: new Date().toISOString(),
    });
  }
  return items;
}

export async function getQueueItems(whopUserId: string): Promise<QueueItem[]> {
  const [actionRows, blockerRows, notificationRows, engagementStackRows] = await Promise.all([
    db
      .select({
        id: pendingActions.id,
        engagementId: pendingActions.engagementId,
        buyer: engagements.buyer,
        actionType: pendingActions.actionType,
        createdAt: pendingActions.createdAt,
      })
      .from(pendingActions)
      .innerJoin(engagements, eq(pendingActions.engagementId, engagements.engagementId))
      .where(and(eq(engagements.whopUserId, whopUserId), eq(pendingActions.status, "pending"))),

    db
      .select({
        id: humanBlockers.id,
        engagementId: humanBlockers.engagementId,
        buyer: engagements.buyer,
        blockerType: humanBlockers.blockerType,
        description: humanBlockers.description,
        skillName: humanBlockers.skillName,
        createdAt: humanBlockers.createdAt,
      })
      .from(humanBlockers)
      .innerJoin(engagements, eq(humanBlockers.engagementId, engagements.engagementId))
      .where(and(eq(engagements.whopUserId, whopUserId), eq(humanBlockers.status, "open"))),

    db
      .select()
      .from(notifications)
      .where(and(eq(notifications.whopUserId, whopUserId), eq(notifications.read, false)))
      .orderBy(desc(notifications.createdAt))
      .limit(50),

    db
      .select({ engagementId: engagements.engagementId, buyer: engagements.buyer, stack: engagements.stack })
      .from(engagements)
      .where(eq(engagements.whopUserId, whopUserId)),
  ]);

  const items: QueueItem[] = [
    ...actionRows.map((a): QueueItem => ({
      id: a.id,
      source: "action",
      category: "approve",
      title: ACTION_TYPE_LABELS[a.actionType] ?? a.actionType,
      subtitle: a.buyer,
      engagementId: a.engagementId,
      buyer: a.buyer,
      runId: null,
      createdAt: a.createdAt.toISOString(),
    })),
    ...blockerRows.map((b): QueueItem => ({
      id: b.id,
      source: "blocker",
      category: "action_needed",
      title: BLOCKER_TYPE_LABELS[b.blockerType] ?? b.blockerType,
      subtitle: b.description || `${b.buyer} · ${b.skillName}`,
      engagementId: b.engagementId,
      buyer: b.buyer,
      runId: null,
      createdAt: b.createdAt.toISOString(),
    })),
    ...notificationRows.map((n): QueueItem => ({
      id: n.id,
      source: "notification",
      category: n.severity === "critical" || n.severity === "warning" ? "alert" : "fyi",
      title: n.title,
      subtitle: n.body,
      engagementId: n.engagementId,
      buyer: null,
      runId: n.runId,
      createdAt: n.createdAt.toISOString(),
    })),
    ...syncSetupQueueItems(engagementStackRows),
  ];

  items.sort((x, y) => {
    const p = CATEGORY_PRIORITY[x.category] - CATEGORY_PRIORITY[y.category];
    if (p !== 0) return p;
    return new Date(x.createdAt).getTime() - new Date(y.createdAt).getTime();
  });

  return items;
}

/**
 * Cheap count-only version for the sidebar badge, which renders on every
 * dashboard navigation and shouldn't pay for full row hydration. Counts
 * only the two categories that actually need a human to unblock something
 * (approve + action_needed) — alerts/FYIs already have their own unread
 * count on the notification bell, so folding them in here too would just
 * double-count the same number in two places on screen at once.
 */
export async function getQueueActionableCount(whopUserId: string): Promise<number> {
  const [pendingCount, blockerCount, engagementStackRows] = await Promise.all([
    db
      .select({ id: pendingActions.id })
      .from(pendingActions)
      .innerJoin(engagements, eq(pendingActions.engagementId, engagements.engagementId))
      .where(and(eq(engagements.whopUserId, whopUserId), eq(pendingActions.status, "pending"))),
    db
      .select({ id: humanBlockers.id })
      .from(humanBlockers)
      .innerJoin(engagements, eq(humanBlockers.engagementId, engagements.engagementId))
      .where(and(eq(engagements.whopUserId, whopUserId), eq(humanBlockers.status, "open"))),
    db
      .select({ stack: engagements.stack })
      .from(engagements)
      .where(eq(engagements.whopUserId, whopUserId)),
  ]);

  const syncSetupCount = engagementStackRows.filter((r) =>
    needsWebhookSetupNudge(r.stack as EngagementStack | null)
  ).length;

  return pendingCount.length + blockerCount.length + syncSetupCount;
}
