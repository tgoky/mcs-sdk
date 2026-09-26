import { NextResponse } from "next/server";
import { recordDeliveryStatus, twilioDeliveryStatus, TWILIO_STATUS_PATH } from "@/lib/delivery-receipts";
import { verifyTwilioWebhook } from "@/lib/twilio-webhook";

/**
 * Twilio's status callback for texts a client's sequences sent: the
 * delivered / undelivered / failed report that turns "we sent it" into
 * "it reached the phone" (lib/delivery-receipts.ts). Only believed once
 * lib/twilio-webhook.ts has checked the client's token and Twilio's
 * signature.
 */
export async function POST(req: Request, { params }: { params: Promise<{ engagementId: string }> }) {
  const { engagementId } = await params;
  const check = await verifyTwilioWebhook(req, engagementId, TWILIO_STATUS_PATH);
  if (!check.ok) return new NextResponse(null, { status: check.status });
  const { fields } = check;

  const sid = fields.MessageSid ?? fields.SmsSid;
  const status = twilioDeliveryStatus(fields.MessageStatus ?? fields.SmsStatus);
  if (!sid || !status) return new NextResponse(null, { status: 204 });

  const error = fields.ErrorCode ? `Twilio error ${fields.ErrorCode}${fields.ErrorMessage ? `: ${fields.ErrorMessage}` : ""}` : null;
  await recordDeliveryStatus(engagementId, sid, status, error);
  return new NextResponse(null, { status: 204 });
}
