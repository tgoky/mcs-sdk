// src/features/cold-open/server/replies/webhook.ts
//
// Replies the sending tool pushes to this app as they arrive
// (api/webhooks/cold-open-replies), for every tool Cold Open sends
// through, instead of polling only Instantly's feed every four hours.
//
// Field names by tool:
//   Instantly  (reply_received, per its webhook docs): lead_email,
//              reply_text / reply_html, reply_subject, campaign_id.
//   Smartlead  (EMAIL_REPLY): lead.email, reply.body, reply.message_id,
//              campaign_id; older payloads flatten these (to_email,
//              reply_message.text, sl_email_lead_id).
//   Lemlist, Reply.io: their reply events are read through the common
//              names below (leadEmail / email / contact.email; text /
//              body / message). A payload with no recognisable lead email
//              and reply text is skipped rather than guessed at.
//
// Only reply events are stored. Other events (opens, clicks, sends) and
// meeting-booked events are acknowledged and left alone: the booking
// itself reaches Showtime from the calendar, which is the record of truth.

import crypto from "crypto";

export interface ParsedWebhookReply {
  leadEmail: string;
  bodyText: string;
  subject?: string;
  campaignId: string | null;
  /** The tool's own id for the reply when it sends one, else a hash of
   * who, what and when, so a retried delivery is still recognised. */
  replyId: string;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const str = (...vals: unknown[]): string | null => {
  for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim();
  return null;
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** The event name, however the tool labels it. */
export function eventName(body: Obj): string {
  return String(body.event_type ?? body.event ?? body.type ?? obj(body.event)?.type ?? "").trim();
}

/** A reply, as opposed to a send, open, click, bounce or booking. */
export function isReplyEvent(name: string): boolean {
  const n = name.toLowerCase();
  return /repl/.test(n) && !/auto|bounce|unsubscrib/.test(n);
}

export type ParseResult = { reply: ParsedWebhookReply } | { ignored: string };

export function parseReplyWebhook(payload: unknown, receivedAt = new Date()): ParseResult {
  const body = obj(payload);
  if (!body) return { ignored: "not a JSON object" };
  const name = eventName(body);
  if (!isReplyEvent(name)) return { ignored: name ? `not a reply event (${name})` : "no event type" };

  const lead = obj(body.lead) ?? obj(body.contact) ?? obj(body.prospect) ?? {};
  const reply = obj(body.reply) ?? obj(body.reply_message) ?? obj(body.message) ?? {};
  const email = str(body.lead_email, lead.email, body.leadEmail, body.to_email, body.email, body.contact_email, body.prospect_email);
  const html = str(body.reply_html, reply.html);
  const text = str(body.reply_text, reply.body, reply.text, body.text, body.body, typeof body.message === "string" ? body.message : null, body.reply_text_snippet) ?? (html ? stripHtml(html) : null);

  if (!email || !EMAIL_RE.test(email)) return { ignored: "no lead email in the payload" };
  if (!text) return { ignored: "no reply text in the payload" };

  const toolId = str(reply.message_id, body.message_id, body.reply_id, body.email_id, body.sl_email_lead_id && body.message_id ? `${body.sl_email_lead_id}:${body.message_id}` : null, body.id);
  const when = str(reply.received_at, body.timestamp, body.received_at, body.date) ?? receivedAt.toISOString();
  const replyId = toolId ? `wh:${toolId}` : `wh:${crypto.createHash("sha1").update(`${email.toLowerCase()}|${when}|${text.slice(0, 500)}`).digest("hex")}`;

  return {
    reply: {
      leadEmail: email.toLowerCase(),
      bodyText: text.slice(0, 20_000),
      subject: str(body.reply_subject, reply.subject, body.subject) ?? undefined,
      campaignId: str(body.campaign_id, body.campaignId, obj(body.campaign)?.id, body.sequence_id, body.sequenceId),
      replyId,
    },
  };
}
