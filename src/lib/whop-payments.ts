// src/lib/whop-payments.ts
//
// Keeps every payment Whop reports for a client (whop_payments), so a sale
// can be tied to the person who booked and showed, and a failed payment
// can be chased. Fed by the Whop Agent webhook (inngest/whop-agent.ts):
//
//   payment.succeeded / payment.failed → the payment itself (Whop's Payment:
//        id, status, total, usd_total, currency, user.email, member.phone,
//        paid_at, failure_message, next_payment_attempt, refunded_amount)
//   refund.created   → data.payment.id, data.amount
//   dispute.created  → data.payment.id, data.customer_email_address
//
// Field names are Whop's, from its own SDK (@whop/sdk resources/shared.d.ts
// Payment, disputes.d.ts Dispute, webhooks.d.ts RefundCreatedWebhookEvent).

import { db } from "@/lib/db";
import { whopPayments } from "@/models/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

export type PaymentOutcome = "failed" | "paid" | "refunded" | "disputed";

/** What a later event can change: a payment that was refunded or disputed
 * stays that way even if a late "succeeded" delivery arrives afterwards. */
const RANK: Record<PaymentOutcome, number> = { failed: 0, paid: 1, refunded: 2, disputed: 3 };
export function laterOutcome(current: PaymentOutcome | null, incoming: PaymentOutcome): PaymentOutcome {
  if (!current) return incoming;
  return RANK[incoming] >= RANK[current] ? incoming : current;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const date = (v: unknown): Date | null => {
  const s = text(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

export interface PaymentUpdate {
  paymentId: string;
  outcome: PaymentOutcome;
  fields: Partial<typeof whopPayments.$inferInsert>;
}

export const PAYMENT_EVENT_TYPES = new Set(["payment.succeeded", "payment.failed", "refund.created", "dispute.created"]);

/** What one Whop event says about a payment. Null when it isn't about one. */
export function paymentUpdateFromEvent(type: string, data: unknown): PaymentUpdate | null {
  const d = obj(data);
  if (!d) return null;

  if (type === "payment.succeeded" || type === "payment.failed") {
    const paymentId = text(d.id);
    if (!paymentId) return null;
    const user = obj(d.user);
    const member = obj(d.member);
    const product = obj(d.product);
    return {
      paymentId,
      outcome: type === "payment.succeeded" ? "paid" : "failed",
      fields: {
        email: text(user?.email)?.toLowerCase() ?? null,
        buyerName: text(user?.name),
        phone: text(member?.phone),
        membershipId: text(obj(d.membership)?.id),
        productTitle: text(product?.title),
        status: text(d.status),
        amount: num(d.total),
        currency: text(d.currency),
        usdAmount: num(d.usd_total),
        refundedAmount: num(d.refunded_amount),
        failureMessage: text(d.failure_message),
        nextPaymentAttemptAt: date(d.next_payment_attempt),
        paidAt: date(d.paid_at),
      },
    };
  }

  if (type === "refund.created") {
    const paymentId = text(obj(d.payment)?.id);
    if (!paymentId) return null;
    return { paymentId, outcome: "refunded", fields: { refundedAmount: num(d.amount), currency: text(d.currency) } };
  }

  if (type === "dispute.created") {
    const paymentId = text(obj(d.payment)?.id);
    if (!paymentId) return null;
    return { paymentId, outcome: "disputed", fields: { email: text(d.customer_email_address)?.toLowerCase() ?? null, buyerName: text(d.customer_name), productTitle: text(obj(d.product)?.title) } };
  }

  return null;
}

/** Only fields the event actually carried: a refund doesn't blank out the
 * buyer's email the payment event recorded. */
function definedOnly<T extends Obj>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined)) as Partial<T>;
}

export async function recordWhopPaymentEvent(engagementId: string, type: string, data: unknown, occurredAt: Date): Promise<PaymentUpdate | null> {
  const update = paymentUpdateFromEvent(type, data);
  if (!update) return null;

  const [existing] = await db
    .select({ outcome: whopPayments.outcome })
    .from(whopPayments)
    .where(and(eq(whopPayments.engagementId, engagementId), eq(whopPayments.paymentId, update.paymentId)))
    .limit(1);
  const outcome = laterOutcome((existing?.outcome as PaymentOutcome | undefined) ?? null, update.outcome);
  const fields = definedOnly(update.fields);

  await db
    .insert(whopPayments)
    .values({ engagementId, paymentId: update.paymentId, outcome, occurredAt, ...fields })
    .onConflictDoUpdate({
      target: [whopPayments.engagementId, whopPayments.paymentId],
      set: { ...fields, outcome, occurredAt, updatedAt: new Date() },
    });
  return { ...update, outcome };
}

export interface BuyerPayment {
  paymentId: string;
  email: string | null;
  outcome: PaymentOutcome;
  amount: number | null;
  currency: string | null;
  refundedAmount: number | null;
  productTitle: string | null;
  paidAt: Date | null;
  occurredAt: Date;
  failureMessage: string | null;
}

/** Payments by these buyers' emails, newest first. */
export async function paymentsForEmails(engagementId: string, emails: string[]): Promise<BuyerPayment[]> {
  const wanted = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (wanted.length === 0) return [];
  return db
    .select({
      paymentId: whopPayments.paymentId,
      email: whopPayments.email,
      outcome: whopPayments.outcome,
      amount: whopPayments.amount,
      currency: whopPayments.currency,
      refundedAmount: whopPayments.refundedAmount,
      productTitle: whopPayments.productTitle,
      paidAt: whopPayments.paidAt,
      occurredAt: whopPayments.occurredAt,
      failureMessage: whopPayments.failureMessage,
    })
    .from(whopPayments)
    .where(and(eq(whopPayments.engagementId, engagementId), inArray(whopPayments.email, wanted)))
    .orderBy(sql`${whopPayments.occurredAt} desc`) as Promise<BuyerPayment[]>;
}
