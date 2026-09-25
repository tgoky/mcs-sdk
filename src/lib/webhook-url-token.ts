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
// Addresses handed out before the token existed are "legacy" until
// WEBHOOK_TOKEN_GRACE_UNTIL, and the owner is told once to update them.
// Until then a legacy reply-forwarding address still delivers replies (a
// real reply isn't lost), while a legacy bounce/complaint feed is
// acknowledged and ignored, so it can never pause Win-Back (see
// webhook-gate.ts). After that date both are rejected.
//
// The secret: set WEBHOOK_URL_SECRET. Without it the token falls back to
// SESSION_SECRET, which ties every client's webhook address to the login
// secret: rotating that would silently break them all. To separate them
// without breaking addresses already handed out, set WEBHOOK_URL_SECRET to
// the current SESSION_SECRET value first; the login secret can then rotate
// on its own.

import crypto from "crypto";

const LABEL = "webhook-url-token:v1:";

let warnedFallback = false;

function secret(): string {
  const own = process.env.WEBHOOK_URL_SECRET;
  if (own) return own;
  const session = process.env.SESSION_SECRET;
  if (!session) throw new Error("WEBHOOK_URL_SECRET (or SESSION_SECRET) must be set to issue webhook addresses.");
  if (!warnedFallback) {
    warnedFallback = true;
    console.warn(
      "[webhook-url-token] WEBHOOK_URL_SECRET is not set, so webhook addresses are signed with SESSION_SECRET. Rotating SESSION_SECRET would invalidate every client's webhook address. Set WEBHOOK_URL_SECRET to the current SESSION_SECRET value to separate them."
    );
  }
  return session;
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
