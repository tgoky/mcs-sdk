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
import {
  pendingActions,
  humanBlockers,
  notifications,
  engagements,
  skillRuns,
  engagementSkills,
  type EngagementStack,
} from "@/models/schema";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { ACTION_TYPE_LABELS, BLOCKER_TYPE_LABELS, bookingPlatformLabel } from "@/lib/copy";
import { anySkillDisplayName as skillDisplayName } from "@/lib/any-skill";
import { needsWebhookSetupNudge } from "@/lib/booking-sync-status";
import { classifyRunError, type StackSection } from "@/lib/error-classification";

/**
 * The only two skills src/app/api/skill-runs/trigger/route.ts currently
 * accepts for a manual re-trigger (see lib/quick-actions.ts). A failed run
 * on any other skill can still be diagnosed and linked to the right
 * settings section, but "Run again" specifically isn't offered for it —
 * widen this the day the trigger route grows support for the rest.
 */
const RETRIGGERABLE_SKILLS = new Set(["pre-call-read", "leak-map"]);

export type QueueCategory = "approve" | "action_needed" | "alert" | "fyi";
export type QueueSource = "action" | "blocker" | "notification" | "sync_setup" | "run_failure";

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
  /**
   * Only set for source "run_failure" — where in "Edit stack settings" the
   * likely-wrong field lives, e.g. "/dashboard/engagements/eng_123?fixSection=hosting#stack-settings".
   * Distinct from the generic engagement-page link every other source
   * falls back to, since this one should land the buyer already scrolled
   * to (and with) the right section open instead of a blank engagement page.
   */
  fixHref?: string;
  /** Only set for source "run_failure" — the raw skill id (e.g. "pre-call-read"), needed by the dismiss-run-failure endpoint. */
  skillName?: string;
  /** ISO timestamp if this item's engagement currently has automations paused, else null. Absent (not just null) when the item has no engagementId. */
  engagementPausedAt?: string | null;
  /** Only set for source "run_failure" — true when classifyRunError() determined this was a 401/403, i.e. the fix is re-entering a credential rather than a stack-settings field. Powers the "Credential issues" toolbar chip. */
  isCredentialIssue?: boolean;
  /** Only set for source "run_failure" — which "Edit stack settings" section the failure belongs to (booking/email/sms/hosting/ad_data). Powers the "Platform area" toolbar chip group. */
  diagnosisSection?: StackSection;
  /**
   * Only meaningful for source "run_failure" on one of RETRIGGERABLE_SKILLS
   * (pre-call-read, leak-map) — whether this skill is currently enabled for
   * this client per engagementSkills. Undefined for every other item and
   * for non-retriggerable skills, where it isn't relevant. Powers whether
   * the row/menu offer "Run again" — see getRepairAction in
   * lib/queue-repair-action.ts, which must not offer a re-trigger for a
   * skill the buyer explicitly turned off for this client.
   */
  skillEnabledForClient?: boolean;
  /**
   * Only set for source "action" items whose payload carries _reason —
   * currently only triggerNoShowWinBack's auto_sweep path (see its doc in
   * outcome-resolution.ts). A blunt Approve/Reject is the wrong shape for
   * "did this person actually no-show": approving is fine, but rejecting
   * could mean they showed, they rescheduled, or the reviewer just isn't
   * sure — three different real outcomes a plain reject couldn't
   * distinguish and didn't record. When this is set, the panel offers
   * those specific resolutions instead of a binary decision, and each one
   * (other than "not sure") logs the real outcome via the general
   * per-booking endpoint, not just a silent status flip.
   */
  sweepNoShowReview?: { bookingId: string; prospectEmail: string } | null;
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
  rows: { engagementId: string; buyer: string; stack: unknown; createdAt: Date }[]
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
      // Anchored to the engagement's real creation timestamp instead of
      // synthesizing a fresh "now" on every read/poll. This ensures the
      // item's age is stable and meaningful — a client added yesterday
      // shows "1d ago" consistently, not "just now" on every visit.
      createdAt: row.createdAt.toISOString(),
    });
  }
  return items;
}

/**
 * The most recent run per (engagement, skill) that's currently "failed",
 * classified via error-classification.ts into an actionable diagnosis —
 * turning "GHL appointments fetch failed [422]" from a dead-end red log
 * line into a queue item that says what's wrong and links straight to the
 * field that's probably wrong.
 *
 * Synthesized at read time, same as syncSetupQueueItems above and for the
 * same reasons: no new table, and it self-heals for free — the moment the
 * next run for that (engagement, skill) succeeds, its errorMessage/status
 * is gone from the "most recent" row and this simply stops generating an
 * item, no cleanup step needed. Dismissal (stack.failed_run_dismissals) is
 * the one piece of state this does need, since "the buyer already knows
 * and will deal with it later" can't be inferred from run history alone —
 * see the schema.ts comment on that field for how it stays self-healing
 * too (a dismissal only suppresses runs at-or-before the timestamp it was
 * recorded against; a newer failure for the same skill shows up again).
 */
async function failedRunQueueItems(
  engagementRows: { engagementId: string; buyer: string; stack: unknown }[]
): Promise<QueueItem[]> {
  if (engagementRows.length === 0) return [];
  const engagementIds = engagementRows.map((r) => r.engagementId);
  const stackByEngagement = new Map(engagementRows.map((r) => [r.engagementId, r.stack as EngagementStack | null]));
  const buyerByEngagement = new Map(engagementRows.map((r) => [r.engagementId, r.buyer]));

  // Ordered desc so the first row seen per (engagementId, skillName) pair
  // below is that pair's most recent run — same dedupe-in-JS approach
  // getModuleClientSummaries (module-overview.ts) already uses for the
  // identical "most recent per group" problem. Capped rather than
  // unbounded: only the last 500 failures across the tenant are
  // considered, which comfortably covers "is this skill currently broken
  // for this client" without an unbounded table scan as history grows.
  const recentFailures = await db
    .select({
      id: skillRuns.id,
      engagementId: skillRuns.engagementId,
      skillName: skillRuns.skillName,
      errorMessage: skillRuns.errorMessage,
      completedAt: skillRuns.completedAt,
      startedAt: skillRuns.startedAt,
    })
    .from(skillRuns)
    .where(and(eq(skillRuns.status, "failed"), inArray(skillRuns.engagementId, engagementIds)))
    .orderBy(desc(skillRuns.startedAt))
    .limit(500);

  // One batched lookup for every (engagement, retriggerable skill) pair
  // that could end up as a run_failure item below, instead of an
  // isSkillEnabledForEngagement() round trip per item. Only rows that
  // explicitly disable a skill are stored (see engagement-skills.ts), so
  // absence from this set means enabled — matching that helper's own
  // "no row means enabled" default.
  const disabledPairs = new Set(
    (
      await db
        .select({ engagementId: engagementSkills.engagementId, skillId: engagementSkills.skillId })
        .from(engagementSkills)
        .where(
          and(
            inArray(engagementSkills.engagementId, engagementIds),
            inArray(engagementSkills.skillId, [...RETRIGGERABLE_SKILLS]),
            eq(engagementSkills.enabled, false)
          )
        )
    ).map((r) => `${r.engagementId}:${r.skillId}`)
  );

  const seen = new Set<string>();
  const items: QueueItem[] = [];

  for (const run of recentFailures) {
    const key = `${run.engagementId}:${run.skillName}`;
    if (seen.has(key)) continue; // already saw this pair's more-recent run
    seen.add(key);

    const diagnosis = classifyRunError(run.errorMessage);
    if (!diagnosis) continue; // no confident fix — leave it to the existing notification instead

    const stack = stackByEngagement.get(run.engagementId) ?? null;
    const dismissedAt = stack?.failed_run_dismissals?.[run.skillName];
    const runCompletedAt = (run.completedAt ?? run.startedAt).toISOString();
    if (dismissedAt && dismissedAt >= runCompletedAt) continue; // dismissed, and no newer failure since

    const buyer = buyerByEngagement.get(run.engagementId) ?? "";
    items.push({
      id: `run-failure:${run.id}`,
      source: "run_failure",
      category: "action_needed",
      title: diagnosis.title,
      subtitle: `${skillDisplayName(run.skillName)} · ${diagnosis.explanation}`,
      engagementId: run.engagementId,
      buyer,
      runId: run.id,
      createdAt: runCompletedAt,
      fixHref: diagnosis.isCredentialIssue
        ? `/dashboard/engagements/${run.engagementId}?fixCredential=1#update-credentials`
        : `/dashboard/engagements/${run.engagementId}?fixSection=${diagnosis.section}#stack-settings`,
      skillName: run.skillName,
      isCredentialIssue: diagnosis.isCredentialIssue,
      diagnosisSection: diagnosis.section,
      skillEnabledForClient: RETRIGGERABLE_SKILLS.has(run.skillName)
        ? !disabledPairs.has(`${run.engagementId}:${run.skillName}`)
        : undefined,
    });
  }

  return items;
}

export async function getQueueItems(
  whopUserId: string,
  workspaceId: string,
  options?: { skillIds?: readonly string[] }
): Promise<QueueItem[]> {
  const [actionRows, blockerRows, notificationRows, engagementStackRows] = await Promise.all([
    db
      .select({
        id: pendingActions.id,
        engagementId: pendingActions.engagementId,
        buyer: engagements.buyer,
        actionType: pendingActions.actionType,
        createdAt: pendingActions.createdAt,
        // Assumed-no-show sweep false-positive fix — the panel used to
        // show every pending action as a bare action-type label with the
        // buyer's name underneath, no different for a real
        // platform-reported cancellation an operator opted into gating
        // vs. a sweep's own inference from missing evidence. Selecting
        // payload lets the subtitle below surface the actual reasoning
        // (see outcome-resolution.ts's sweepReason) when the queuing
        // call site provided one, instead of the operator having to
        // click into a raw review endpoint to find out why something
        // needs their attention.
        payload: pendingActions.payload,
      })
      .from(pendingActions)
      .innerJoin(engagements, eq(pendingActions.engagementId, engagements.engagementId))
      .where(
        and(
          eq(engagements.whopUserId, whopUserId),
          eq(engagements.workspaceId, workspaceId),
          eq(pendingActions.status, "pending"),
          // A soft-deleted/offboarded client's leftover pending actions
          // shouldn't keep showing up in the Queue panel.
          isNull(engagements.deletedAt)
        )
      ),

    db
      .select({
        id: humanBlockers.id,
        engagementId: humanBlockers.engagementId,
        buyer: engagements.buyer,
        blockerType: humanBlockers.blockerType,
        description: humanBlockers.description,
        skillName: humanBlockers.skillName,
        createdAt: humanBlockers.createdAt,
        // runId was being persisted by createBlocker() but silently
        // dropped here — the mapper below hardcoded null. Selecting it
        // lets blocker items link straight to /dashboard/runs/[runId]
        // instead of falling back to the generic engagement page.
        runId: humanBlockers.runId,
      })
      .from(humanBlockers)
      .innerJoin(engagements, eq(humanBlockers.engagementId, engagements.engagementId))
      .where(
        and(
          eq(engagements.whopUserId, whopUserId),
          eq(engagements.workspaceId, workspaceId),
          eq(humanBlockers.status, "open"),
          isNull(engagements.deletedAt)
        )
      ),

    db
      .select()
      .from(notifications)
      .where(and(eq(notifications.whopUserId, whopUserId), eq(notifications.read, false)))
      .orderBy(desc(notifications.createdAt))
      .limit(50),

    db
      .select({
        engagementId: engagements.engagementId,
        buyer: engagements.buyer,
        stack: engagements.stack,
        pausedAt: engagements.pausedAt,
        createdAt: engagements.createdAt,
      })
      .from(engagements)
      .where(
        and(
          eq(engagements.whopUserId, whopUserId),
          eq(engagements.workspaceId, workspaceId),
          isNull(engagements.deletedAt)
        )
      ),
  ]);

  // Notifications aren't tagged with a workspace column of their own — a
  // global one (engagementId null, e.g. an account-level alert) always
  // shows, an engagement-scoped one only shows if that engagement belongs
  // to the current workspace's already-workspace-filtered roster above.
  const workspaceEngagementIds = new Set(engagementStackRows.map((r) => r.engagementId));
  const scopedNotificationRows = notificationRows.filter(
    (n) => !n.engagementId || workspaceEngagementIds.has(n.engagementId)
  );

  const pausedByEngagement = new Map(
    engagementStackRows.map((r) => [r.engagementId, r.pausedAt ? r.pausedAt.toISOString() : null])
  );

  const failureItems = await failedRunQueueItems(engagementStackRows);

  const items: QueueItem[] = [
    ...actionRows.map((a): QueueItem => {
      const payload = a.payload as {
        _reason?: string;
        _title?: string;
        bookingPayload?: { _bookingId?: string; email?: string };
      } | null;
      const reason = payload?._reason;
      const bookingId = payload?.bookingPayload?._bookingId;
      const prospectEmail = payload?.bookingPayload?.email;
      return {
        id: a.id,
        source: "action",
        category: "approve",
        // Same _title override approval-gate.ts's Slack/email title uses
        // — otherwise a reviewer sees the correct, specific reason as the
        // subtitle under a generic, mechanism-describing title above it.
        title: payload?._title ?? ACTION_TYPE_LABELS[a.actionType] ?? a.actionType,
        subtitle: reason ?? a.buyer,
        engagementId: a.engagementId,
        buyer: a.buyer,
        runId: null,
        createdAt: a.createdAt.toISOString(),
        sweepNoShowReview: reason && bookingId && prospectEmail ? { bookingId, prospectEmail } : null,
      };
    }),
    ...blockerRows.map((b): QueueItem => ({
      id: b.id,
      source: "blocker",
      category: "action_needed",
      title: BLOCKER_TYPE_LABELS[b.blockerType] ?? b.blockerType,
      subtitle: b.description || (b.skillName ? `${b.buyer} · ${skillDisplayName(b.skillName)}` : b.buyer),
      engagementId: b.engagementId,
      buyer: b.buyer,
      // Was hardcoded to null — the real runId was sitting in the DB
      // the whole time, just never selected/passed through.
      runId: b.runId ?? null,
      skillName: b.skillName ?? undefined,
      createdAt: b.createdAt.toISOString(),
    })),
    ...scopedNotificationRows.map((n): QueueItem => ({
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
    ...failureItems,
  ].map((item) => ({
    ...item,
    engagementPausedAt: item.engagementId ? pausedByEngagement.get(item.engagementId) ?? null : null,
  }));

  // Product-scoped queues only retain items traceable to a skill in that
  // product. Notifications carry a run id rather than a skill name, so
  // resolve those ids once instead of guessing from copy or client names.
  const allowedSkillIds = options?.skillIds;
  if (allowedSkillIds && allowedSkillIds.length > 0) {
    const runIds = items.flatMap((item) => (item.runId ? [item.runId] : []));
    const runSkillById = new Map(
      runIds.length
        ? (await db
            .select({ id: skillRuns.id, skillName: skillRuns.skillName })
            .from(skillRuns)
            .where(inArray(skillRuns.id, runIds))).map((row) => [row.id, row.skillName])
        : []
    );
    const allowed = new Set(allowedSkillIds);
    const scopedItems = items.filter((item) => allowed.has(item.skillName ?? runSkillById.get(item.runId ?? "") ?? ""));
    items.length = 0;
    items.push(...scopedItems);
  }

  items.sort((x, y) => {
    const p = CATEGORY_PRIORITY[x.category] - CATEGORY_PRIORITY[y.category];
    if (p !== 0) return p;
    return new Date(x.createdAt).getTime() - new Date(y.createdAt).getTime();
  });

  return items;
}

/**
 * "What did I already act on" — the archive view of the Queue panel.
 *
 * Not a new table: pending_actions and human_blockers never delete a row
 * on decision/resolution, they just flip `status` and stamp who/when —
 * see decidePendingAction() in approval-gate.ts and the resolve route in
 * api/blockers/[id]/resolve. This reads exactly those already-durable
 * rows back out, so "show me what I closed" needed zero schema changes
 * and can never drift from what actually happened (no separate log to
 * keep in sync).
 *
 * Deliberately excludes source "notification": `notifications.read` has
 * no matching `readAt` column, so there's no real closedAt to sort or
 * badge by for those — surfacing them here would either fake a
 * timestamp or silently reorder by createdAt, which would put a
 * months-old FYI at the top of "recently closed" the moment someone
 * happens to mark it read. The two sources below (pending_actions,
 * human_blockers) both stamp a real decided/resolved timestamp, so this
 * stays honest about what it can and can't show.
 */
export type QueueArchiveOutcome = "approved" | "rejected" | "execution_failed" | "resolved" | "abandoned";

export interface QueueArchiveItem {
  id: string;
  source: "action" | "blocker";
  title: string;
  subtitle: string;
  engagementId: string | null;
  buyer: string | null;
  runId: string | null;
  outcome: QueueArchiveOutcome;
  closedAt: string; // ISO
  closedBy: string | null;
}

export async function getQueueArchiveItems(
  whopUserId: string,
  workspaceId: string,
  limit = 50
): Promise<QueueArchiveItem[]> {
  const [decidedActionRows, resolvedBlockerRows] = await Promise.all([
    db
      .select({
        id: pendingActions.id,
        engagementId: pendingActions.engagementId,
        buyer: engagements.buyer,
        actionType: pendingActions.actionType,
        payload: pendingActions.payload,
        status: pendingActions.status,
        decidedAt: pendingActions.decidedAt,
        decidedBy: pendingActions.decidedBy,
      })
      .from(pendingActions)
      .innerJoin(engagements, eq(pendingActions.engagementId, engagements.engagementId))
      .where(
        and(
          eq(engagements.whopUserId, whopUserId),
          eq(engagements.workspaceId, workspaceId),
          inArray(pendingActions.status, ["approved", "rejected", "execution_failed"])
        )
      )
      .orderBy(desc(pendingActions.decidedAt))
      .limit(limit),

    db
      .select({
        id: humanBlockers.id,
        engagementId: humanBlockers.engagementId,
        buyer: engagements.buyer,
        blockerType: humanBlockers.blockerType,
        description: humanBlockers.description,
        runId: humanBlockers.runId,
        status: humanBlockers.status,
        resolvedAt: humanBlockers.resolvedAt,
        resolvedBy: humanBlockers.resolvedBy,
      })
      .from(humanBlockers)
      .innerJoin(engagements, eq(humanBlockers.engagementId, engagements.engagementId))
      .where(
        and(
          eq(engagements.whopUserId, whopUserId),
          eq(engagements.workspaceId, workspaceId),
          inArray(humanBlockers.status, ["resolved", "abandoned"])
        )
      )
      .orderBy(desc(humanBlockers.resolvedAt))
      .limit(limit),
  ]);

  const items: QueueArchiveItem[] = [
    ...decidedActionRows
      .filter((a) => a.decidedAt)
      .map((a): QueueArchiveItem => {
        const payload = a.payload as { _title?: string } | null;
        return {
          id: a.id,
          source: "action",
          title: payload?._title ?? ACTION_TYPE_LABELS[a.actionType] ?? a.actionType,
          subtitle: a.buyer,
          engagementId: a.engagementId,
          buyer: a.buyer,
          runId: null,
          outcome: a.status as QueueArchiveOutcome,
          closedAt: a.decidedAt!.toISOString(),
          closedBy: a.decidedBy,
        };
      }),
    ...resolvedBlockerRows
      .filter((b) => b.resolvedAt)
      .map((b): QueueArchiveItem => ({
        id: b.id,
        source: "blocker",
        title: BLOCKER_TYPE_LABELS[b.blockerType] ?? b.blockerType,
        subtitle: b.description || b.buyer,
        engagementId: b.engagementId,
        buyer: b.buyer,
        runId: b.runId ?? null,
        outcome: b.status as QueueArchiveOutcome,
        closedAt: b.resolvedAt!.toISOString(),
        closedBy: b.resolvedBy,
      })),
  ];

  items.sort((x, y) => new Date(y.closedAt).getTime() - new Date(x.closedAt).getTime());
  return items.slice(0, limit);
}

/**
 * Cheap count-only version for the sidebar badge, which renders on every
 * dashboard navigation and shouldn't pay for full row hydration. Counts
 * only the two categories that actually need a human to unblock something
 * (approve + action_needed) — alerts/FYIs already have their own unread
 * count on the notification bell, so folding them in here too would just
 * double-count the same number in two places on screen at once.
 */
export async function getQueueActionableCount(whopUserId: string, workspaceId: string): Promise<number> {
  const [pendingCount, blockerCount, engagementStackRows] = await Promise.all([
    db
      .select({ id: pendingActions.id })
      .from(pendingActions)
      .innerJoin(engagements, eq(pendingActions.engagementId, engagements.engagementId))
      .where(
        and(
          eq(engagements.whopUserId, whopUserId),
          eq(engagements.workspaceId, workspaceId),
          eq(pendingActions.status, "pending"),
          isNull(engagements.deletedAt)
        )
      ),
    db
      .select({ id: humanBlockers.id })
      .from(humanBlockers)
      .innerJoin(engagements, eq(humanBlockers.engagementId, engagements.engagementId))
      .where(
        and(
          eq(engagements.whopUserId, whopUserId),
          eq(engagements.workspaceId, workspaceId),
          eq(humanBlockers.status, "open"),
          isNull(engagements.deletedAt)
        )
      ),
    db
      .select({ engagementId: engagements.engagementId, buyer: engagements.buyer, stack: engagements.stack })
      .from(engagements)
      .where(
        and(
          eq(engagements.whopUserId, whopUserId),
          eq(engagements.workspaceId, workspaceId),
          isNull(engagements.deletedAt)
        )
      ),
  ]);

  const syncSetupCount = engagementStackRows.filter((r) =>
    needsWebhookSetupNudge(r.stack as EngagementStack | null)
  ).length;

  const failureCount = (await failedRunQueueItems(engagementStackRows)).length;

  return pendingCount.length + blockerCount.length + syncSetupCount + failureCount;
}
