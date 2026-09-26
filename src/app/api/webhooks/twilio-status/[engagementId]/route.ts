import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { resolveCredential } from "@/lib/credentials";
import { checkWebhookToken } from "@/lib/webhook-url-token";
import { isValidTwilioSignature, recordDeliveryStatus, twilioDeliveryStatus, twilioStatusCallbackUrl } from "@/lib/delivery-receipts";

/**
 * Twilio's status callback for texts a client's sequences sent: the
 * delivered / undelivered / failed report that turns "we sent it" into
 * "it reached the phone" (lib/delivery-receipts.ts).
 *
 * Two checks before anything is written: the per-client token in the
 * address (the engagement id alone is guessable), and Twilio's own
 * signature, keyed by that client's Twilio auth token, so only Twilio can
 * report a delivery. Twilio signs the exact address it was given, which
 * is the one this app built when sending; the address the request
 * arrived on is also tried, in case the public app URL changed since.
 */
export async function POST(req: Request, { params }: { params: Promise<{ engagementId: string }> }) {
  const { engagementId } = await params;

  if (checkWebhookToken(engagementId, req.url) !== "valid") {
    return new NextResponse(null, { status: 401 });
  }

  const [tenant] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  const stack = tenant?.stack as EngagementStack | null;
  if (!tenant || stack?.sms_platform !== "twilio") {
    // Nothing of ours to update; acknowledge so Twilio doesn't retry.
    return new NextResponse(null, { status: 204 });
  }

  const raw = await req.text();
  const fields = Object.fromEntries(new URLSearchParams(raw).entries());

  let authToken: string;
  try {
    authToken = await resolveCredential(engagementId, "twilio");
  } catch {
    return new NextResponse(null, { status: 403 });
  }
  const signature = req.headers.get("x-twilio-signature");
  const candidates = [twilioStatusCallbackUrl(engagementId), req.url].filter((u): u is string => Boolean(u));
  if (!candidates.some((url) => isValidTwilioSignature(authToken, url, fields, signature))) {
    return new NextResponse(null, { status: 403 });
  }

  const sid = fields.MessageSid ?? fields.SmsSid;
  const status = twilioDeliveryStatus(fields.MessageStatus ?? fields.SmsStatus);
  if (!sid || !status) return new NextResponse(null, { status: 204 });

  const error = fields.ErrorCode ? `Twilio error ${fields.ErrorCode}${fields.ErrorMessage ? `: ${fields.ErrorMessage}` : ""}` : null;
  await recordDeliveryStatus(engagementId, sid, status, error);
  return new NextResponse(null, { status: 204 });
}
