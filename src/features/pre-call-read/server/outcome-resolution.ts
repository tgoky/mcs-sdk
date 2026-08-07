// src/features/pre-call-read/server/outcome-resolution.ts
//
// Win-Back no-show gap fix (+ the same-root-cause Pile-On call-completed
// cohort gap).
//
// Before this file existed, a call's outcome could be logged in two
// places (the dashboard's "Log Sales Call Outcome" control and Slack's
// interactive brief buttons) and both only ever wrote to briefOutcomeLog
// — nothing downstream ever read that row. Win-Back only enrolled off a
// booking-platform-reported cancellation; the actual no-show case (the
// one Win-Back is named for) never enrolled anyone, and the ad-data
// cohort never cleared because no booking platform this app integrates
// with fires a "call completed" event at all.
//
// This module is the single place all four ways a call's outcome can
// become known now converge:
//   1. The dashboard's outcome control  → outcome/route.ts
//   2. Slack's interactive buttons      → slack/interactions/route.ts
//   3. Recall.ai bot telemetry          → api/recall/route.ts (zero-human)
//   4. The assumed-no-show sweep cron   → crons.ts (zero-human safety net)
//
// It does NOT reimplement Win-Back enrollment or ad-cohort sync — it
// drives the exact same, already-built machinery those already use
// (handleInboundBookingEvent's "cancelled" branch, via the same
// bookingWebhookProcess event booking-event/route.ts dispatches, and
// removeProspectFromAdDataCohort via the same cohort_membership_remove
// approval gate the webhook path already respects). A no-show resolved
// here is indistinguishable, from Win-Back's perspective, from a
// booking.no-showed webhook — it goes through the identical classifier,
// the identical approval gate, the identical skill-enabled check.
import crypto from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  briefedCallsLog,
  briefOutcomeLog,
  engagements,
  showRateFeatures,
  winBackEnrollments,
  pendingActions,
  type EngagementStack,
} from "@/models/schema";
import { inngest, bookingWebhookProcess } from "@/lib/inngest";
import { startRun } from "@/lib/run-log";
import { isEngagementPaused } from "@/lib/engagement-status";
import { isSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { gateOrExecute } from "@/lib/approval-gate";
import { removeProspectFromAdDataCohort } from "@/features/pile-on/server/cohort-sync";
import { exitWinBackSequence } from "@/lib/platforms/email";
import { resolveCredential } from "@/lib/credentials";

export type CallOutcome = "showed" | "no_show" | "rescheduled";
export type OutcomeSource = "dashboard" | "slack" | "recall_bot" | "auto_sweep";

export interface ResolveCallOutcomeParams {
  engagementId: string;
  bookingId: string; // briefedCallsLog.callId
  outcome: CallOutcome;
  source: OutcomeSource;
  slackUserId?: string | null;
  // Best-effort identity hints from the caller, used only when
  // briefedCallsLog and showRateFeatures both come up empty — e.g. the
  // Slack button's `value` payload already carries prospectEmail, so
  // that's a valid fallback for a booking briefed before this fix's
  // briefedCallsLog.prospectEmail column existed.
  prospectEmailHint?: string | null;
  prospectNameHint?: string | null;
  prospectPhoneHint?: string | null;
}

export interface ResolveCallOutcomeResult {
  recorded: boolean;
  prospectEmail: string | null;
  winBack:
    | "enrolled"
    | "exited"
    | "skipped_duplicate"
    | "skipped_no_email"
    | "skipped_disabled"
    | "pending_review"
    | "none";
  cohort: "removed" | "skipped_no_email" | "none";
  reason?: string;
}

/**
 * Resolves who this booking's prospect actually is. briefedCallsLog is
 * checked first — it's the only row guaranteed to exist for every briefed
 * call (unlike showRateFeatures, which only exists when
 * show_rate_scoring_enabled was on) — falling back to showRateFeatures,
 * then to whatever the caller already had on hand (e.g. Slack's button
 * value, or a Recall session's own booking lookup).
 */
async function resolveProspectIdentity(
  engagementId: string,
  bookingId: string,
  hints: Pick<ResolveCallOutcomeParams, "prospectEmailHint" | "prospectNameHint" | "prospectPhoneHint">
): Promise<{ email: string | null; name: string | null; phone: string | null }> {
  const [briefed] = await db
    .select({
      prospectEmail: briefedCallsLog.prospectEmail,
      prospectPhone: briefedCallsLog.prospectPhone,
      prospectName: briefedCallsLog.prospectName,
    })
    .from(briefedCallsLog)
    .where(and(eq(briefedCallsLog.engagementId, engagementId), eq(briefedCallsLog.callId, bookingId)))
    .limit(1);

  if (briefed?.prospectEmail) {
    return { email: briefed.prospectEmail, name: briefed.prospectName ?? hints.prospectNameHint ?? null, phone: briefed.prospectPhone ?? hints.prospectPhoneHint ?? null };
  }

  const [scored] = await db
    .select({ prospectEmail: showRateFeatures.prospectEmail })
    .from(showRateFeatures)
    .where(and(eq(showRateFeatures.engagementId, engagementId), eq(showRateFeatures.bookingId, bookingId)))
    .limit(1);

  return {
    email: scored?.prospectEmail ?? hints.prospectEmailHint ?? null,
    name: briefed?.prospectName ?? hints.prospectNameHint ?? null,
    phone: briefed?.prospectPhone ?? hints.prospectPhoneHint ?? null,
  };
}

/**
 * Dispatches a no-show exactly the way a real booking.no-showed webhook
 * would — same classifier, same approval gate, same async worker. Guards
 * against enrolling the same booking twice (e.g. the auto-sweep assumed
 * no-show, then a rep's late Slack click confirms it) by checking for an
 * existing winBackEnrollments row keyed to this specific bookingId before
 * dispatching — enrollment-service.ts's cancelled branch enforces this
 * same check authoritatively (see its sourceBookingId guard), this is
 * just a soft pre-check to avoid a wasted dispatch in the common case.
 */
async function triggerNoShowWinBack(
  engagementId: string,
  bookingId: string,
  prospectEmail: string,
  prospectName: string,
  prospectPhone: string | null,
  stack: EngagementStack | null | undefined,
  source: OutcomeSource
): Promise<"enrolled" | "skipped_duplicate" | "skipped_disabled" | "pending_review"> {
  const [existing] = await db
    .select({ id: winBackEnrollments.id })
    .from(winBackEnrollments)
    .where(and(eq(winBackEnrollments.engagementId, engagementId), eq(winBackEnrollments.sourceBookingId, bookingId)))
    .limit(1);
  if (existing) return "skipped_duplicate";

  if (!(await isSkillEnabledForEngagement(engagementId, "win-back"))) return "skipped_disabled";

  const payload = {
    event: "booking.no-showed",
    email: prospectEmail,
    name: prospectName || "Prospect",
    phone: prospectPhone ?? undefined,
    _bookingId: bookingId,
  };

  const runId = crypto.randomUUID();
  await startRun({
    id: runId,
    engagementId,
    skillName: "win-back",
    phase: "webhook_received",
    label: `No-show resolved for ${prospectName || prospectEmail} (outcome resolution)`,
  });

  // Same gate booking-event/route.ts already uses for a platform-reported
  // cancellation — an operator who requires approval before enrollment
  // gets that here too, not just on the webhook path.
  //
  // forceGate: source === "auto_sweep" — a sweep-resolved no-show is an
  // inference from absence (no outcome logged, no Recall session, no CRM
  // activity — see crons.ts), not a fact the way a platform webhook, a
  // rep's own click, or Recall's bot telemetry are. It always queues for
  // human review before Win-Back's "sorry we missed you" email can reach
  // the prospect, regardless of whether this engagement has approval
  // gating turned on for anything else. A wrong guess costs one Slack/
  // dashboard notification and a rejected pending action, not an
  // embarrassing email to someone who was on the call the whole time.
  const sweepReason =
    source === "auto_sweep"
      ? `Possible no-show: ${prospectName}. No rep logged an outcome, no Recall bot session confirmed attendance, and no recent CRM activity was found on this contact. This is an inference from missing evidence, not a confirmed no-show — approve to start Win-Back recovery, or reject if they actually showed and just weren't logged.`
      : undefined;

  const gated = await gateOrExecute(
    stack,
    engagementId,
    "webhook_enrollment",
    // _reason stored on the pending action itself (not just sent to
    // Slack/notifyUser) so it's still visible to anyone reviewing
    // pendingActions directly — e.g. a future dashboard list view — not
    // only to whoever happened to see the one-time notification.
    { bookingPayload: payload, eventKind: "cancelled", _reason: sweepReason },
    () => inngest.send(bookingWebhookProcess.create({ runId, engagementId, eventKind: "cancelled", bookingPayload: payload })),
    source === "auto_sweep",
    sweepReason
  );

  return gated.executed ? "enrolled" : "pending_review";
}

/**
 * Reverses a no-show-triggered enrollment when a later, more reliable
 * signal (usually a rep correcting an auto-sweep's assumption) says the
 * prospect actually showed. Deliberately uses exitWinBackSequence's
 * "manual_override" reason, not "rebooked" — this isn't a recovered deal,
 * it's a correction to a resolution this app itself got wrong, so it does
 * NOT increment engagements.winBackCounts.recovery_count the way a real
 * rebooked-exit does (see enrollment-service.ts's "created" branch).
 */
async function exitCorrectedNoShow(
  engagementId: string,
  bookingId: string,
  prospectEmail: string,
  stack: EngagementStack | null | undefined
): Promise<void> {
  // Forced-gate fix — a sweep-resolved no-show may not have an active
  // winBackEnrollments row at all yet: forceGate on auto_sweep (see
  // triggerNoShowWinBack) means it's sitting as a *pending* action
  // awaiting review, not an executed enrollment. Without this, a rep
  // clicking "Showed" minutes after a sweep's wrong guess would do
  // nothing to stop it — the pending action would still be sitting there
  // for an operator to approve later, unaware the rep already corrected
  // it. Reject any such pending action for this exact booking before (or
  // regardless of whether) an executed enrollment also needs exiting.
  const pending = await db
    .select({ id: pendingActions.id, payload: pendingActions.payload })
    .from(pendingActions)
    .where(
      and(
        eq(pendingActions.engagementId, engagementId),
        eq(pendingActions.actionType, "webhook_enrollment"),
        eq(pendingActions.status, "pending")
      )
    );
  for (const row of pending) {
    const payload = row.payload as { bookingPayload?: { _bookingId?: string } };
    if (payload?.bookingPayload?._bookingId === bookingId) {
      await db
        .update(pendingActions)
        .set({ status: "rejected", decidedAt: new Date(), decidedBy: "system_outcome_correction" })
        .where(eq(pendingActions.id, row.id));
    }
  }

  const active = await db
    .select({ id: winBackEnrollments.id })
    .from(winBackEnrollments)
    .where(
      and(
        eq(winBackEnrollments.engagementId, engagementId),
        eq(winBackEnrollments.sourceBookingId, bookingId),
        eq(winBackEnrollments.status, "active")
      )
    );

  if (active.length === 0 || !stack?.email_platform) return;

  try {
    const emailApiKey = await resolveCredential(engagementId, stack.email_platform);
    await exitWinBackSequence(
      stack.email_platform,
      emailApiKey,
      prospectEmail,
      {
        location_id: stack.booking_platform_meta?.location_id,
        recovery_workflow_id: stack.recovery_workflow_id,
        recovery_automation_id: stack.recovery_automation_id,
        activecampaign_base_url: stack.activecampaign_base_url,
      },
      "manual_override"
    );
  } catch (e) {
    // Best-effort, same as every other exit-signal call site in this
    // codebase — the DB status flip below is the durable record either
    // way; a failed ESP call just means one extra recovery email might
    // still go out, not a lost booking.
    console.error("[outcome-resolution] exitWinBackSequence failed during correction:", e);
  }

  await db
    .update(winBackEnrollments)
    .set({ status: "corrected", exitReason: "outcome_corrected_to_showed", exitedAt: new Date() })
    .where(
      and(
        eq(winBackEnrollments.engagementId, engagementId),
        eq(winBackEnrollments.sourceBookingId, bookingId),
        eq(winBackEnrollments.status, "active")
      )
    );
}

/**
 * Single entry point for recording a call outcome and acting on it. Every
 * caller (dashboard, Slack, Recall webhook, auto-sweep cron) should go
 * through this instead of inserting into briefOutcomeLog directly, so
 * Win-Back enrollment and cohort sync stay wired to every source instead
 * of just the ones someone remembered to wire up.
 */
export async function resolveCallOutcome(params: ResolveCallOutcomeParams): Promise<ResolveCallOutcomeResult> {
  const { engagementId, bookingId, outcome, source, slackUserId } = params;

  const [tenant] = await db.select().from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  if (!tenant) return { recorded: false, prospectEmail: null, winBack: "none", cohort: "none", reason: "Engagement not found." };
  if (tenant.deletedAt || isEngagementPaused(tenant)) {
    return { recorded: false, prospectEmail: null, winBack: "none", cohort: "none", reason: "Engagement is deleted or paused." };
  }
  const stack = tenant.stack as EngagementStack | null;

  // ── Prior outcome, read BEFORE inserting the new row ────────────────
  // briefOutcomeLog is append-only by design (see outcome/route.ts's
  // module comment) — a correction is a new row, not an upsert. This is
  // what lets us tell "first resolution" apart from "a later correction"
  // and act only on the transition, not on every click.
  const [priorRow] = await db
    .select({ outcome: briefOutcomeLog.outcome })
    .from(briefOutcomeLog)
    .where(and(eq(briefOutcomeLog.engagementId, engagementId), eq(briefOutcomeLog.bookingId, bookingId)))
    .orderBy(desc(briefOutcomeLog.loggedAt))
    .limit(1);
  const prior = priorRow?.outcome ?? null;

  const identity = await resolveProspectIdentity(engagementId, bookingId, {
    prospectEmailHint: params.prospectEmailHint,
    prospectNameHint: params.prospectNameHint,
    prospectPhoneHint: params.prospectPhoneHint,
  });

  await db.insert(briefOutcomeLog).values({
    engagementId,
    bookingId,
    prospectEmail: identity.email,
    outcome,
    loggedBySlackUserId: slackUserId ?? null,
    source,
  });

  // Tier 4 #25 — feeds the predictive show-rate scorer's training data.
  // Previously only the Slack path did this backfill; moved here so all
  // four sources feed it, not just one.
  try {
    await db
      .update(showRateFeatures)
      .set({ actualOutcome: outcome, outcomeRecordedAt: new Date() })
      .where(and(eq(showRateFeatures.engagementId, engagementId), eq(showRateFeatures.bookingId, bookingId)));
  } catch {
    // Non-fatal — see the Slack route's original comment for why a miss
    // here is expected, not an error.
  }

  const result: ResolveCallOutcomeResult = { recorded: true, prospectEmail: identity.email, winBack: "none", cohort: "none" };

  if (outcome === prior) {
    // Duplicate resolution of the same outcome (a double-click, or the
    // sweep re-running before its own row would exclude this booking) —
    // already recorded above, no side effect to repeat.
    return result;
  }

  if (!identity.email) {
    // Genuinely nothing to act on without an email — this is the
    // pre-existing identity gap (see briefedCallsLog's prospectEmail
    // comment), not a new failure mode this fix introduces. Surfaced
    // distinctly so an operator can tell "no side effect because there's
    // no prospect to act on" apart from "no side effect because none was
    // needed".
    result.winBack = outcome === "no_show" ? "skipped_no_email" : "none";
    result.cohort = outcome !== "rescheduled" ? "skipped_no_email" : "none";
    result.reason = "No prospect email on file for this booking — cannot enroll or sync a cohort.";
    return result;
  }

  // ── Decide side effects from the (prior → next) transition ─────────
  if (outcome === "no_show") {
    result.winBack = await triggerNoShowWinBack(
      engagementId,
      bookingId,
      identity.email,
      identity.name ?? "Prospect",
      identity.phone,
      stack,
      source
    );
    // Cohort removal only on the FIRST terminal resolution for this
    // booking — a correction from "showed" to "no_show" doesn't need a
    // second removal call, the cohort was already cleared the first time
    // this booking resolved to anything terminal.
    if (prior === null && stack?.ad_data_platform && stack.ad_data_platform !== "none") {
      const gated = await gateOrExecute(stack, engagementId, "cohort_membership_remove", { prospectEmail: identity.email }, () =>
        removeProspectFromAdDataCohort(engagementId, stack, identity.email!)
      );
      result.cohort = gated.executed ? "removed" : "none";
    }
  } else if (outcome === "showed") {
    if (prior === "no_show") {
      await exitCorrectedNoShow(engagementId, bookingId, identity.email, stack);
      result.winBack = "exited";
    }
    if (prior === null && stack?.ad_data_platform && stack.ad_data_platform !== "none") {
      const gated = await gateOrExecute(stack, engagementId, "cohort_membership_remove", { prospectEmail: identity.email }, () =>
        removeProspectFromAdDataCohort(engagementId, stack, identity.email!)
      );
      result.cohort = gated.executed ? "removed" : "none";
    }
  }
  // outcome === "rescheduled": deliberately no side effect. The booking
  // platform's own cancel/create webhook pair (when the reschedule
  // happens through the platform itself) already drives Win-Back exit and
  // cohort membership for the old slot plus Pile-On enrollment for the
  // new one — firing a second, independent side effect from a rep's
  // manual "Rescheduled" tap here would double-handle it.

  return result;
}
