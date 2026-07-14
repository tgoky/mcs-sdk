/**
 * Reply detection as a recovery exit signal — Win-Back recovery gap 6.
 * The AI Architect Review called this "table stakes for anything calling
 * itself win-back": without it, a prospect who replies "not interested"
 * keeps getting recovery touches, because this app's server-side cadence
 * has no visibility into the buyer's inbox by default.
 *
 * Two paths, matching the transfer analysis exactly:
 *
 *   NATIVE — subscribe to the platform's own inbound-reply webhook where
 *   one genuinely, stably exists. In practice today that's HubSpot's
 *   Conversations API (`conversation.newMessage` subscription, filtered
 *   to inbound channel messages). Klaviyo and ActiveCampaign do NOT have
 *   a comparably stable public "someone replied to this campaign" webhook
 *   — Klaviyo's marketing emails typically set reply-to to the buyer's
 *   own inbox rather than routing replies back through Klaviyo at all, and
 *   ActiveCampaign's reply-tracking is plan-tier-gated and not
 *   consistently exposed via a subscribable webhook across accounts. This
 *   module is honest about that ceiling rather than pretending a native
 *   subscription exists for platforms where it doesn't — see
 *   subscribeNativeReplyWebhook below.
 *
 *   FORWARDING — the buyer forwards replies (via an inbox rule) through
 *   an inbound-email-to-webhook bridge — Postmark's Inbound, SendGrid's
 *   Inbound Parse, or Mailgun Routes are the common ones — to this app's
 *   catcher endpoint. This app doesn't run its own mail server; it just
 *   needs an HTTP endpoint any of those bridges can POST to, normalized
 *   here since Postmark and SendGrid use different payload shapes for the
 *   same "here's an inbound email" event.
 */

import { HubSpotClient } from "@/lib/platforms/email";

// ── Native path ──────────────────────────────────────────────────────────

export interface NativeReplySubscriptionResult {
  supported: boolean;
  subscriptionId?: string;
  reason?: string;
}

/**
 * Registers a HubSpot Conversations webhook subscription for inbound
 * messages. Returns `supported: false` with a reason for every other
 * platform — see module comment above for why Klaviyo/ActiveCampaign
 * don't get a native path here.
 */
export async function subscribeNativeReplyWebhook(
  emailPlatform: string,
  apiKey: string,
  receiverUrl: string
): Promise<NativeReplySubscriptionResult> {
  switch (emailPlatform) {
    case "hubspot": {
      try {
        const subscriptionId = await new HubSpotClient(apiKey).subscribeToInboundConversations(receiverUrl);
        return { supported: true, subscriptionId };
      } catch (e: any) {
        return { supported: false, reason: `HubSpot Conversations webhook subscription failed: ${e.message}` };
      }
    }
    case "klaviyo":
      return {
        supported: false,
        reason:
          "Klaviyo marketing emails typically reply-to the buyer's own inbox, not back through Klaviyo — there's no stable native \"reply received\" webhook to subscribe to. Use forwarding mode instead.",
      };
    case "activecampaign":
      return {
        supported: false,
        reason:
          "ActiveCampaign's reply tracking is plan-tier-gated and isn't consistently exposed as a subscribable webhook across accounts. Use forwarding mode instead.",
      };
    default:
      return { supported: false, reason: `No native reply-detection path for ${emailPlatform}.` };
  }
}

// ── Forwarding path ──────────────────────────────────────────────────────

export interface NormalizedInboundReply {
  fromEmail: string;
  subject: string | null;
  textBody: string | null;
}

/**
 * Normalizes Postmark Inbound and SendGrid Inbound Parse payload shapes
 * into one common structure. Returns null if the payload doesn't match
 * either known shape — the webhook route treats that as a 400, not a
 * silent drop, so a misconfigured bridge is visible in logs rather than
 * quietly losing replies.
 */
export function normalizeInboundReplyPayload(body: any): NormalizedInboundReply | null {
  // Postmark Inbound: { FromFull: { Email }, Subject, TextBody }
  if (body?.FromFull?.Email || body?.From) {
    return {
      fromEmail: body.FromFull?.Email ?? body.From,
      subject: body.Subject ?? null,
      textBody: body.TextBody ?? body.StrippedTextReply ?? null,
    };
  }
  // SendGrid Inbound Parse: multipart form fields { from, subject, text } —
  // by the time this reaches JSON (the route parses the form data first),
  // `from` is typically "Name <email@domain.com>", so extract just the address.
  if (body?.from || body?.envelope) {
    const rawFrom: string = body.from ?? "";
    const emailMatch = rawFrom.match(/<([^>]+)>/) ?? rawFrom.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    return {
      fromEmail: emailMatch ? emailMatch[emailMatch.length === 1 ? 0 : 1] : rawFrom,
      subject: body.subject ?? null,
      textBody: body.text ?? null,
    };
  }
  return null;
}

/**
 * Very deliberately NOT trying to classify sentiment ("is this a
 * negative reply?") — the transfer analysis's ask is "reply detected =
 * exit the cadence," full stop, same as a real SDR would stop emailing
 * someone who replied at all, positive or negative. Sentiment
 * classification is a different, riskier feature (a false "this reply
 * sounds positive, keep going" could mean continuing to email someone who
 * explicitly asked to stop) that nothing in the transfer analysis asked
 * for here.
 */
