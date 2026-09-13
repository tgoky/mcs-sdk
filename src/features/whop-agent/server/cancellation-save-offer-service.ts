// src/features/whop-agent/server/cancellation-save-offer-service.ts
//
// Playbook 5.6. Step 1 (native cancel-discount config) and the save-offer
// proposal itself are both writes with real pricing/relationship
// consequences — always gated (Section 8.3), never auto-executed.
import { db } from "@/lib/db";
import { pendingActions } from "@/models/schema";
import { and, eq, gte } from "drizzle-orm";
import { WhopAgentClient } from "@/lib/whop-agent/client";
import { queuePendingAction } from "@/lib/approval-gate";
import { logStep, startRun, finishRun, failRun } from "@/lib/run-log";
import crypto from "crypto";

const DEFAULT_MIN_TENURE_DAYS = 30;
const DEFAULT_COOLDOWN_DAYS = 90;

export interface SaveOfferConfig {
  discountPercentage: number;
  offerDurationMonths: number;
  offerMessage: string;
  minTenureDays?: number;
  cooldownDays?: number;
}

/** Step 1: propose native cancel-discount config on a recurring plan —
 * strictly earlier in the funnel than reacting to a cancel-intent event.
 * Always gated: this changes what every cancelling member sees at the
 * cancel step, on live infrastructure. */
export async function queueNativeCancelDiscountConfig(
  engagementId: string,
  planId: string,
  config: { percentage: number; intervals: number }
): Promise<string> {
  return queuePendingAction(
    engagementId,
    "whop_cancel_discount_configure",
    { planId, percentage: config.percentage, intervals: config.intervals },
    `Configure a native ${config.percentage}% cancel-discount on plan ${planId} for ${config.intervals} interval(s)? Every member who reaches the cancel step will see this offer before they finish cancelling.`
  );
}

export async function executeNativeCancelDiscountConfig(engagementId: string, planId: string, percentage: number, intervals: number): Promise<void> {
  const client = await WhopAgentClient.forEngagement(engagementId);
  await client.request("plans.update", `/v1/plans/${planId}`, {
    method: "PATCH",
    body: { offer_cancel_discount: true, cancel_discount_percentage: percentage, cancel_discount_intervals: intervals },
    idempotencyKey: `whop-cancel-discount-config:${planId}`,
  });
  // Read-back — Section 3's silent-save-verification discipline.
  const verify = await client.request<{ data?: Array<{ id: string; offer_cancel_discount?: boolean; cancel_discount_percentage?: number }> }>("plans.list", "/v1/plans", {
    query: { account_id: client.accountId ?? "" },
  });
  const updated = verify.data?.find((p) => p.id === planId) ?? null;
  if (updated && (updated.offer_cancel_discount !== true || updated.cancel_discount_percentage !== percentage)) {
    throw new Error(`Read-back after configuring plan ${planId}'s cancel discount did not confirm the change.`);
  }
}

/**
 * Step 2: `membership.cancel_at_period_end_changed` handler, called from
 * the shared webhook processor (src/inngest/whop-agent.ts). Direction
 * comes entirely from previous_attributes (Section 5.6's own correction —
 * "No read-back diff, no cached prior state"), falling back to a
 * read-back only when previous_attributes is genuinely absent (fail-open
 * table).
 */
export async function handleCancellationIntentEvent(
  engagementId: string,
  envelope: { data?: Record<string, unknown>; previous_attributes?: Record<string, unknown> },
  config: SaveOfferConfig
): Promise<{ proposed: boolean; reason?: string }> {
  const membershipId = envelope.data?.id as string | undefined;
  const memberEmail = (envelope.data?.email as string | undefined) ?? (envelope.data?.user_email as string | undefined);
  const productId = envelope.data?.product_id as string | undefined;
  const createdAtRaw = envelope.data?.created_at as string | undefined;

  const runId = crypto.randomUUID();
  await startRun({ id: runId, engagementId, skillName: "whop-cancellation-save-offer", phase: "eligibility_check", label: membershipId ?? "cancellation event" });

  try {
    let previousAttributes = envelope.previous_attributes;
    let degraded = false;

    if (!previousAttributes) {
      // Fail-open: "previous_attributes absent on the event — Fall back to
      // a read-back to determine direction; flag the run as degraded."
      degraded = true;
      const client = await WhopAgentClient.forEngagement(engagementId);
      const readBack = await client.request<{ data?: Array<{ id: string; cancel_at_period_end?: boolean }> }>("memberships.list", "/v1/memberships", {
        query: { id: membershipId },
      }).catch(() => null);
      const current = readBack?.data?.find((m) => m.id === membershipId);
      previousAttributes = current ? { cancel_at_period_end: !current.cancel_at_period_end } : undefined;
    }

    const flippedTo = previousAttributes?.cancel_at_period_end;
    if (flippedTo !== false) {
      // previous value was true (member un-cancelled) or unknown — never eligible.
      await finishRun(runId, { status: "skipped", summary: { whatWasAttempted: ["Direction check"], whatWorked: [], whatFailed: [], openItems: [], decisionsMade: ["Not a new cancel-intent — no proposal generated."] } });
      return { proposed: false, reason: "not_a_new_cancellation" };
    }

    await logStep(runId, { phase: "eligibility_check", status: "running", detail: degraded ? "previous_attributes absent — used read-back fallback" : undefined });

    const minTenureDays = config.minTenureDays ?? DEFAULT_MIN_TENURE_DAYS;
    if (createdAtRaw) {
      const tenureDays = (Date.now() - new Date(createdAtRaw).getTime()) / (24 * 60 * 60 * 1000);
      if (tenureDays < minTenureDays) {
        await logStep(runId, { phase: "eligibility_check", status: "skipped", detail: `Tenure ${tenureDays.toFixed(0)}d < minimum ${minTenureDays}d.` });
        await finishRun(runId, { status: "skipped", summary: { whatWasAttempted: ["Eligibility check"], whatWorked: [], whatFailed: [], openItems: [], decisionsMade: [`Excluded — tenure ${tenureDays.toFixed(0)}d below ${minTenureDays}d minimum.`] } });
        return { proposed: false, reason: "tenure_too_short" };
      }
    }

    const cooldownDays = config.cooldownDays ?? DEFAULT_COOLDOWN_DAYS;
    if (memberEmail) {
      const since = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000);
      // Cooldown reuses pendingActions' own history instead of a new
      // tracking table — every prior offer this engine made is already a
      // whop_cancellation_offer_create row with the member's email in its
      // payload and a real createdAt timestamp.
      const priorOffers = await db
        .select({ id: pendingActions.id, payload: pendingActions.payload })
        .from(pendingActions)
        .where(and(eq(pendingActions.engagementId, engagementId), eq(pendingActions.actionType, "whop_cancellation_offer_create"), gte(pendingActions.createdAt, since)));
      const alreadyOffered = priorOffers.some((row) => (row.payload as { memberEmail?: string })?.memberEmail === memberEmail);
      if (alreadyOffered) {
        await logStep(runId, { phase: "eligibility_check", status: "skipped", detail: `Already offered within the last ${cooldownDays} days.` });
        await finishRun(runId, { status: "skipped", summary: { whatWasAttempted: ["Cooldown check"], whatWorked: [], whatFailed: [], openItems: [], decisionsMade: [`Excluded — offered within the ${cooldownDays}-day cooldown.`] } });
        return { proposed: false, reason: "cooldown_active" };
      }
    }

    await logStep(runId, { phase: "eligibility_check", status: "success" });

    const message = config.offerMessage.replace("{discount}", String(config.discountPercentage)).replace("{months}", String(config.offerDurationMonths));
    const pendingActionId = await queuePendingAction(
      engagementId,
      "whop_cancellation_offer_create",
      { membershipId, memberEmail, productId, discountPercentage: config.discountPercentage, offerDurationMonths: config.offerDurationMonths, offerMessage: message },
      `Save-offer proposal for ${memberEmail ?? membershipId}: ${config.discountPercentage}% off for ${config.offerDurationMonths} month(s). Approve to create the promo code — you still send the message yourself.`
    );

    await finishRun(runId, {
      summary: {
        whatWasAttempted: ["Eligibility check", "Save-offer proposal"],
        whatWorked: [`Proposed ${config.discountPercentage}% / ${config.offerDurationMonths}mo offer, queued as ${pendingActionId}`],
        whatFailed: [],
        openItems: ["Awaiting operator approval in the Queue."],
        decisionsMade: [],
      },
    });

    return { proposed: true };
  } catch (err) {
    await failRun(runId, err).catch(() => {});
    throw err;
  }
}

/** Approved-action executor: creates the promo code only — the message
 * itself is a relationship touch the operator sends, never this agent. */
export async function executeCancellationOfferCreate(engagementId: string, payload: { productId?: string; discountPercentage: number; offerDurationMonths: number }): Promise<{ promoCodeId: string }> {
  const client = await WhopAgentClient.forEngagement(engagementId);
  const code = `SAVE${payload.discountPercentage}-${Date.now().toString(36).toUpperCase()}`;
  const res = await client.request<{ id: string }>("promo_codes.create", "/v1/promo_codes", {
    method: "POST",
    body: {
      code,
      existing_memberships_only: true,
      discount_type: "percentage",
      amount_off: payload.discountPercentage,
      promo_duration_months: payload.offerDurationMonths,
      product_id: payload.productId,
    },
    idempotencyKey: `whop-cancellation-offer:${engagementId}:${code}`,
  });
  return { promoCodeId: res.id };
}
