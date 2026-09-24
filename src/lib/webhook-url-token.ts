// src/lib/webhook-url-token.ts
//
// The per-client token on the webhook addresses this app gives out for a
// client's own tools to call: the reply catcher (inbound-reply) and the
// bounce/complaint feeds (mailchimp/activecampaign/klaviyo/convertkit
// -delivery). The engagement id alone used to be the only thing in those
// addresses, and it's neither secret nor hard to guess (the buyer's name
// plus a timestamp, visible in every dashboard URL), so anyone could post
// fake replies or fake complaints, and fake complaints pause Win-Back.
//
// The token is derived, not stored: HMAC of the engagement id under a
// server secret, so every address can be rebuilt anywhere with no table.
//
// Addresses handed out before the token existed keep working until
// WEBHOOK_TOKEN_GRACE_UNTIL so a client's tools don't break overnight.
// Until then an address without a token is "legacy": its events are
// recorded but can't pause anything, and the owner is told to update it.
// After that date it's rejected.

import crypto from "crypto";

const LABEL = "webhook-url-token:v1:";

function secret(): string {
  const s = process.env.WEBHOOK_URL_SECRET || process.env.SESSION_SECRET;
  if (!s) throw new Error("WEBHOOK_URL_SECRET (or SESSION_SECRET) must be set to issue webhook addresses.");
  return s;
}

export function webhookUrlToken(engagementId: string): string {
  return crypto.createHmac("sha256", secret()).update(LABEL + engagementId).digest("base64url").slice(0, 32);
}

/** Until then, addresses given out before the token existed still work. */
export function webhookTokenGraceUntil(): number {
  const configured = Date.parse(process.env.WEBHOOK_TOKEN_GRACE_UNTIL ?? "");
  return Number.isFinite(configured) ? configured : Date.parse("2026-10-24T00:00:00Z");
}

export type WebhookTokenCheck = "valid" | "legacy" | "rejected";

/** "valid": the right token. "legacy": no token, inside the grace period.
 * "rejected": a wrong token, or no token after the grace period. */
export function checkWebhookToken(engagementId: string, requestUrl: string, now = Date.now()): WebhookTokenCheck {
  const token = new URL(requestUrl).searchParams.get("token");
  if (!token) return now < webhookTokenGraceUntil() ? "legacy" : "rejected";
  const expected = Buffer.from(webhookUrlToken(engagementId));
  const given = Buffer.from(token);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected) ? "valid" : "rejected";
}

/** The address a client's tool should call, token included. */
export function webhookUrl(appUrl: string, path: string, engagementId: string): string {
  return `${appUrl.replace(/\/+$/, "")}/api/webhooks/${path}/${encodeURIComponent(engagementId)}?token=${webhookUrlToken(engagementId)}`;
}
