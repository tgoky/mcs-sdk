import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { eq, sql } from "drizzle-orm";
import { inngest, inboundReplyReceived } from "@/lib/inngest";
import crypto from "crypto";

/**
 * HubSpot's v3 signature docs (developers.hubspot.com/docs/api/webhooks/
 * validating-requests) say to "decode any of the URL-encoded characters
 * listed in the table below" before hashing the request URI — HubSpot's
 * own signer doesn't percent-encode these when it computes its copy of
 * the signature, so if Next's URL parsing (or anything in front of it)
 * leaves them percent-encoded, the two signatures diverge even though
 * the request is completely legitimate. The docs page doesn't render the
 * table in fetchable text, but a matching, independently-verified list
 * exists in a HubSpot Community post confirmed to work
 * (community.hubspot.com/t5/APIs-Integrations/PHP-Example-for-V3-
 * Signature-Validation-with-full-explanation/td-p/1182453): : / @ ! $ '
 * ( ) * , ;
 */
const HUBSPOT_URI_DECODE_MAP: Record<string, string> = {
  "%3A": ":",
  "%2F": "/",
  "%40": "@",
  "%21": "!",
  "%24": "$",
  "%27": "'",
  "%28": "(",
  "%29": ")",
  "%2A": "*",
  "%2C": ",",
  "%3B": ";",
};

function decodeHubSpotUriChars(uriPart: string): string {
  return uriPart.replace(/%(3A|2F|40|21|24|27|28|29|2A|2C|3B)/gi, (m) => HUBSPOT_URI_DECODE_MAP[m.toUpperCase()] ?? m);
}

/**
 * Win-Back recovery gap 6 — native path, HubSpot Conversations only. See
 * inbound-reply.ts's module comment for why Klaviyo/ActiveCampaign don't
 * have a native path at all.
 *
 * HubSpot's webhook target URL is configured once per developer app, not
 * once per subscription — every buyer portal using this app's HubSpot
 * connection sends inbound events to this SAME url, so unlike the
 * forwarding route (which is engagement-scoped by its own URL path), this
 * one has to disambiguate by the payload's `portalId` against
 * stack.hubspot_portal_id. That field is exactly why it exists — see its
 * doc comment in schema.ts.
 */
export async function POST(req: Request) {
  const signature = req.headers.get("x-hubspot-signature-v3");
  const rawBody = await req.text();

  // HubSpot v3 signature verification: HMAC-SHA256 over
  // method + uri + body + timestamp, using the app's client secret.
  // Skipped (not rejected) when HUBSPOT_APP_CLIENT_SECRET isn't
  // configured, same "log and continue" posture the other webhook routes
  // in this codebase take for optional verification.
  const clientSecret = process.env.HUBSPOT_APP_CLIENT_SECRET;
  if (clientSecret && signature) {
    const timestamp = req.headers.get("x-hubspot-request-timestamp") ?? "";

    // Replay protection — HubSpot's own v3 signature docs call for
    // rejecting any request whose timestamp is more than 5 minutes old.
    // This was previously computed into the HMAC input but never actually
    // checked for staleness, so a captured request+signature pair stayed
    // replayable indefinitely. Mirrors the Calendly verifier's identical
    // check in src/app/api/webhooks/booking-event/route.ts (3-minute
    // window there; 5 minutes here to match HubSpot's documented
    // tolerance rather than reusing Calendly's number).
    const fiveMinutesSec = 5 * 60;
    const nowSec = Math.floor(Date.now() / 1000);
    const timestampSec = Math.floor(Number(timestamp) / 1000);
    if (!timestamp || !Number.isFinite(timestampSec) || Math.abs(nowSec - timestampSec) > fiveMinutesSec) {
      console.warn("[hubspot-conversations] Rejected webhook with missing or stale timestamp.");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // IMPORTANT — operational, not a code bug: HubSpot signs the exact
    // target URL configured for this webhook subscription in the app's
    // developer settings, protocol included (confirmed via HubSpot
    // Community — see the decode-map comment above). NEXT_PUBLIC_APP_URL
    // (or the fallback below) MUST be byte-identical to that configured
    // URL — scheme, host, and any trailing slash — or every signature
    // will fail closed and this route will 401 every real HubSpot
    // delivery while looking like it's "securely verifying." If inbound
    // replies stop working after a domain change, check this first.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://mcs-abra.vercel.app";

    let pathname: string;
    let search: string;

    try {
      const urlObj = new URL(req.url);
      pathname = urlObj.pathname;
      search = urlObj.search;
    } catch {
      // Fallback if req.url is inexplicably relative or mocked in testing
      const qIdx = req.url.indexOf("?");
      pathname = qIdx === -1 ? req.url : req.url.substring(0, qIdx);
      search = qIdx === -1 ? "" : req.url.substring(qIdx);
    }

    pathname = decodeHubSpotUriChars(pathname);
    search = decodeHubSpotUriChars(search);

    const absoluteUri = `${appUrl}${pathname}${search}`;
    const sourceString = `POST${absoluteUri}${rawBody}${timestamp}`;
    const expected = crypto.createHmac("sha256", clientSecret).update(sourceString).digest("base64");

    // Timing-safe comparison — matches the safeEqual() helper the
    // Calendly verifier in booking-event/route.ts already uses for the
    // same reason (a plain !== leaks timing information about how many
    // leading bytes matched).
    const expectedBuf = Buffer.from(expected);
    const signatureBuf = Buffer.from(signature);
    const signatureValid =
      expectedBuf.length === signatureBuf.length &&
      crypto.timingSafeEqual(expectedBuf, signatureBuf);

    if (!signatureValid) {
      console.warn("[hubspot-conversations] Webhook signature verification failed.");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let events: any[];
  try {
    const parsed = JSON.parse(rawBody);
    events = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  for (const event of events) {
    if (event.subscriptionType !== "conversation.newMessage") continue;
    // Only inbound (prospect-authored) messages count as a reply — a
    // message HubSpot logs for an outbound send from this app's own
    // recovery cadence should never trigger exiting the cadence it's
    // part of.
    if (event.messageDirection && event.messageDirection !== "INCOMING") continue;

    const portalId = event.portalId;
    const fromEmail = event.senderEmail ?? event.recipientEmail ?? event.email;
    if (!portalId || !fromEmail) continue;

    const [tenant] = await db
      .select()
      .from(engagements)
      .where(sql`${engagements.stack}->>'hubspot_portal_id' = ${String(portalId)}`)
      .limit(1);

    if (!tenant) {
      console.warn(`[hubspot-conversations] No engagement found for portal ${portalId} — is hubspot_portal_id configured?`);
      continue;
    }

    const stack = tenant.stack as EngagementStack | null;
    if (stack?.inbound_reply_mode !== "native") continue;

    await inngest.send(
      inboundReplyReceived.create({
        engagementId: tenant.engagementId,
        fromEmail,
        subject: null,
        textBody: event.text ?? null,
        source: "native",
      })
    );
  }

  return NextResponse.json({ success: true });
}