// src/lib/delivery-receipts.ts
//
// Proof that a message reached the person, not just that our code ran.
// Every text and email the sequences send is logged in
// sequence_message_log; this adds what the provider said about it: the
// provider's own message id (the receipt) and, where the provider reports
// it back, whether it was actually delivered.
//
//   Twilio  → message SID, then delivered / undelivered / failed through
//             the status callback (api/webhooks/twilio-status).
//   GHL SMS → GHL's message id. GHL reports no delivery status back here.
//   SMTP    → the Message-ID the receiving server accepted.
//   Resend  → Resend's email id.
//
// "accepted" means the provider took the message and gave us an id;
// "delivered" means the provider confirmed it reached the phone or inbox.
// A skill is healthy when its recent sends have receipts and none came
// back undelivered or failed.

import crypto from "crypto";
import { db } from "@/lib/db";
import { sequenceMessageLog } from "@/models/schema";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { webhookUrl } from "@/lib/webhook-url-token";
import type { SkillDeliveryProof } from "@/lib/delivery-receipts-shared";

export type { SkillDeliveryProof } from "@/lib/delivery-receipts-shared";
export { deliveryLine, type DeliveryLine } from "@/lib/delivery-receipts-shared";

export type DeliveryStatus = "accepted" | "sent" | "delivered" | "undelivered" | "failed";

export interface SendReceipt {
  provider: "twilio" | "ghl_sms" | "smtp" | "resend";
  providerMessageId: string | null;
}

/** Delivered, undelivered and failed are final: a late "sent" callback
 * arriving after "delivered" must not move it back. */
const FINAL: ReadonlySet<DeliveryStatus> = new Set(["delivered", "undelivered", "failed"]);
const RANK: Record<DeliveryStatus, number> = { accepted: 0, sent: 1, delivered: 2, undelivered: 2, failed: 2 };

export function nextDeliveryStatus(current: DeliveryStatus | null, incoming: DeliveryStatus): DeliveryStatus {
  if (!current) return incoming;
  if (FINAL.has(current)) return current;
  return RANK[incoming] >= RANK[current] ? incoming : current;
}

/** Twilio's MessageStatus values, mapped onto ours. Unknown values are
 * ignored rather than guessed at. */
export function twilioDeliveryStatus(messageStatus: string | null | undefined): DeliveryStatus | null {
  switch ((messageStatus ?? "").toLowerCase()) {
    case "queued":
    case "accepted":
    case "scheduled":
      return "accepted";
    case "sending":
    case "sent":
      return "sent";
    case "delivered":
    case "read":
      return "delivered";
    case "undelivered":
      return "undelivered";
    case "failed":
    case "canceled":
      return "failed";
    default:
      return null;
  }
}

/**
 * Twilio signs every callback: base64 HMAC-SHA1, keyed by the account's
 * auth token, over the exact URL Twilio was given followed by each POST
 * parameter's name and value, sorted by name. The URL must be the one we
 * handed Twilio, not the one the request arrived on (a proxy can rewrite
 * the host or scheme).
 */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return crypto.createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
}

export function isValidTwilioSignature(authToken: string, url: string, params: Record<string, string>, given: string | null): boolean {
  if (!given) return false;
  const expected = Buffer.from(twilioSignature(authToken, url, params));
  const actual = Buffer.from(given);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/** Applies a provider's status report to the logged message it belongs to.
 * Returns false when no logged message carries that id (not ours, or
 * logged under another engagement). */
export async function recordDeliveryStatus(
  engagementId: string,
  providerMessageId: string,
  incoming: DeliveryStatus,
  error: string | null,
  at = new Date()
): Promise<boolean> {
  const [row] = await db
    .select({ id: sequenceMessageLog.id, deliveryStatus: sequenceMessageLog.deliveryStatus })
    .from(sequenceMessageLog)
    .where(and(eq(sequenceMessageLog.engagementId, engagementId), eq(sequenceMessageLog.providerMessageId, providerMessageId)))
    .limit(1);
  if (!row) return false;
  const next = nextDeliveryStatus((row.deliveryStatus as DeliveryStatus | null) ?? null, incoming);
  if (next === row.deliveryStatus) return true;
  await db
    .update(sequenceMessageLog)
    .set({
      deliveryStatus: next,
      deliveryError: next === "undelivered" || next === "failed" ? error : null,
      deliveredAt: next === "delivered" ? at : null,
      deliveryUpdatedAt: at,
    })
    .where(eq(sequenceMessageLog.id, row.id));
  return true;
}

// ── Per-skill proof, for the skills list ─────────────────────────────────

/** Which skill each logged sequence belongs to. */
export const SEQUENCE_SKILL: Record<string, "pile-on" | "win-back"> = {
  pile_on_sms: "pile-on",
  win_back_sms: "win-back",
  win_back_email_smtp: "win-back",
};

/** A provider that confirms delivery; for the others a receipt (the id
 * the provider accepted) is the proof available. */
const CONFIRMS_DELIVERY = new Set(["twilio"]);

export function isProven(row: { provider: string | null; providerMessageId: string | null; deliveryStatus: string | null }): boolean {
  if (!row.providerMessageId || !row.provider) return false;
  if (CONFIRMS_DELIVERY.has(row.provider)) return row.deliveryStatus === "delivered";
  return row.deliveryStatus !== "undelivered" && row.deliveryStatus !== "failed";
}

export function isFailedSend(row: { status: string; deliveryStatus: string | null }): boolean {
  return row.status === "failed" || row.deliveryStatus === "undelivered" || row.deliveryStatus === "failed";
}

export function summarizeDeliveryProof(
  rows: { sequenceType: string; channel: string; status: string; provider: string | null; providerMessageId: string | null; deliveryStatus: string | null; deliveryError: string | null; error: string | null; sentAt: Date; deliveredAt: Date | null }[],
  windowStart: Date
): Partial<Record<"pile-on" | "win-back", SkillDeliveryProof>> {
  const out: Partial<Record<"pile-on" | "win-back", SkillDeliveryProof>> = {};
  const sorted = [...rows].sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
  for (const row of sorted) {
    const skill = SEQUENCE_SKILL[row.sequenceType];
    if (!skill) continue;
    const proof = (out[skill] ??= { lastProvenAt: null, lastProvenChannel: null, failedRecently: 0, sentRecently: 0, lastFailureReason: null });
    if (!proof.lastProvenAt && isProven(row)) {
      proof.lastProvenAt = (row.deliveredAt ?? row.sentAt).toISOString();
      proof.lastProvenChannel = row.channel === "email" ? "email" : "sms";
    }
    if (row.sentAt >= windowStart) {
      proof.sentRecently++;
      if (isFailedSend(row)) {
        proof.failedRecently++;
        proof.lastFailureReason ??= row.deliveryError ?? row.error ?? "The provider reported it undelivered.";
      }
    }
  }
  return out;
}

const PROOF_LOOKBACK_DAYS = 30;
const FAILURE_WINDOW_HOURS = 24;

export async function deliveryProofForEngagement(engagementId: string, now = new Date()): Promise<Partial<Record<"pile-on" | "win-back", SkillDeliveryProof>>> {
  const since = new Date(now.getTime() - PROOF_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      sequenceType: sequenceMessageLog.sequenceType,
      channel: sequenceMessageLog.channel,
      status: sequenceMessageLog.status,
      provider: sequenceMessageLog.provider,
      providerMessageId: sequenceMessageLog.providerMessageId,
      deliveryStatus: sequenceMessageLog.deliveryStatus,
      deliveryError: sequenceMessageLog.deliveryError,
      error: sequenceMessageLog.error,
      sentAt: sequenceMessageLog.sentAt,
      deliveredAt: sequenceMessageLog.deliveredAt,
    })
    .from(sequenceMessageLog)
    .where(and(eq(sequenceMessageLog.engagementId, engagementId), gte(sequenceMessageLog.sentAt, since), inArray(sequenceMessageLog.sequenceType, Object.keys(SEQUENCE_SKILL))))
    .orderBy(sql`${sequenceMessageLog.sentAt} desc`)
    .limit(500);
  return summarizeDeliveryProof(rows, new Date(now.getTime() - FAILURE_WINDOW_HOURS * 60 * 60 * 1000));
}

// ── Where Twilio reports back ────────────────────────────────────────────

export const TWILIO_STATUS_PATH = "twilio-status";

/** The status-callback address for one client's texts, carrying the
 * per-client token. Null without a public app URL: Twilio can't call a
 * localhost address, so there is nothing to hand it. */
export function twilioStatusCallbackUrl(engagementId: string, appUrl = process.env.NEXT_PUBLIC_APP_URL): string | null {
  if (!appUrl || /localhost|127\.0\.0\.1/.test(appUrl)) return null;
  return webhookUrl(appUrl, TWILIO_STATUS_PATH, engagementId);
}

/** The columns a successful send writes into sequence_message_log. */
export function receiptColumns(receipt: SendReceipt | null | undefined) {
  if (!receipt) return {};
  return {
    provider: receipt.provider,
    providerMessageId: receipt.providerMessageId,
    deliveryStatus: receipt.providerMessageId ? ("accepted" as const) : null,
    deliveryUpdatedAt: new Date(),
  };
}
