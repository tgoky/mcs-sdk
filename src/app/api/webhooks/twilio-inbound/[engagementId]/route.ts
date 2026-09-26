import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { smsReplies } from "@/models/schema";
import { inngest, smsReplyReceived } from "@/lib/inngest";
import { verifyTwilioWebhook } from "@/lib/twilio-webhook";
import { TWILIO_INBOUND_PATH } from "@/lib/sms-replies";

// An empty TwiML reply: acknowledges the text without Twilio sending
// anything back to the prospect on the client's behalf.
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
const twiml = () => new NextResponse(EMPTY_TWIML, { status: 200, headers: { "Content-Type": "text/xml" } });

/**
 * Where a client's Twilio number sends the texts prospects reply with
 * (set as the number's or Messaging Service's incoming-message webhook).
 * The text is stored right away, once (Twilio's MessageSid is unique per
 * client), and sorted in the background (inngest/sms-reply.ts) so Twilio
 * gets its answer well inside its timeout.
 */
export async function POST(req: Request, { params }: { params: Promise<{ engagementId: string }> }) {
  const { engagementId } = await params;
  const check = await verifyTwilioWebhook(req, engagementId, TWILIO_INBOUND_PATH);
  if (!check.ok) return check.status === 204 ? twiml() : new NextResponse(null, { status: check.status });
  const { fields } = check;

  const sid = fields.MessageSid ?? fields.SmsSid;
  const from = fields.From;
  if (!sid || !from) return twiml();

  const [stored] = await db
    .insert(smsReplies)
    .values({ engagementId, fromPhone: from, toPhone: fields.To ?? null, body: (fields.Body ?? "").slice(0, 2000), providerMessageId: sid })
    .onConflictDoNothing({ target: [smsReplies.engagementId, smsReplies.providerMessageId] })
    .returning({ id: smsReplies.id });

  // Already stored on an earlier delivery of the same text.
  if (stored) await inngest.send(smsReplyReceived.create({ engagementId, replyId: stored.id }));
  return twiml();
}
