// src/lib/slack-delivery.ts
//
// One way to post to a client's Slack, with two setups behind it:
//   1. Signed in with Slack (a "slack" Composio connection) and a channel
//      picked — posts with chat.postMessage as the connected app.
//   2. An incoming-webhook URL — the original per-client setup.
// The connection wins when both are set; a webhook-only client is
// unaffected.
//
// Not verified from this codebase (Composio's and Slack's docs weren't
// reachable while building this): that Composio's managed Slack app hands
// back a bot token as the connection's access_token, and that it grants
// chat:write (to post) and channels:read (to list channels). A missing
// scope surfaces as Slack's own error ("missing_scope", "not_in_channel")
// in the thrown message, never as a silent drop.
//
// Buttons: Slack sends button clicks to the Slack app's own interactivity
// URL. With Composio's managed app that isn't this app's
// /api/slack/interactions route, so messages posted through the connection
// drop their action blocks (text only). Webhook posts keep them.

import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { hasCredential, resolveCredential } from "@/lib/credentials";
import { fetchWithTimeout } from "@/lib/http";
import { slackWebhookUrl } from "@/lib/outbound-urls";

export interface SlackMessage {
  text: string;
  blocks?: Array<Record<string, unknown>>;
}

export type SlackDelivery = "connection" | "webhook" | "none";

/** True when this client's Slack is set up through the Slack connection. */
export async function hasSlackConnection(engagementId: string, stack?: Partial<EngagementStack> | null): Promise<boolean> {
  const s = stack ?? (await loadStack(engagementId));
  return Boolean(s?.slack_channel_id) && (await hasCredential(engagementId, "slack"));
}

async function loadStack(engagementId: string): Promise<Partial<EngagementStack> | null> {
  const [row] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  return (row?.stack as Partial<EngagementStack> | null) ?? null;
}

/**
 * Posts a message to the client's Slack. Returns which setup delivered it,
 * or "none" when the client has neither. Throws on a failed delivery so
 * callers keep their existing error handling.
 */
export async function postToClientSlack(
  engagementId: string | undefined,
  webhookUrl: string | undefined | null,
  message: SlackMessage
): Promise<SlackDelivery> {
  if (engagementId) {
    const stack = await loadStack(engagementId);
    if (stack?.slack_channel_id && (await hasCredential(engagementId, "slack"))) {
      const token = await resolveCredential(engagementId, "slack");
      const blocks = message.blocks?.filter((b) => b.type !== "actions");
      const res = await fetchWithTimeout("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ channel: stack.slack_channel_id, text: message.text, ...(blocks?.length ? { blocks } : {}) }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(`Slack chat.postMessage failed: ${data.error ?? `HTTP ${res.status}`}`);
      }
      return "connection";
    }
  }

  if (webhookUrl) {
    // Saved before the address was checked on save: only Slack's own host.
    if (!slackWebhookUrl(webhookUrl)) throw new Error("The Slack webhook address isn't a hooks.slack.com address. Update it in the client's settings.");
    const res = await fetchWithTimeout(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
    if (!res.ok) throw new Error(`Slack webhook failed: HTTP ${res.status}`);
    return "webhook";
  }

  return "none";
}
