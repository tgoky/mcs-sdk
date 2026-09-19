import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { normalizeInboundReplyPayload } from "@/lib/platforms/inbound-reply";
import { inngest, inboundReplyReceived } from "@/lib/inngest";
import { looksLikeBounceNotification, extractBouncedRecipient } from "@/features/win-back/server/smtp-bounce-classifier";
import { recordDeliveryEvent } from "@/lib/esp-delivery-events";
import { checkAndApplyAutoPause } from "@/features/win-back/server/esp-delivery-monitor";

/**
 * Win-Back recovery gap 6 — forwarding path. The operator sets up an
 * inbox rule that forwards replies through an inbound-email-to-webhook
 * bridge (Postmark Inbound, SendGrid Inbound Parse, Mailgun Routes) to
 * this URL, which is unique per engagement so there's no ambiguity about
 * which buyer a reply belongs to (unlike the native/HubSpot path, which
 * has to disambiguate by portal ID — see the hubspot-conversations
 * route's module comment).
 *
 * Accepts either JSON (Postmark's native format) or multipart form data
 * (SendGrid's Inbound Parse format) — normalizeInboundReplyPayload
 * handles both shapes once parsed into a plain object.
 */
export async function POST(req: Request, { params }: { params: Promise<{ engagementId: string }> }) {
  const { engagementId } = await params;

  const [tenant] = await db.select().from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  if (!tenant) {
    // Don't leak whether an engagement ID exists to an unauthenticated
    // caller — just acknowledge. Inbound-parse bridges retry on non-2xx,
    // so a 404 here would cause pointless retry storms for a
    // misconfigured/removed engagement rather than just going quiet.
    return NextResponse.json({ success: true });
  }

  const stack = tenant.stack as EngagementStack | null;
  if (stack?.inbound_reply_mode !== "forwarding") {
    return NextResponse.json({ success: true, ignored: true });
  }

  const contentType = req.headers.get("content-type") ?? "";
  let body: any;
  try {
    if (contentType.includes("application/json")) {
      body = await req.json();
    } else {
      // SendGrid Inbound Parse posts multipart/form-data.
      const form = await req.formData();
      body = Object.fromEntries(form.entries());
    }
  } catch (e: any) {
    return NextResponse.json({ error: `Couldn't parse inbound payload: ${e.message}` }, { status: 400 });
  }

  const normalized = normalizeInboundReplyPayload(body);
  if (!normalized) {
    console.warn(`[inbound-reply] Unrecognized payload shape for engagement ${engagementId} — neither Postmark nor SendGrid format.`);
    return NextResponse.json({ error: "Unrecognized inbound-reply payload shape." }, { status: 400 });
  }

  // Phase 6 — SMTP bounce detection (smtp-bounce-classifier.ts). Only
  // meaningful when this app owns the actual send loop (email_platform
  // === "smtp") — for the 6 ESP platforms, a message landing on this
  // bridge is a genuine reply candidate, not this app's own bounce
  // traffic, so the classifier is deliberately not run for them.
  if (stack.email_platform === "smtp" && looksLikeBounceNotification(normalized.fromEmail, normalized.subject ?? "", normalized.textBody ?? "")) {
    await recordDeliveryEvent(engagementId, "smtp", "bounced", extractBouncedRecipient(normalized.textBody ?? ""), new Date());
    await checkAndApplyAutoPause(engagementId);
    return NextResponse.json({ success: true, classified: "bounce" });
  }

  await inngest.send(
    inboundReplyReceived.create({
      engagementId,
      fromEmail: normalized.fromEmail,
      subject: normalized.subject,
      textBody: normalized.textBody,
      source: "forwarding",
    })
  );

  return NextResponse.json({ success: true });
}
