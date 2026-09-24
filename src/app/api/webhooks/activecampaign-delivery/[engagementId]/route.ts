// src/app/api/webhooks/activecampaign-delivery/[engagementId]/route.ts
//
// Phase 6 — ActiveCampaign bounce ingestion for Win-Back's auto-pause
// (esp-delivery-monitor.ts).
//
// VERIFICATION STATUS (see klaviyo-delivery/route.ts's header for why
// this session couldn't WebFetch primary docs):
//   - `bounce` is a real, documented ActiveCampaign webhook event type —
//     MEDIUM confidence.
//   - There is NO confirmed distinct "spam complaint" event type for
//     ActiveCampaign. Evidence suggests complaint-driven unsubscribes
//     fold into the ordinary `unsubscribe` event with no confirmed
//     payload field distinguishing "they clicked unsubscribe" from "this
//     was a spam complaint." Rather than guess at a field that might not
//     exist and silently miscount ordinary unsubscribes as complaints,
//     this route deliberately does NOT attempt complaint detection for
//     ActiveCampaign — a real, honestly-documented gap. Bounce-rate
//     monitoring still works on this platform; complaint-rate monitoring
//     simply never fires for an ActiveCampaign-only client.
//   - Signature: ActiveCampaign lets the OPERATOR name their own custom
//     header when creating the webhook in AC's UI, and flags exactly one
//     header `is_signature: true` — that header's value is an
//     HMAC-SHA256 of the raw request body using the webhook's configured
//     secret. The header NAME is stored per-engagement
//     (stack.activecampaign_webhook_signature_header), the secret VALUE
//     in the credential vault ("activecampaign_webhook_secret") — see
//     schema.ts's own comment on the stack field for why these are split.
//   - Exact payload field names for a `bounce` event (contact email,
//     bounce type) are UNVERIFIED — parsed defensively below, with the
//     raw payload logged when nothing recognizable is found.

import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { engagements, webhookEvents, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { hasCredential, resolveCredential } from "@/lib/credentials";
import { recordDeliveryEvent } from "@/lib/esp-delivery-events";
import { checkAndApplyAutoPause } from "@/features/win-back/server/esp-delivery-monitor";
import { webhookTokenGate } from "@/lib/webhook-gate";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ engagementId: string }> }) {
  const { engagementId } = await params;

  const [tenant] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  if (!tenant) return NextResponse.json({ success: true });

  const stack = tenant.stack as EngagementStack | null;
  if (stack?.email_platform !== "activecampaign") return NextResponse.json({ success: true, ignored: true });

  const rawBody = await req.text();

  if (stack.activecampaign_webhook_signature_header && (await hasCredential(engagementId, "activecampaign_webhook_secret"))) {
    const provided = req.headers.get(stack.activecampaign_webhook_signature_header);
    const secret = await resolveCredential(engagementId, "activecampaign_webhook_secret");
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    const providedBuf = Buffer.from(provided ?? "");
    const expectedBuf = Buffer.from(expected);
    if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
      console.warn(`[activecampaign-delivery] Rejected webhook with invalid signature for engagement ${engagementId}.`);
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else {
    // No signature of its own: the address's token has to be right.
    const gate = webhookTokenGate(engagementId, req.url, "ActiveCampaign bounce feed");
    if (gate) return gate;
  }

  const contentType = req.headers.get("content-type") ?? "";
  let fields: Record<string, unknown>;
  try {
    if (contentType.includes("application/json")) {
      fields = JSON.parse(rawBody);
    } else {
      const form = new URLSearchParams(rawBody);
      fields = Object.fromEntries(form.entries());
    }
  } catch (e: any) {
    return NextResponse.json({ error: `Couldn't parse payload: ${e.message}` }, { status: 400 });
  }

  const type = String(fields["type"] ?? fields["event"] ?? "").toLowerCase();
  const email = String(fields["email"] ?? fields["contact[email]"] ?? "") || null;
  const idempotencyKey = crypto.createHash("sha256").update(rawBody).digest("hex");

  const [claimed] = await db
    .insert(webhookEvents)
    .values({ id: crypto.randomUUID(), engagementId, eventSource: "activecampaign-delivery", idempotencyKey, eventKind: type || "unknown" })
    .onConflictDoNothing({ target: [webhookEvents.eventSource, webhookEvents.idempotencyKey] })
    .returning({ id: webhookEvents.id });
  if (!claimed) return NextResponse.json({ success: true, duplicate: true });
  // A failure here answers 500 so the platform retries; the claim row
  // is released first, or the retry would be swallowed as a duplicate.
  try {

    if (type.includes("bounce")) {
      await recordDeliveryEvent(engagementId, "activecampaign", "bounced", email, new Date());
      await checkAndApplyAutoPause(engagementId);
    } else if (type && type !== "unsubscribe") {
      // unsubscribe deliberately not logged as noise — it's a real,
      // expected, frequent event this route just isn't built to act on.
      console.warn(`[activecampaign-delivery] Event type "${type}" received for engagement ${engagementId} but not handled. Raw fields:`, JSON.stringify(fields).slice(0, 500));
    }

  } catch (err: unknown) {
    console.error("[activecampaign-delivery] processing failed; releasing the claim so the retry is handled:", err);
    await db.delete(webhookEvents).where(eq(webhookEvents.id, claimed.id)).catch(() => {});
    return NextResponse.json({ error: "Processing failed. Retry." }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
