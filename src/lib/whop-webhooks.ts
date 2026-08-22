import WhopSDK from "@whop/sdk";

/**
 * Separate from whop-access.ts's client() singleton on purpose: that one is
 * built for reading memberships (apiKey only). This one verifies inbound
 * webhook signatures, which needs a second secret (WHOP_WEBHOOK_SECRET) that
 * has nothing to do with the API key and shouldn't leak into the read path.
 *
 * Whop webhooks follow the Standard Webhooks spec: HMAC-SHA256 over
 * "{webhook-id}.{webhook-timestamp}.{raw body}", keyed by the ws_... secret
 * from the webhook's dashboard entry. The SDK's webhooks.unwrap() verifies
 * this and parses the event in one call, and expects the key base64-encoded
 * (per Whop's docs — the Standard Webhooks verifier underneath wants base64,
 * not the raw ws_... string).
 */

const WHOP_WEBHOOK_SECRET = process.env.WHOP_WEBHOOK_SECRET;

let _client: WhopSDK | null = null;
function client(): WhopSDK {
  if (!_client) {
    if (!WHOP_WEBHOOK_SECRET) {
      throw new Error(
        "WHOP_WEBHOOK_SECRET is not set — cannot verify webhook signatures. " +
          "Copy it from Whop Dashboard → Developer → Webhooks after creating the endpoint."
      );
    }
    _client = new WhopSDK({
      apiKey: process.env.WHOP_API_KEY,
      webhookKey: Buffer.from(WHOP_WEBHOOK_SECRET).toString("base64"),
    });
  }
  return _client;
}

/**
 * Verifies and parses an inbound Whop webhook request. Throws if the
 * signature doesn't check out (bad secret, tampered body, or a
 * webhook-timestamp more than 5 minutes old — replay protection the SDK
 * applies automatically). Callers must pass the *raw* body text — parsing
 * it first breaks verification, since the signature covers the exact bytes
 * Whop sent.
 */
export function unwrapWhopWebhook(rawBody: string, headers: Record<string, string>) {
  return client().webhooks.unwrap(rawBody, { headers });
}
