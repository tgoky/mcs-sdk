// src/lib/whop-agent/webhook-verify.ts
//
// Section 7.1's Standard Webhooks signature verification, implemented
// directly rather than through @whop/sdk's webhooks.unwrap() (whop-
// webhooks.ts) — that path is single-tenant, keyed off one global
// WHOP_WEBHOOK_SECRET env var. Whop Agent needs a distinct secret per
// engagement (each operator's own webhook subscription gets its own
// ws_... secret at creation), so verification has to take the secret as a
// parameter rather than reading one fixed env var.
import crypto from "crypto";

export interface WhopWebhookHeaders {
  webhookId: string | null;
  webhookTimestamp: string | null;
  webhookSignature: string | null;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Section 7.1: "Compute HMAC-SHA256 over {webhook-id}.{webhook-timestamp}.
 * {raw body}, base64-encode, prefix v1,, compare in constant time. Use the
 * ws_... secret exactly as provided; do not strip the prefix and do not
 * base64-encode it first." The HMAC key is therefore the literal UTF-8
 * bytes of the ws_... string — not a base64-decode of it, and not a
 * re-encoding of it.
 *
 * "Reject any payload whose webhook-timestamp is more than 5 minutes from
 * now" — replay protection, checked before the signature comparison so an
 * expired-but-otherwise-valid signature is still rejected.
 *
 * webhook-signature may carry more than one space-separated `v1,<sig>`
 * candidate (Standard Webhooks' own provision for secret rotation) — any
 * matching candidate is accepted.
 */
export function verifyWhopWebhookSignature(rawBody: string, headers: WhopWebhookHeaders, secret: string): { ok: true } | { ok: false; reason: string } {
  const { webhookId, webhookTimestamp, webhookSignature } = headers;
  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return { ok: false, reason: "Missing webhook-id/webhook-timestamp/webhook-signature header." };
  }

  const tsSec = Number(webhookTimestamp);
  if (!Number.isFinite(tsSec)) {
    return { ok: false, reason: "webhook-timestamp is not a valid number." };
  }
  const skewSeconds = Math.abs(Math.floor(Date.now() / 1000) - tsSec);
  if (skewSeconds > 5 * 60) {
    return { ok: false, reason: `webhook-timestamp is ${skewSeconds}s old. Rejected as a possible replay.` };
  }

  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", Buffer.from(secret, "utf8")).update(signedContent).digest("base64");
  const expectedFull = `v1,${expected}`;

  const candidates = webhookSignature.split(" ").map((s) => s.trim()).filter(Boolean);
  const matched = candidates.some((candidate) => safeEqual(candidate, expectedFull));

  return matched ? { ok: true } : { ok: false, reason: "Signature did not match." };
}

/**
 * The inverse of verifyWhopWebhookSignature — signs a payload the exact
 * same way Whop signs a real delivery, using the same ws_... secret this
 * agent already holds for its own agent-created subscriptions. Used by
 * receiver-health-service.ts's re-enable probe: hitting our own receiver
 * route unsigned always fails its signature check (Section 7.1), which
 * would make a disabled agent-created webhook permanently unrecoverable
 * through the "probe, then offer re-enable" flow regardless of whether the
 * receiver is actually healthy.
 */
export function signWhopWebhookPayload(rawBody: string, secret: string): WhopWebhookHeaders {
  const webhookId = `probe_${crypto.randomUUID()}`;
  const webhookTimestamp = String(Math.floor(Date.now() / 1000));
  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
  const signature = crypto.createHmac("sha256", Buffer.from(secret, "utf8")).update(signedContent).digest("base64");
  return { webhookId, webhookTimestamp, webhookSignature: `v1,${signature}` };
}
