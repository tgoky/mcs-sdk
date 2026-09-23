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
import { pendingActions, engagements, repIncidents, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { notifyUser } from "@/lib/notify";
import { isEngagementPaused } from "@/lib/engagement-status";
import { REP_THRESHOLD_DEFAULTS } from "@/features/reputation-manager/rep-thresholds";
import { OPT_IN_GATED_ACTION_TYPES } from "@/lib/approval-actions";

export type PendingActionType =
  | "webhook_enrollment"
  | "cohort_membership_add"
  | "cohort_membership_remove"
  | "confirmation_page_deploy"
  // Reputation Manager's response-routing tiers 1-3 (response-routing.ts) —
  // always gated, never routed through isApprovalRequired's opt-in check,
  // since there is no "auto-execute" mode for a drafted public response:
  // this app has no API to post to Trustpilot/Reddit/X on the operator's
  // behalf (see draft-response.ts's header), so every draft this queues is
  // always headed for a human to review and paste manually. Queued
  // directly via the exported queuePendingAction, not gateOrExecute.
  | "rep_response_approval"
  // Whop Agent (Section 8.3): confirmation gates on infrastructure the
  // operator built themselves. Same as rep_response_approval — always
  // gated, no opt-in check, queued directly via queuePendingAction from
  // webhook-audit-service.ts rather than through gateOrExecute. More
  // Whop action types (dedupe delete, re-enable, promo code removal,
  // dispute evidence submit, ads flip-to-active) join this union as each
  // of those skills is built.
  | "whop_webhook_pin"
  | "whop_webhook_dedupe_delete"
  | "whop_webhook_reenable"
  | "whop_product_launch_bulk_confirm"
  | "whop_cancel_discount_configure"
  | "whop_cancellation_offer_create"
  | "whop_drift_fingerprint_adopt"
  | "whop_bulk_promo_codes_confirm"
  | "whop_promo_code_remove"
  | "whop_dispute_evidence_submit"
  | "whop_ads_flip_to_active";

export { OPT_IN_GATED_ACTIONS, OPT_IN_GATED_ACTION_TYPES } from "@/lib/approval-actions";

export function isApprovalRequired(
  stack: EngagementStack | null | undefined,
  actionType: PendingActionType
): boolean {
  if (!stack?.require_approval_for_side_effects) return false;
  const scoped = stack.require_approval_action_types;
  // Gate is on with no scoping list => gate every gateable action type.
  // Gate is on with a list => gate only the listed types.
  // Only opt-in types count: older saves (the removed Autopilot page) could
  // store always-reviewed Whop/RM types here, and a list holding only those
  // made Co-Pilot review nothing at all. With no opt-in type listed, the
  // gate reviews every opt-in action, same as an empty list.
  const optIn = (scoped ?? []).filter((t) => OPT_IN_GATED_ACTION_TYPES.includes(t));
  if (optIn.length === 0) return true;
  return (optIn as readonly string[]).includes(actionType);
}

/** Exported so response-routing.ts can queue a rep_response_approval row
 * directly — that action type is always gated (see PendingActionType's own
 * comment), so it has no use for gateOrExecute's opt-in isApprovalRequired
 * check and calls this entry point straight, exactly like the assumed-
 * no-show sweep's forceGate path already does for webhook_enrollment. */
export async function queuePendingAction(
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

    const stack = tenant.stack as EngagementStack | null;
    const prospectName: string | undefined = payload?.bookingPayload?.name;
    const prospectEmail: string | undefined = payload?.bookingPayload?.email;

    // Deferred outcome-log write — payload._reason is only ever set by
    // triggerNoShowWinBack's auto_sweep path (see its doc), so its
    // presence here means this approval is confirming a sweep's
    // inference, not just releasing an ordinary gated webhook. See
    // resolveCallOutcome's matching early-return and confirmSweepNoShow's
    // own doc for why this write happens now, at approval time, instead
    // of the moment the sweep merely guessed.
    if (payload?._reason && prospectEmail) {
      const { confirmSweepNoShow } = await import("@/features/pre-call-read/server/outcome-resolution");
      await confirmSweepNoShow(engagementId, payload.bookingPayload._bookingId, prospectEmail, stack);
    }

    const runId = crypto.randomUUID();
    const skillName = payload.eventKind === "cancelled" ? "win-back" : "pile-on";

    // The skill may have been turned off for this engagement in the time
    // between this action being queued and an admin approving it now —
    // that's a more recent signal than the approval click, so honor it
    // rather than silently re-enrolling anyway.
    if (!(await isSkillEnabledForEngagement(engagementId, skillName))) {
      throw new Error(`${skillName} is turned off for this engagement. Approve after re-enabling it, if that's intended.`);
    }

    // Fix: this label was the generic, mechanism-y "approved pending
    // action: webhook_enrollment" regardless of what was actually being
    // approved — exactly the "sounds like a hardcoded system alarm, not
    // an assistant" complaint. Says what actually happened instead.
    const label = payload?._reason
      ? `Win-Back recovery started for ${prospectName || prospectEmail || "prospect"}. no-show confirmed on review`
      : `${skillName === "win-back" ? "Win-Back" : "Pile-On"} enrollment approved for ${prospectName || prospectEmail || "prospect"}`;

    await startRun({
      id: runId,
      engagementId,
      skillName,
      phase: "webhook_received",
      label,
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
      detail: "Approved. Publishing now.",
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

  // Nothing to actually execute — this app has no API to post to
  // Trustpilot/Reddit/X on the operator's behalf (see draft-response.ts's
  // header), so "approved" here means "reviewed and cleared to post,"
  // logged as the audit trail's approval event chained off the draft event
  // response-routing.ts created. The operator still pastes the draft text
  // (already visible on the pending-action row) wherever it needs to go.
  rep_response_approval: async (engagementId, payload) => {
    const { logAuditEvent } = await import("@/features/reputation-manager/server/audit-log");
    await logAuditEvent(
      engagementId,
      { eventType: "approval", payload: { approver: "sole_authority", decision: "approved" } },
      payload?.draftEventId ?? null
    );
  },

  // Whop Agent — Section 2.5 Step 2 / Section 8.3. Re-derives the pin date
  // from the payload (queued at request time by queueWebhookPin) rather
  // than re-reading whopAgentConnections here, since an operator could have
  // started a pin advancement between queue and approval — the confirmation
  // screen showed this exact date, so that's the date that executes.
  whop_webhook_pin: async (engagementId, payload) => {
    const { executeWebhookPin } = await import("@/features/whop-agent/server/webhook-audit-service");
    await executeWebhookPin(engagementId, payload.whopWebhookId, payload.pinnedVersionDate);
  },

  // Whop Agent — Section 2.5 Step 3. Deletes exactly the ids the
  // confirmation screen showed (payload.deleteWhopWebhookIds), never a
  // freshly-recomputed group — the operator approved specific ids.
  whop_webhook_dedupe_delete: async (engagementId, payload) => {
    const { executeWebhookDedupe } = await import("@/features/whop-agent/server/webhook-audit-service");
    await executeWebhookDedupe(engagementId, payload.deleteWhopWebhookIds);
  },

  // Whop Agent — Section 7.4 steps 4-6. Only ever reached after a passing
  // destination probe (checked before this was queued) AND explicit
  // operator approval — "fully automatic re-enable was considered and
  // rejected."
  whop_webhook_reenable: async (engagementId, payload) => {
    const { executeWebhookReenable } = await import("@/features/whop-agent/server/receiver-health-service");
    await executeWebhookReenable(engagementId, payload.whopWebhookId);
  },

  // Whop Agent — Section 5.1's bulk-launch guardrail. Runs each queued
  // input through the exact same runProductLaunchPreflight path a single
  // launch takes (pre-flight validation, dry-run gate, and all), just once
  // per approved input rather than immediately on submit.
  whop_product_launch_bulk_confirm: async (engagementId, payload) => {
    const { runProductLaunchPreflight } = await import("@/features/whop-agent/server/product-launch-preflight-service");
    for (const input of payload.inputs) {
      await runProductLaunchPreflight(engagementId, input);
    }
  },

  // Whop Agent — Playbook 5.6 step 1. A native, live-infrastructure pricing
  // change, gated regardless of any opt-in approval setting.
  whop_cancel_discount_configure: async (engagementId, payload) => {
    const { executeNativeCancelDiscountConfig } = await import("@/features/whop-agent/server/cancellation-save-offer-service");
    await executeNativeCancelDiscountConfig(engagementId, payload.planId, payload.percentage, payload.intervals);
  },

  // Whop Agent — Playbook 5.6 step 2. Creates the promo code only; the
  // message itself is sent by the operator, never this agent.
  whop_cancellation_offer_create: async (engagementId, payload) => {
    const { executeCancellationOfferCreate } = await import("@/features/whop-agent/server/cancellation-save-offer-service");
    await executeCancellationOfferCreate(engagementId, payload);
  },

  // Whop Agent — Playbook 5.3. "Approval" only means "start using this
  // shape as the new baseline fingerprint" — it never touches Whop itself.
  whop_drift_fingerprint_adopt: async (engagementId, payload) => {
    const { executeDriftFingerprintAdopt } = await import("@/features/whop-agent/server/drift-monitor-service");
    await executeDriftFingerprintAdopt(engagementId, payload.whopWebhookId, payload.nextFingerprint);
  },

  whop_bulk_promo_codes_confirm: async (engagementId, payload) => {
    // The skill may have been turned off between this being queued and an
    // admin approving it now — same re-check webhook_enrollment above
    // does, extended here per this session's own Whop Agent audit (which
    // found none of Whop Agent's write-capable approval executors re-checked
    // the toggle at approval time, only at the original request).
    const { isSkillEnabledForEngagement } = await import("@/lib/engagement-skills");
    if (!(await isSkillEnabledForEngagement(engagementId, "whop-bulk-promo-codes"))) {
      throw new Error("Bulk Promo Code Generation is turned off for this engagement. Approve after re-enabling it, if that's intended.");
    }
    const { executeBulkPromoCodesConfirm } = await import("@/features/whop-agent/server/bulk-promo-codes-service");
    await executeBulkPromoCodesConfirm(engagementId, payload.specs);
  },

  // Section 14 open question #2 (delete vs deactivate) — the executor
  // itself resolves which path Whop actually accepts and reports it;
  // gated because both are effectively irreversible for the code itself.
  whop_promo_code_remove: async (engagementId, payload) => {
    const { removePromoCode } = await import("@/features/whop-agent/server/bulk-promo-codes-service");
    await removePromoCode(engagementId, payload.promoCodeId);
  },

  // Whop Agent — Playbook 5.10. Needs the elevated credential the
  // manifest declares; re-checks the evidence window immediately before
  // submitting, independent of the check that ran when this was queued.
  whop_dispute_evidence_submit: async (engagementId, payload) => {
    const { isSkillEnabledForEngagement } = await import("@/lib/engagement-skills");
    if (!(await isSkillEnabledForEngagement(engagementId, "whop-dispute-response"))) {
      throw new Error("Dispute Response is turned off for this engagement. Approve after re-enabling it, if that's intended.");
    }
    const { executeDisputeEvidenceSubmit } = await import("@/features/whop-agent/server/dispute-response-service");
    await executeDisputeEvidenceSubmit(engagementId, payload.disputeId, payload.draft);
  },

  // Whop Agent — Playbook 5.11. Needs the elevated credential the
  // manifest declares; this is the one call in the whole catalog that
  // starts real Meta ad spend.
  whop_ads_flip_to_active: async (engagementId, payload) => {
    const { isSkillEnabledForEngagement } = await import("@/lib/engagement-skills");
    if (!(await isSkillEnabledForEngagement(engagementId, "whop-ads-draft-approve"))) {
      throw new Error("Whop Ads Draft-and-Approve is turned off for this engagement. Approve after re-enabling it, if that's intended.");
    }
    const { executeAdsFlipToActive } = await import("@/features/whop-agent/server/whop-ads-service");
    await executeAdsFlipToActive(engagementId, payload.adId);
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
type DecidePendingActionResult =
  | { ok: true; status: "rejected" }
  | { ok: true; status: "approved"; executed: true }
  | { ok: true; status: "approved"; executed: false; error: string }
  | { ok: false; error: string };

/**
 * The check-then-act this used to do — a plain SELECT, then later an
 * UPDATE, with no lock between them — let two concurrent decisions on the
 * same id (a double-click on Approve, a browser retrying a slow POST) both
 * read status: "pending" and both go on to run the executor. Confirmed as
 * a real, reproducible race (not just a theoretical one) against a live
 * Postgres instance with two connections manually stepped through the
 * exact same statement sequence: both readers saw "pending" every time.
 * For an executor whose side effect mints fresh identifiers on every call
 * — executeBulkPromoCodesConfirm's fresh runId (and therefore fresh
 * per-code Whop idempotency keys) being the sharpest example — that's not
 * a harmless double-run, it's a second live batch of promo codes created
 * on the operator's actual Whop account.
 *
 * Fixed the same way run-log.ts's withStepsLock already fixed the
 * identical class of race in this codebase: the read and the status
 * transition move inside one transaction holding a `SELECT ... FOR
 * UPDATE` row lock, so a second concurrent call blocks at the SELECT
 * until the first transaction commits, then sees the already-decided
 * status and bails — instead of racing past the same stale read. The
 * executor call itself stays outside the lock/transaction, same
 * reasoning withStepsLock gives for keeping its own network call out:
 * a real side effect (an HTTP call to Whop, in most of these) has no
 * business holding a database row lock for its duration.
 */
async function claimPendingAction(
  id: string,
  decision: "approved" | "rejected",
  decidedBy: string
): Promise<
  | { claimed: false }
  | { claimed: true; action: typeof pendingActions.$inferSelect; terminal: DecidePendingActionResult }
  | { claimed: true; action: typeof pendingActions.$inferSelect; terminal: null }
> {
  return db.transaction(async (tx) => {
    const [action] = await tx.select().from(pendingActions).where(eq(pendingActions.id, id)).for("update").limit(1);
    if (!action || action.status !== "pending") {
      return { claimed: false };
    }

    if (decision === "rejected") {
      await tx.update(pendingActions).set({ status: "rejected", decidedAt: new Date(), decidedBy }).where(eq(pendingActions.id, id));
      return { claimed: true, action, terminal: { ok: true, status: "rejected" } };
    }

    // Anti-hasty-response cooling-off period (thresholds.yml.template's
    // response_timing block, ported as REP_THRESHOLD_DEFAULTS.
    // minMinutesBeforePublicResponse) — a public response can't be
    // approved until this many minutes have passed since the incident it
    // responds to was declared, even with sole-authority approval.
    // Checked here, before the row flips to "approved", so a too-early
    // click leaves the row "pending" and simply retryable once the
    // window clears, rather than landing in a dead execution_failed
    // state. Still inside the lock so a second concurrent caller can't
    // slip past this check either.
    if (decision === "approved" && action.actionType === "rep_response_approval") {
      const incidentId = (action.payload as { incidentId?: string } | null)?.incidentId;
      if (incidentId) {
        const [incident] = await tx.select({ declaredAt: repIncidents.declaredAt }).from(repIncidents).where(eq(repIncidents.id, incidentId)).limit(1);
        if (incident) {
          const minutesSinceDeclared = (Date.now() - incident.declaredAt.getTime()) / 60_000;
          const required = REP_THRESHOLD_DEFAULTS.minMinutesBeforePublicResponse;
          if (minutesSinceDeclared < required) {
            const minutesLeft = Math.ceil(required - minutesSinceDeclared);
            return {
              claimed: true,
              action,
              terminal: {
                ok: false,
                error: `Anti-hasty-response cooling-off period active: wait ${minutesLeft} more minute${minutesLeft === 1 ? "" : "s"} before approving a public response to this incident.`,
              },
            };
          }
        }
      }
    }

    // Approved — mark decided first (so a slow/failing executor can't
    // leave the row looking un-decided and retryable-by-accident), then
    // attempt execution outside this transaction.
    await tx.update(pendingActions).set({ status: "approved", decidedAt: new Date(), decidedBy }).where(eq(pendingActions.id, id));
    return { claimed: true, action, terminal: null };
  });
}

export async function decidePendingAction(id: string, decision: "approved" | "rejected", decidedBy: string): Promise<DecidePendingActionResult> {
  const claim = await claimPendingAction(id, decision, decidedBy);
  if (!claim.claimed) {
    return { ok: false, error: "Pending action not found or already decided." };
  }
  if (claim.terminal) {
    return claim.terminal;
  }

  const action = claim.action;
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