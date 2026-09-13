// src/features/whop-agent/server/bridge-manager-service.ts
//
// Playbook 5.12. Retry scheduling itself lives in the Inngest function
// (src/inngest/whop-agent.ts's deliverToBridge) using step.sleep — this
// file owns the one real HTTP delivery and the config lookup, not the
// backoff timing.
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { notifyUser } from "@/lib/notify";

export interface BridgeConfig {
  destinationUrl: string;
  fieldMapping: Record<string, string>;
}

export async function getBridgeConfig(engagementId: string): Promise<BridgeConfig | null> {
  const [row] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  const stack = row?.stack as EngagementStack | null;
  if (!stack?.whop_bridge_destination_url) return null;
  return { destinationUrl: stack.whop_bridge_destination_url, fieldMapping: stack.whop_bridge_field_mapping ?? {} };
}

function mapPayload(data: Record<string, unknown> | undefined, mapping: Record<string, string>): Record<string, unknown> {
  if (!data) return {};
  if (Object.keys(mapping).length === 0) return data;
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    mapped[mapping[key] ?? key] = value;
  }
  return mapped;
}

/**
 * Section 5.12: "Never mutates payload contents beyond the operator-
 * configured field mapping." One HTTP call, no retry logic in here — the
 * caller (the durable Inngest function) decides whether a non-2xx means
 * "try again."
 */
export async function attemptBridgeDelivery(
  config: BridgeConfig,
  envelope: { type: string; data?: Record<string, unknown>; previous_attributes?: Record<string, unknown> },
  replay: boolean
): Promise<{ ok: boolean; status: number }> {
  const body = { type: envelope.type, data: mapPayload(envelope.data, config.fieldMapping), previous_attributes: envelope.previous_attributes, replay };
  try {
    const res = await fetch(config.destinationUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(replay ? { "X-Whop-Agent-Replay": "true" } : {}) },
      body: JSON.stringify(body),
    });
    return { ok: res.status >= 200 && res.status < 300, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

export async function notifyBridgeDeadLetter(engagementId: string, eventType: string, destinationUrl: string): Promise<void> {
  const [tenant] = await db.select({ whopUserId: engagements.whopUserId, workspaceId: engagements.workspaceId, stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  if (!tenant) return;
  await notifyUser({
    whopUserId: tenant.whopUserId,
    engagementId,
    type: "whop_webhook_health",
    severity: "critical",
    title: "Bridge delivery dead-lettered",
    body: `${eventType} could not be delivered to ${destinationUrl} after 6 attempts over ~17 hours. Check the destination — Whop's own retry window (71h) is still running independently.`,
    slackWebhookUrl: (tenant.stack as EngagementStack | null)?.slack_webhook_url,
    workspaceId: tenant.workspaceId ?? undefined,
  }).catch((e) => console.error("[whop-agent bridge-manager] dead-letter notify failed (non-fatal):", e));
}
