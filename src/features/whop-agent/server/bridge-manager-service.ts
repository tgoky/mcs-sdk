// src/features/whop-agent/server/bridge-manager-service.ts
//
// Playbook 5.12. Retry scheduling itself lives in the Inngest function
// (src/inngest/whop-agent.ts's deliverToBridge) using step.sleep — this
// file owns the one real HTTP delivery and the config lookup, not the
// backoff timing.
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { and, eq, sql } from "drizzle-orm";
import crypto from "crypto";
import { notifyUser } from "@/lib/notify";
import { encryptSecret, decryptSecret } from "@/lib/credentials";
import { safeFetch } from "@/lib/safe-fetch";

/**
 * Each client's bridge has its own signing secret so the destination can
 * tell a real forwarded event from a forged POST. Created on first use,
 * stored encrypted like credentials, shown to the operator in the bridge
 * settings. Never returned from getBridgeConfig: that result is an Inngest
 * step output, which Inngest keeps in its run history.
 */
export async function getOrCreateBridgeSigningSecret(engagementId: string): Promise<string> {
  const read = async () => {
    const [row] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
    return (row?.stack as EngagementStack | null)?.whop_bridge_signing_secret;
  };
  let stored = await read();
  if (!stored) {
    const enc = encryptSecret(crypto.randomBytes(32).toString("hex"));
    // Only written if still absent, so two first deliveries at once agree
    // on one secret; the re-read below picks up whichever won.
    await db
      .update(engagements)
      .set({ stack: sql`coalesce(${engagements.stack}, '{}'::jsonb) || jsonb_build_object('whop_bridge_signing_secret', ${JSON.stringify(enc)}::jsonb)` })
      .where(and(eq(engagements.engagementId, engagementId), sql`(${engagements.stack} -> 'whop_bridge_signing_secret') is null`));
    stored = await read();
  }
  if (!stored) throw new Error(`Couldn't create a bridge signing secret for ${engagementId}.`);
  return decryptSecret(stored.encryptedValue, stored.iv, stored.keyVersion);
}

/** "v1=" + hex HMAC-SHA256 over "<timestamp>.<raw body>" with the bridge's
 * signing secret. Receivers recompute it and reject stale timestamps. */
export function signBridgeBody(secret: string, timestamp: number, body: string): string {
  return "v1=" + crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

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
  engagementId: string,
  config: BridgeConfig,
  envelope: { type: string; data?: Record<string, unknown>; previous_attributes?: Record<string, unknown> },
  replay: boolean
): Promise<{ ok: boolean; status: number }> {
  const body = JSON.stringify({ type: envelope.type, data: mapPayload(envelope.data, config.fieldMapping), previous_attributes: envelope.previous_attributes, replay });
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const secret = await getOrCreateBridgeSigningSecret(engagementId);
    // safeFetch: the destination is operator-entered, so private/internal
    // hosts are refused (including via redirects) and the call times out
    // instead of hanging the delivery step.
    const res = await safeFetch(
      config.destinationUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Whop-Agent-Timestamp": String(timestamp),
          "X-Whop-Agent-Signature": signBridgeBody(secret, timestamp, body),
          ...(replay ? { "X-Whop-Agent-Replay": "true" } : {}),
        },
        body,
      },
      { timeoutMs: 15_000, httpsOnly: true, maxRedirects: 0 }
    );
    return { ok: res.status >= 200 && res.status < 300, status: res.status };
  } catch (err) {
    console.error(`[whop-agent bridge-manager] delivery to ${config.destinationUrl} failed:`, err instanceof Error ? err.message : err);
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
    body: `${eventType} could not be delivered to ${destinationUrl} after 6 attempts over ~17 hours. Check the destination. Whop's own retry window (71h) is still running independently.`,
    slackWebhookUrl: (tenant.stack as EngagementStack | null)?.slack_webhook_url,
    workspaceId: tenant.workspaceId ?? undefined,
  }).catch((e) => console.error("[whop-agent bridge-manager] dead-letter notify failed (non-fatal):", e));
}
