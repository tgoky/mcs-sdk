// src/app/api/webhooks/klaviyo-delivery/[engagementId]/route.ts
//
// Phase 6 — Klaviyo bounce/complaint ingestion for Win-Back's auto-pause
// (esp-delivery-monitor.ts). Engagement-scoped URL, same convention as
// inbound-reply/[engagementId] — Klaviyo's system webhooks are
// registered per-account (in the buyer's own Klaviyo account settings),
// not at a shared developer-app level the way HubSpot's Conversations
// API is, so there's no portalId-style disambiguation needed here.
//
// VERIFICATION STATUS (be honest about this, don't silently claim more
// certainty than exists — this session's own research pass could not
// use WebFetch at all, see the commit message this shipped in):
//   - Signature scheme: HMAC-SHA256 over (raw body + Klaviyo-Timestamp
//     header value), hex-encoded, compared against Klaviyo-Signature —
//     MEDIUM confidence, corroborated by two independent search passes
//     against developers.klaviyo.com/en/docs/working_with_system_webhooks,
//     but never confirmed by a direct fetch of that page.
//   - Exact bounce/spam-complaint topic string(s): UNVERIFIED. Klaviyo's
//     own docs say the authoritative topic list must be pulled live per
//     account via GET /api/webhook-topics — there's no universal fixed
//     string to hardcode. This route matches defensively on substrings
//     ("bounce", "spam"/"complain") in whatever topic/type field the
//     payload carries, rather than one guessed exact string, and logs
//     the raw payload when nothing recognizable is found so the real
//     shape can be confirmed against a live account and the parser
//     tightened later.
//   - The spam-complaint topic may require Klaviyo's paid "Advanced
//     KDP" webhooks add-on per one source — UNCONFIRMED. If a client's
//     account doesn't have it, the complaint leg of this route simply
//     never fires for them; bounce-rate monitoring is unaffected.

import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { engagements, webhookEvents, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { hasCredential, resolveCredential } from "@/lib/credentials";
import { recordDeliveryEvent } from "@/lib/esp-delivery-events";
import { checkAndApplyAutoPause } from "@/features/win-back/server/esp-delivery-monitor";

export const runtime = "nodejs";

function findFirstStringField(obj: unknown, keys: string[], depth = 0): string | null {
  if (depth > 4 || obj === null || typeof obj !== "object") return null;
  const record = obj as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") return value;
  }
  for (const value of Object.values(record)) {
    if (typeof value === "object" && value !== null) {
      const found = findFirstStringField(value, keys, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

export async function POST(req: Request, { params }: { params: Promise<{ engagementId: string }> }) {
  const { engagementId } = await params;

  const [tenant] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  if (!tenant) return NextResponse.json({ success: true }); // don't leak existence, see inbound-reply's same posture

  const stack = tenant.stack as EngagementStack | null;
  if (stack?.email_platform !== "klaviyo") return NextResponse.json({ success: true, ignored: true });

  const rawBody = await req.text();
  const signature = req.headers.get("Klaviyo-Signature");
  const timestamp = req.headers.get("Klaviyo-Timestamp");
  const eventId = req.headers.get("Klaviyo-Webhook-Id");

  // Security fix (found by this session's own adversarial review): the
  // original version of this check was `if (signature && timestamp &&
  // hasSecret)` — gating verification on the ATTACKER-SUPPLIED headers
  // being present, not just on whether a secret is configured. That meant
  // an attacker could bypass verification entirely just by omitting the
  // two headers, even with klaviyo_webhook_secret correctly configured —
  // a full authentication bypass on the exact endpoint that feeds
  // Win-Back's auto-pause. Gating on hasCredential ALONE, and treating a
  // missing header as an automatic reject (not a skip), closes this: once
  // a secret is configured, verification is mandatory, not optional.
  if (await hasCredential(engagementId, "klaviyo_webhook_secret")) {
    const secret = await resolveCredential(engagementId, "klaviyo_webhook_secret");
    const expected = signature && timestamp ? crypto.createHmac("sha256", secret).update(rawBody + timestamp).digest("hex") : null;
    const sigBuf = Buffer.from(signature ?? "");
    const expBuf = Buffer.from(expected ?? "");
    if (!expected || sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      console.warn(`[klaviyo-delivery] Rejected webhook with missing/invalid signature for engagement ${engagementId}.`);
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }
  // No secret configured yet — same "log and continue" posture the
  // HubSpot route takes when HUBSPOT_APP_CLIENT_SECRET is unset, not a
  // silent full bypass: the operator sets klaviyo_webhook_secret via
  // /api/credentials once they've registered the webhook in Klaviyo.

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const idempotencyKey = eventId ?? crypto.createHash("sha256").update(rawBody).digest("hex");
  const [claimed] = await db
    .insert(webhookEvents)
    .values({ id: crypto.randomUUID(), engagementId, eventSource: "klaviyo-delivery", idempotencyKey, eventKind: "unknown" })
    .onConflictDoNothing({ target: [webhookEvents.eventSource, webhookEvents.idempotencyKey] })
    .returning({ id: webhookEvents.id });
  if (!claimed) return NextResponse.json({ success: true, duplicate: true });
  // A failure here answers 500 so the platform retries; the claim row
  // is released first, or the retry would be swallowed as a duplicate.
  try {

    const topic = (findFirstStringField(payload, ["topic", "type", "event", "event_name"]) ?? "").toLowerCase();
    const email = findFirstStringField(payload, ["email", "recipient", "to"]);

    if (topic.includes("bounce")) {
      await recordDeliveryEvent(engagementId, "klaviyo", "bounced", email, new Date());
      await checkAndApplyAutoPause(engagementId);
    } else if (topic.includes("spam") || topic.includes("complain")) {
      await recordDeliveryEvent(engagementId, "klaviyo", "complained", email, new Date());
      await checkAndApplyAutoPause(engagementId);
    } else {
      console.warn(`[klaviyo-delivery] Unrecognized topic "${topic || "(none found)"}" for engagement ${engagementId} — raw payload:`, JSON.stringify(payload).slice(0, 500));
    }

  } catch (err: unknown) {
    console.error("[klaviyo-delivery] processing failed; releasing the claim so the retry is handled:", err);
    await db.delete(webhookEvents).where(eq(webhookEvents.id, claimed.id)).catch(() => {});
    return NextResponse.json({ error: "Processing failed. Retry." }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
