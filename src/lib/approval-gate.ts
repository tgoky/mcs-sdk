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
import { isEngagementPaused } from "@/lib/engagement-status";

export type PendingActionType =
  | "webhook_enrollment"
  | "cohort_membership_add"
  | "cohort_membership_remove"
  | "confirmation_page_deploy";

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
  payload: Record<string, unknown>,
  reason?: string
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

  // _digest rows skip the immediate notifyUser call entirely — see the
  // _digest doc in outcome-resolution.ts. The pendingActions row above is
  // already created either way, so it's visible in the Queue right away;
  // this only decides whether it ALSO gets an instant external ping, or
  // waits to be folded into pendingActionDigestCron's next batch.
  if (engagement && !(payload as { _digest?: boolean })._digest) {
    try {
      const stack = engagement.stack as EngagementStack;
      await notifyUser({
        whopUserId: engagement.whopUserId,
        engagementId,
        type: "credential_check_error",
        severity: "info",
        // Payload can carry an optional _title (same convention as
        // _reason below) for a call site whose actionType label is too
        // generic/mechanism-y to tell a reviewer what they're actually
        // deciding — see triggerNoShowWinBack, which reuses actionType
        // "webhook_enrollment" deliberately (it drives the identical
        // execution path a real webhook enrollment would) but needs its
        // own, accurate headline rather than "webhook enrollment".
        title: (payload as { _title?: string })._title ?? `Approval needed: ${actionType.replace(/_/g, " ")}`,
        // Assumed-no-show sweep false-positive fix — a bare "action X is
        // waiting for review" told the operator nothing about *why*
        // before they had to click into the dashboard, which is exactly
        // the opaque-guess feeling this fix exists to remove. When the
        // caller supplies a reason (forced gates on an inference always
        // do — see triggerNoShowWinBack), lead with it so the person
        // reviewing knows what they're actually being asked to confirm.
        body: reason ?? `A ${actionType.replace(/_/g, " ")} action is waiting for review before it runs. Approve or reject it from the dashboard.`,
        slackWebhookUrl: stack?.slack_webhook_url,
        // Real Approve/Reject buttons, not just a link back to the
        // dashboard — clicking either runs the identical
        // decidePendingAction path a dashboard click does (see the Slack
        // interactions route). value must carry engagementId: that's
        // what lets the interactions route pick the right signing secret
        // to verify against *before* trusting anything else in the click.
        slackActions: [
          {
            label: "✅ Approve",
            style: "primary",
            actionId: "pending_action_approve",
            value: JSON.stringify({ engagementId, id: row.id }),
          },
          {
            label: "❌ Reject",
            style: "danger",
            actionId: "pending_action_reject",
            value: JSON.stringify({ engagementId, id: row.id }),
          },
        ],
        // The pendingActions row just inserted above is already this
        // event's in-app, Queue-visible, actionable record (Approve/
        // Reject) — see notify.ts's persistInApp doc. Without this, the
        // same event also landed as an unlinked "fyi" Queue item nothing
        // ever clears, showing the same message twice under two
        // different actions with two different titles.
        persistInApp: false,
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
 *
 * `forceGate` — assumed-no-show sweep fix. `isApprovalRequired` is an
 * opt-in, per-engagement setting: an operator has to have turned it on for
 * anything to be gated. That's the right default for actions triggered by
 * real evidence (a platform-reported cancellation, a rep's own Slack
 * click, Recall bot telemetry). It is NOT the right default for a
 * Win-Back enrollment whose only basis is "no evidence turned up" — the
 * assumed-no-show sweep's entire premise (see crons.ts) is an inference
 * from absence, not a fact, and firing a customer-facing "sorry we missed
 * you" email off that inference without anyone able to catch a wrong
 * guess first is exactly the silent-black-box failure mode this fix
 * exists to close. `forceGate: true` skips the opt-in check and always
 * queues, independent of what the engagement's own approval settings say
 * — a human reviews every sweep-sourced no-show enrollment before it can
 * reach the prospect, full stop, not just for operators who happened to
 * turn approval gating on for something else.
 */
export async function gateOrExecute<T>(
  stack: EngagementStack | null | undefined,
  engagementId: string,
  actionType: PendingActionType,
  payload: Record<string, unknown>,
  execute: () => Promise<T>,
  forceGate = false,
  reason?: string
): Promise<{ executed: true; result: T } | { executed: false; pendingActionId: string }> {
  if (!forceGate && !isApprovalRequired(stack, actionType)) {
    const result = await execute();
    return { executed: true, result };
  }
  const pendingActionId = await queuePendingAction(engagementId, actionType, payload, reason);
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
    const { isSkillEnabledForEngagement } = await import("@/lib/engagement-skills");
    const [tenant] = await db.select().from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
    if (!tenant) throw new Error(`Engagement ${engagementId} not found`);
    
    if (tenant.deletedAt || isEngagementPaused(tenant)) {
      throw new Error(
        `Cannot execute action: engagement is currently ${tenant.deletedAt ? "deleted" : "paused"}.`
      );
    }

    const runId = crypto.randomUUID();
    const skillName = payload.eventKind === "cancelled" ? "win-back" : "pile-on";

    // The skill may have been turned off for this engagement in the time
    // between this action being queued and an admin approving it now —
    // that's a more recent signal than the approval click, so honor it
    // rather than silently re-enrolling anyway.
    if (!(await isSkillEnabledForEngagement(engagementId, skillName))) {
      throw new Error(`${skillName} is turned off for this engagement — approve after re-enabling it, if that's intended.`);
    }

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
    
    if (tenant.deletedAt || isEngagementPaused(tenant)) {
      throw new Error(
        `Cannot execute action: engagement is currently ${tenant.deletedAt ? "deleted" : "paused"}.`
      );
    }

    await addProspectToAdDataCohort(engagementId, tenant.stack as EngagementStack, payload.prospectEmail);
  },

  cohort_membership_remove: async (engagementId, payload) => {
    const { removeProspectFromAdDataCohort } = await import("@/features/pile-on/server/cohort-sync");
    const [tenant] = await db.select().from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
    if (!tenant) throw new Error(`Engagement ${engagementId} not found`);
    
    if (tenant.deletedAt || isEngagementPaused(tenant)) {
      throw new Error(
        `Cannot execute action: engagement is currently ${tenant.deletedAt ? "deleted" : "paused"}.`
      );
    }

    await removeProspectFromAdDataCohort(engagementId, tenant.stack as EngagementStack, payload.prospectEmail);
  },

  // payload only ever carries { runId, pageContent } — never a credential.
  // The hosting credential is re-resolved fresh below, same as every other
  // executor in this file re-derives its secrets rather than trusting
  // anything that sat in pending_actions between queue and approval.
  confirmation_page_deploy: async (engagementId, payload) => {
    const { publishConfirmationPage } = await import("@/lib/platforms/hosting");
    const { resolveCredential } = await import("@/lib/credentials");
    const { logStep } = await import("@/lib/run-log");

    const [tenant] = await db.select().from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
    if (!tenant) throw new Error(`Engagement ${engagementId} not found`);
    
    if (tenant.deletedAt || isEngagementPaused(tenant)) {
      throw new Error(
        `Cannot execute action: engagement is currently ${tenant.deletedAt ? "deleted" : "paused"}.`
      );
    }

    const stack = tenant.stack as EngagementStack;

    const hostingCredential = stack.hosting_platform
      ? await resolveCredential(engagementId, stack.hosting_platform).catch(() => null)
      : null;

    await logStep(payload.runId, {
      phase: "confirmation_page_deploy",
      status: "running",
      detail: "Approved — publishing now.",
    });

    const deployResult = await publishConfirmationPage(
      stack.hosting_platform,
      hostingCredential,
      stack.hosting_platform_meta,
      payload.pageContent,
      engagementId
    );

    const nowIso = new Date().toISOString();

    if (deployResult.mode === "live") {
      const updatedStack =
        stack.hosting_platform === "wordpress" && deployResult.resourceId
          ? { ...stack, hosting_platform_meta: { ...stack.hosting_platform_meta, wordpress_page_id: deployResult.resourceId as number } }
          : stack;

      await db
        .update(engagements)
        .set({
          stack: updatedStack,
          confirmationPageUrl: deployResult.url,
          confirmationPageDeployment: { mode: "live", deployedVia: deployResult.deployedVia, lastAttemptedAt: nowIso },
          pasteReadyHtml: null,
          pasteReadyInstructions: null,
          updatedAt: new Date(),
        })
        .where(eq(engagements.engagementId, engagementId));

      await logStep(payload.runId, {
        phase: "confirmation_page_deploy",
        status: "success",
        detail: `Live on buyer's ${stack.hosting_platform}: ${deployResult.url}`,
      });
      return;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://mcs-abra.vercel.app";
    await db
      .update(engagements)
      .set({
        confirmationPageUrl: `${appUrl}/confirm/${engagementId}`,
        confirmationPageDeployment: { mode: "paste_ready", reason: deployResult.reason, lastAttemptedAt: nowIso },
        pasteReadyHtml: deployResult.html,
        pasteReadyInstructions: deployResult.instructions,
        updatedAt: new Date(),
      })
      .where(eq(engagements.engagementId, engagementId));

    await logStep(payload.runId, {
      phase: "confirmation_page_deploy",
      status: "failed",
      detail: deployResult.reason,
    });
  },
};

/**
 * The single "a human decided" entry point for a pending action —
 * extracted from POST /api/actions/[id]/review so the Slack interactions
 * handler (src/app/api/slack/interactions/route.ts) can call the exact
 * same approve/reject/execute logic a dashboard click runs, instead of a
 * second, drifting copy of it. Callers still own their own auth: the
 * dashboard route checks session + isAuthorizedForEngagement before
 * calling this; the Slack route's trust comes from the signature
 * verification it already does before dispatching here (see that file's
 * header comment for why that has to happen in that specific order).
 */
export async function decidePendingAction(
  id: string,
  decision: "approved" | "rejected",
  decidedBy: string
): Promise<
  | { ok: true; status: "rejected" }
  | { ok: true; status: "approved"; executed: true }
  | { ok: true; status: "approved"; executed: false; error: string }
  | { ok: false; error: string }
> {
  const [action] = await db.select().from(pendingActions).where(eq(pendingActions.id, id)).limit(1);
  if (!action || action.status !== "pending") {
    return { ok: false, error: "Pending action not found or already decided." };
  }

  if (decision === "rejected") {
    await db
      .update(pendingActions)
      .set({ status: "rejected", decidedAt: new Date(), decidedBy })
      .where(eq(pendingActions.id, id));
    return { ok: true, status: "rejected" };
  }

  // Approved — mark decided first (so a slow/failing executor can't leave
  // the row looking un-decided and retryable-by-accident), then attempt
  // execution, recording failure on the row rather than throwing it away.
  await db
    .update(pendingActions)
    .set({ status: "approved", decidedAt: new Date(), decidedBy })
    .where(eq(pendingActions.id, id));

  try {
    const executor = ACTION_EXECUTORS[action.actionType as PendingActionType];
    if (!executor) {
      throw new Error(`No executor registered for action type "${action.actionType}"`);
    }
    await executor(action.engagementId, action.payload);
    return { ok: true, status: "approved", executed: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(pendingActions)
      .set({ status: "execution_failed", executionError: message })
      .where(eq(pendingActions.id, id));
    return { ok: true, status: "approved", executed: false, error: message };
  }
}