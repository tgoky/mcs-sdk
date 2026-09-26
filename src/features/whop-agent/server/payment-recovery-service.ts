// src/features/whop-agent/server/payment-recovery-service.ts
//
// Failed-payment recovery. When Whop reports payment.failed (already kept
// in whop_payments by lib/whop-payments.ts), this drafts a short message to
// the buyer with the link that fixes it and queues it for approval. On
// approval it is sent as a Whop direct message from the client's own
// account. When a later payment on the same membership goes through (or
// the same payment succeeds on retry), lib/whop-payments.ts credits it as
// recovered, so the dollars come from Whop, not an estimate.
//
// Whop calls, per @whop/sdk:
//   GET  /payments/{id}      recovery_url: Whop's page for the buyer to
//                            finish a bank (3D Secure) challenge
//   GET  /memberships/{id}   manage_url: where the buyer updates their card
//   POST /dm_channels        { with_user_ids: [user id | email] }, returns the
//                            existing channel if there is one (dms:channel:manage)
//   POST /messages           { channel_id, content } (chat:message:create or
//                            dms:message:manage)
//
// Never sent without approval: it is a message to a paying customer from
// the client's name.

import crypto from "crypto";
import { db } from "@/lib/db";
import { engagements, whopPayments, type EngagementStack } from "@/models/schema";
import { and, eq, gte, isNotNull, ne, or } from "drizzle-orm";
import { WhopAgentClient } from "@/lib/whop-agent/client";
import { queuePendingAction } from "@/lib/approval-gate";
import { startRun, logStep, finishRun, failRun } from "@/lib/run-log";
import { DEFAULT_RECOVERY_MESSAGE, decideRecovery, formatAmount, recoveryCooldownSince, renderRecoveryMessage } from "./recovery-message";

export type PaymentRow = typeof whopPayments.$inferSelect;

async function loadPayment(engagementId: string, paymentId: string): Promise<PaymentRow | null> {
  const [row] = await db.select().from(whopPayments).where(and(eq(whopPayments.engagementId, engagementId), eq(whopPayments.paymentId, paymentId))).limit(1);
  return row ?? null;
}

async function setRecovery(engagementId: string, paymentId: string, set: Partial<typeof whopPayments.$inferInsert>): Promise<void> {
  await db.update(whopPayments).set({ ...set, updatedAt: new Date() }).where(and(eq(whopPayments.engagementId, engagementId), eq(whopPayments.paymentId, paymentId)));
}

/** The link that fixes it: Whop's own recovery page for a bank challenge,
 * else the membership's manage page. Null when Whop gives neither. */
async function fixLink(client: WhopAgentClient, paymentId: string, membershipId: string | null): Promise<string | null> {
  const payment = await client.request<{ recovery_url?: string | null }>("payments.get", `/v1/payments/${encodeURIComponent(paymentId)}`, { optionalRead: true }).catch(() => null);
  if (payment?.recovery_url) return payment.recovery_url;
  if (!membershipId) return null;
  const membership = await client.request<{ manage_url?: string | null }>("memberships.get", `/v1/memberships/${encodeURIComponent(membershipId)}`, { optionalRead: true }).catch(() => null);
  return membership?.manage_url ?? null;
}

/** payment.failed → a drafted message in the Queue. Called from the Whop
 * webhook processor after the payment is recorded. */
export async function handlePaymentFailed(engagementId: string, paymentId: string): Promise<{ queued: boolean; reason?: string }> {
  const row = await loadPayment(engagementId, paymentId);
  if (!row) return { queued: false, reason: "Payment not recorded." };

  const runId = crypto.randomUUID();
  await startRun({ id: runId, engagementId, skillName: "whop-payment-recovery", phase: "eligibility_check", label: row.email ?? paymentId });

  try {
    const since = recoveryCooldownSince(new Date());
    const recent = row.membershipId
      ? await db
          .select({ id: whopPayments.id })
          .from(whopPayments)
          .where(
            and(
              eq(whopPayments.engagementId, engagementId),
              eq(whopPayments.membershipId, row.membershipId),
              ne(whopPayments.paymentId, paymentId),
              isNotNull(whopPayments.recoveryStatus),
              or(gte(whopPayments.recoverySentAt, since), and(eq(whopPayments.recoveryStatus, "queued"), gte(whopPayments.updatedAt, since)))
            )
          )
      : [];

    const decision = decideRecovery(row, recent.length);
    if (!decision.go) {
      await logStep(runId, { phase: "eligibility_check", status: "skipped", detail: decision.reason });
      await finishRun(runId, { status: "skipped", summary: { whatWasAttempted: ["Eligibility check"], whatWorked: [], whatFailed: [], openItems: [], decisionsMade: [decision.reason] } });
      return { queued: false, reason: decision.reason };
    }
    await logStep(runId, { phase: "eligibility_check", status: "success" });

    await logStep(runId, { phase: "fix_link", status: "running" });
    const client = await WhopAgentClient.forEngagement(engagementId);
    const link = await fixLink(client, paymentId, row.membershipId);
    await logStep(runId, { phase: "fix_link", status: link ? "success" : "skipped", detail: link ? undefined : "Whop gave no update-card link; the message points to their Whop account instead." });

    const [tenant] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
    const template = (tenant?.stack as EngagementStack | null)?.whop_recovery_message?.trim() || DEFAULT_RECOVERY_MESSAGE;
    const message = renderRecoveryMessage(template, row, link);
    const amount = formatAmount(row.amount, row.currency);

    const actionId = await queuePendingAction(
      engagementId,
      "whop_payment_recovery_send",
      { paymentId, recipient: decision.recipient, buyerEmail: row.email, message, link },
      `${row.buyerName ?? row.email ?? "A buyer"}'s payment${amount ? ` of ${amount}` : ""} failed${row.failureMessage ? ` (${row.failureMessage})` : ""}. Approve to send them this Whop message: "${message}"`
    );
    await setRecovery(engagementId, paymentId, { recoveryStatus: "queued", recoveryError: null });

    await finishRun(runId, {
      summary: {
        whatWasAttempted: ["Eligibility check", "Fix link", "Recovery message draft"],
        whatWorked: [`Drafted the message and queued it as ${actionId}`],
        whatFailed: [],
        openItems: ["Waiting for approval in the Queue."],
        decisionsMade: [],
      },
    });
    return { queued: true };
  } catch (err) {
    await failRun(runId, err).catch(() => {});
    throw err;
  }
}

/** Approved: send it, unless the payment went through in the meantime. */
export async function executePaymentRecoverySend(engagementId: string, payload: { paymentId: string; recipient: string; message: string }): Promise<{ sent: boolean; messageId?: string }> {
  const row = await loadPayment(engagementId, payload.paymentId);
  if (row && row.outcome !== "failed") {
    await setRecovery(engagementId, payload.paymentId, { recoveryStatus: "skipped", recoveryError: "Paid before the message was approved, so nothing was sent." });
    return { sent: false };
  }

  const client = await WhopAgentClient.forEngagement(engagementId);
  try {
    const channel = await client.request<{ id: string }>("dm_channels.create", "/v1/dm_channels", {
      method: "POST",
      body: { with_user_ids: [payload.recipient] },
      idempotencyKey: `whop-recovery-channel:${engagementId}:${payload.paymentId}`,
    });
    const sent = await client.request<{ id: string }>("messages.create", "/v1/messages", {
      method: "POST",
      body: { channel_id: channel.id, content: payload.message },
      idempotencyKey: `whop-recovery-message:${engagementId}:${payload.paymentId}`,
    });
    await setRecovery(engagementId, payload.paymentId, { recoveryStatus: "sent", recoveryMessageId: sent.id ?? null, recoverySentAt: new Date(), recoveryError: null });
    return { sent: true, messageId: sent.id };
  } catch (err) {
    await setRecovery(engagementId, payload.paymentId, { recoveryStatus: "send_failed", recoveryError: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500) });
    throw err;
  }
}
