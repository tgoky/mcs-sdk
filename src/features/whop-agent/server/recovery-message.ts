// src/features/whop-agent/server/recovery-message.ts
//
// The pure half of failed-payment recovery (payment-recovery-service.ts):
// the message, who it goes to, whether to send one, and the totals. No db
// imports, so the setup screen can preview the message too.

/** The payment fields these helpers read (whop_payments columns). */
export interface RecoveryPaymentFields {
  outcome: string;
  email: string | null;
  buyerUserId: string | null;
  buyerName: string | null;
  productTitle: string | null;
  amount: number | null;
  currency: string | null;
  recoveryStatus: string | null;
  recoverySentAt: Date | null;
  recoveredAt: Date | null;
  recoveredAmount: number | null;
}

export const DEFAULT_RECOVERY_MESSAGE =
  "Hi {name}, your payment of {amount} for {product} didn't go through, so your access may pause. You can update your card here: {link}. Reply here if anything's wrong.";

/** Don't message the same membership twice in this many days. */
export const RECOVERY_COOLDOWN_DAYS = 3;

export function recoveryCooldownSince(now: Date): Date {
  return new Date(now.getTime() - RECOVERY_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
}


export function formatAmount(amount: number | null, currency: string | null): string | null {
  if (amount == null || !currency) return null;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amount);
  } catch {
    return `${amount} ${currency.toUpperCase()}`;
  }
}

/** Fills the client's template. Missing values read naturally rather than
 * leaving a blank or a raw token behind. */
export function renderRecoveryMessage(template: string, row: Pick<RecoveryPaymentFields, "buyerName" | "productTitle" | "amount" | "currency">, link: string | null): string {
  const firstName = row.buyerName?.trim().split(/\s+/)[0] || "there";
  return template
    .replaceAll("{name}", firstName)
    .replaceAll("{product}", row.productTitle?.trim() || "your membership")
    .replaceAll("{amount}", formatAmount(row.amount, row.currency) ?? "your latest payment")
    .replaceAll("{link}", link ?? "your Whop account, under Memberships")
    .replace(/\s+/g, " ")
    .trim();
}

/** Who to message: Whop's user id when the payment carried one, else the
 * buyer's email (dm_channels accepts either). */
export function recoveryRecipient(row: Pick<RecoveryPaymentFields, "buyerUserId" | "email">): string | null {
  return row.buyerUserId?.trim() || row.email?.trim() || null;
}

export type RecoveryDecision = { go: true; recipient: string } | { go: false; reason: string };

/** Whether this failed payment gets a message. `recentForMembership` is
 * other payments on the same membership already messaged or queued within
 * the cooldown. */
export function decideRecovery(row: RecoveryPaymentFields, recentForMembership: number): RecoveryDecision {
  if (row.outcome !== "failed") return { go: false, reason: "The payment isn't failed any more." };
  if (row.recoveryStatus) return { go: false, reason: `Already handled (${row.recoveryStatus}).` };
  if (recentForMembership > 0) return { go: false, reason: `This member was already messaged about a payment in the last ${RECOVERY_COOLDOWN_DAYS} days.` };
  const recipient = recoveryRecipient(row);
  if (!recipient) return { go: false, reason: "Whop didn't include the buyer's user or email (the email needs the member:email:read permission)." };
  return { go: true, recipient };
}

export interface RecoveryTotals {
  failed: number;
  messaged: number;
  recovered: number;
  recoveredValue: number;
  currency: string | null;
}

/** Failed payments since `since`, how many were messaged and how many came
 * back, with the recovered dollars as Whop reported them. */
export function summarizeRecovery(rows: Pick<RecoveryPaymentFields, "outcome" | "recoverySentAt" | "recoveredAt" | "recoveredAmount" | "currency" | "recoveryStatus">[]): RecoveryTotals {
  const failedOrRecovered = rows.filter((r) => r.outcome === "failed" || r.recoveryStatus);
  const recovered = failedOrRecovered.filter((r) => r.recoveredAt);
  const currency = recovered.find((r) => r.currency)?.currency ?? null;
  return {
    failed: failedOrRecovered.length,
    messaged: failedOrRecovered.filter((r) => r.recoverySentAt).length,
    recovered: recovered.length,
    recoveredValue: recovered.filter((r) => r.currency === currency).reduce((s, r) => s + (r.recoveredAmount ?? 0), 0),
    currency,
  };
}
