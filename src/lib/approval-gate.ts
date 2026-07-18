// src/lib/approval-gate.ts
//
// Cross-cutting recovery gap 22 — explicit human-approval gates on
// side-effectful actions.
//
// The Skill Pack's install-time agent paused for buyer confirmation before
// anything with real-world side effects happened. UTP's webhook-driven
// model fires those same side effects (enrolling a prospect, adding/
// removing them from an ad-spend attribution cohort) automatically the
// moment a signed webhook arrives. That's a deliberate, reasonable default
// for most operators — but some operators managing high-stakes or
// high-touch buyer relationships want a human to see and approve each one
// first. This is that opt-in path.
//
// Design: this is NOT a blanket "everything pauses" switch. It's scoped
// per action type (see PendingActionType below) and per-engagement via
// EngagementStack.require_approval_for_side_effects /
// require_approval_action_types, so an operator can gate just the actions
// that matter to them (e.g. ad-cohort membership changes, which affect
// billing/attribution on the buyer's ad platform) while leaving lower-
// stakes actions on autopilot. Scoped in this pass to two action types
// that have real, wired call sites — see the module comment on
// PendingActionType for why SMS dispatch isn't a third yet.
//
// Gated actions are deferred, not dropped: queuePendingAction stores
// exactly what a later executor needs to actually run the action, and
// ACTION_EXECUTORS re-derives everything else (tenant, stack, credentials)
// fresh from the DB at execution time rather than trusting anything
// stashed in the payload — same re-fetch-don't-trust-the-event principle
// this codebase already applies to Inngest event payloads.
import crypto from "crypto";
import { db } from "@/lib/db";
import { pendingActions, engagements, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { notifyUser } from "@/lib/notify";

export type PendingActionType = "webhook_enrollment" | "cohort_membership_add" | "cohort_membership_remove";

export function isApprovalRequired(
  stack: EngagementStack | null | undefined,
  actionType: PendingActionType
): boolean {
  if (!stack?.require_approval_for_side_effects) return false;
  const scoped = stack.require_approval_action_types;
  // Gate is on with no scoping list => gate every gateable action type.
  // Gate is on with a list => gate only the listed types.
  if (!scoped || scoped.length === 0) return true;
  return scoped.includes(actionType);
}

async function queuePendingAction(
  engagementId: string,
  actionType: PendingActionType,
  payload: Record<string, unknown>
): Promise<string> {
  const [row] = await db
    .insert(pendingActions)
    .values({ engagementId, actionType, payload })
    .returning({ id: pendingActions.id });

  const [engagement] = await db
    .select({ whopUserId: engagements.whopUserId, stack: engagements.stack })
    .from(engagements)
    .where(eq(engagements.engagementId, engagementId))
    .limit(1);

  if (engagement) {
    try {
      const stack = engagement.stack as EngagementStack;
      await notifyUser({
        whopUserId: engagement.whopUserId,
        engagementId,
        type: "credential_check_error",
        severity: "info",
        title: `Approval needed: ${actionType.replace(/_/g, " ")}`,
        body: `A ${actionType.replace(/_/g, " ")} action is waiting for review before it runs. Approve or reject it from the dashboard.`,
        slackWebhookUrl: stack?.slack_webhook_url,
      });
    } catch {
      // Same isolation as everywhere else notify.ts is called — a
      // notification failure must never prevent the pending action itself
      // from being recorded.
    }
  }

  return row.id;
}

/**
 * The single entry point call sites use. Gate off (the default) runs
 * `execute` immediately and returns its result, exactly matching today's
 * behavior. Gate on queues a pending action and returns without running
 * `execute` at all — the caller's job is just to stop, not to run any
 * fallback logic, since the queued action is the source of truth for what
 * still needs to happen.
 */
export async function gateOrExecute<T>(
  stack: EngagementStack | null | undefined,
  engagementId: string,
  actionType: PendingActionType,
  payload: Record<string, unknown>,
  execute: () => Promise<T>
): Promise<{ executed: true; result: T } | { executed: false; pendingActionId: string }> {
  if (!isApprovalRequired(stack, actionType)) {
    const result = await execute();
    return { executed: true, result };
  }
  const pendingActionId = await queuePendingAction(engagementId, actionType, payload);
  return { executed: false, pendingActionId };
}

/**
 * Re-runs an approved pending action. Called only from
 * POST /api/actions/[id]/review after an admin approves — never call
 * these directly from a webhook handler, since that would bypass the gate
 * that's the entire point of this module.
 */
export const ACTION_EXECUTORS: Record<PendingActionType, (engagementId: string, payload: any) => Promise<void>> = {
  webhook_enrollment: async (engagementId, payload) => {
    const { handleInboundBookingEvent } = await import("@/features/pile-on/server/enrollment-service");
    const { startRun } = await import("@/lib/run-log");
    const [tenant] = await db.select().from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
    if (!tenant) throw new Error(`Engagement ${engagementId} not found`);
    const runId = crypto.randomUUID();
    const skillName = payload.eventKind === "cancelled" ? "win-back" : "pile-on";
    await startRun({
      id: runId,
      engagementId,
      skillName,
      phase: "webhook_received",
      label: "approved pending action: webhook_enrollment",
    });
    await handleInboundBookingEvent(payload.bookingPayload, tenant, runId, payload.eventKind);
  },

  cohort_membership_add: async (engagementId, payload) => {
    const { addProspectToAdDataCohort } = await import("@/features/pile-on/server/cohort-sync");
    const [tenant] = await db.select().from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
    if (!tenant) throw new Error(`Engagement ${engagementId} not found`);
    await addProspectToAdDataCohort(engagementId, tenant.stack as EngagementStack, payload.prospectEmail);
  },

  cohort_membership_remove: async (engagementId, payload) => {
    const { removeProspectFromAdDataCohort } = await import("@/features/pile-on/server/cohort-sync");
    const [tenant] = await db.select().from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
    if (!tenant) throw new Error(`Engagement ${engagementId} not found`);
    await removeProspectFromAdDataCohort(engagementId, tenant.stack as EngagementStack, payload.prospectEmail);
  },
};
