// src/app/api/webhooks/mailchimp-delivery/[engagementId]/route.ts
//
// Phase 6 — Mailchimp bounce/complaint ingestion for Win-Back's
// auto-pause (esp-delivery-monitor.ts).
//
// VERIFICATION STATUS: MEDIUM-HIGH confidence, not WebFetch-confirmed
// (see klaviyo-delivery/route.ts's header for why). This app's
// MailchimpClient uses the Marketing API (api.mailchimp.com/3.0,
// lists/members) — NOT Mandrill/Transactional, which has a completely
// different (HMAC-SHA1, X-Mandrill-Signature) scheme that does NOT apply
// here. The Marketing API's list webhooks have a materially different,
// WEAKER security model than every other platform in this file: there is
// no cryptographic signature at all. Mailchimp's own documented pattern
// (per search-derived sources) is:
//   1. A `?secret=...` query param embedded in the webhook URL itself,
//      compared in constant time on every POST.
//   2. Mailchimp sends a GET to the URL when the webhook is first saved,
//      to confirm it's reachable — must respond 200 with no auth
//      required on that GET, or Mailchimp refuses to save the webhook.
//   3. Payloads are form-encoded, not JSON.
// There is no separate "spam complaint" event type — bounces AND
// complaints both arrive as `type=cleaned`, distinguished by the
// `data[reason]` field: "hard" (bounce) vs "abuse" (complaint) vs
// "other". This reason-value spelling is the single most load-bearing
// UNVERIFIED fact in this route — if Mailchimp's real values differ,
// every cleaned event falls into the "unrecognized reason" branch below
// and gets logged instead of silently misclassified.

import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { engagements, webhookEvents, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { hasCredential, resolveCredential } from "@/lib/credentials";
import { recordDeliveryEvent } from "@/lib/esp-delivery-events";
import { checkAndApplyAutoPause } from "@/features/win-back/server/esp-delivery-monitor";

export const runtime = "nodejs";

/** Mailchimp's reachability check when the webhook is first saved — must
 * succeed with no auth required, per its documented handshake. */
export async function GET() {
  return new NextResponse("ok", { status: 200 });
}

export async function POST(req: Request, { params }: { params: Promise<{ engagementId: string }> }) {
  const { engagementId } = await params;

  const [tenant] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  if (!tenant) return NextResponse.json({ success: true });

  const stack = tenant.stack as EngagementStack | null;
  if (stack?.email_platform !== "mailchimp") return NextResponse.json({ success: true, ignored: true });

  const url = new URL(req.url);
  const providedSecret = url.searchParams.get("secret");
  if (await hasCredential(engagementId, "mailchimp_webhook_secret")) {
    const expectedSecret = await resolveCredential(engagementId, "mailchimp_webhook_secret");
    const providedBuf = Buffer.from(providedSecret ?? "");
    const expectedBuf = Buffer.from(expectedSecret);
    if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
      console.warn(`[mailchimp-delivery] Rejected webhook with invalid/missing secret for engagement ${engagementId}.`);
      return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
    }
  }
  // No secret configured yet — same "log and continue" posture every
  // other route in this file takes for optional verification.

  const contentType = req.headers.get("content-type") ?? "";
  let fields: Record<string, string>;
  try {
    if (contentType.includes("application/json")) {
      fields = flattenToStrings(await req.json());
    } else {
      const form = await req.formData();
      fields = Object.fromEntries(Array.from(form.entries()).map(([k, v]) => [k, String(v)]));
    }
  } catch (e: any) {
    return NextResponse.json({ error: `Couldn't parse payload: ${e.message}` }, { status: 400 });
  }

  // Mailchimp's own doc'd field names for a list webhook: `type`, `fired_at`,
  // `data[id]`, `data[email]`, `data[reason]` (form-encoded nested-bracket
  // notation) — matched here without assuming JSON nesting survived intact.
  const type = fields["type"] ?? "";
  const email = fields["data[email]"] ?? fields["email"] ?? null;
  const reason = (fields["data[reason]"] ?? fields["reason"] ?? "").toLowerCase();
  const idempotencyKey = fields["fired_at"] ? `${type}:${email}:${fields["fired_at"]}` : crypto.createHash("sha256").update(JSON.stringify(fields)).digest("hex");

  const [claimed] = await db
    .insert(webhookEvents)
    .values({ id: crypto.randomUUID(), engagementId, eventSource: "mailchimp-delivery", idempotencyKey, eventKind: type || "unknown" })
    .onConflictDoNothing({ target: [webhookEvents.eventSource, webhookEvents.idempotencyKey] })
    .returning({ id: webhookEvents.id });
  if (!claimed) return NextResponse.json({ success: true, duplicate: true });

  if (type === "cleaned" && reason === "hard") {
    await recordDeliveryEvent(engagementId, "mailchimp", "bounced", email, new Date());
    await checkAndApplyAutoPause(engagementId);
  } else if (type === "cleaned" && reason === "abuse") {
    await recordDeliveryEvent(engagementId, "mailchimp", "complained", email, new Date());
    await checkAndApplyAutoPause(engagementId);
  } else if (type === "cleaned") {
    console.warn(`[mailchimp-delivery] "cleaned" event with unrecognized reason "${reason}" for engagement ${engagementId} — not counted toward either rate. Raw fields:`, JSON.stringify(fields).slice(0, 500));
  }
  // Other types (subscribe/unsubscribe/profile/upemail/campaign) are
  // real Mailchimp events, just not ones this route needs.

  return NextResponse.json({ success: true });
}

function flattenToStrings(obj: unknown, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  if (obj === null || typeof obj !== "object") return out;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === "object" && value !== null) Object.assign(out, flattenToStrings(value, path));
    else out[path] = String(value);
  }
  return out;
}
