// src/features/whop-agent/server/webhook-subscription-service.ts
//
// Creates and looks up the agent-owned webhook subscription(s) any
// webhook-driven skill needs. Section 2.6's create-time rule is enforced
// here, at the one call site every skill funnels through: "the agent never
// creates an unpinned webhook under any circumstance."
import crypto from "crypto";
import { db } from "@/lib/db";
import { whopWebhookRegistry } from "@/models/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { WhopAgentClient } from "@/lib/whop-agent/client";
import { encryptSecret, decryptSecret } from "@/lib/credentials";
import { inngest, whopWebhookProcess } from "@/lib/inngest";
import { duplicateGroupKey } from "./webhook-audit-service";

interface CreatedWebhookResponse {
  id: string;
  // Whop's own field name for the one-time signing secret on creation
  // isn't pinned down in the research this build is grounded in — the
  // three names below are the plausible candidates given Standard
  // Webhooks conventions (ws_... prefix per Section 7.1). Checked in
  // order; whichever is present is used. Flagged here rather than
  // guessed silently so a live-docs check can resolve this to one name
  // and delete the fallback chain.
  secret?: string;
  signing_secret?: string;
  webhook_secret?: string;
}

function webhookReceiverUrl(engagementId: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://mcs-abra.vercel.app";
  return `${appUrl}/api/webhooks/whop-agent/${engagementId}`;
}

/**
 * Idempotent per (engagementId, sorted event list): if an agent-created
 * subscription already covers exactly this event set, its id is returned
 * rather than creating a second one — repeated calls from multiple skills
 * enabling around the same time shouldn't fan out duplicate subscriptions,
 * which is exactly the failure mode Section 2.5's dedupe step exists to
 * clean up after the fact.
 */
export async function ensureAgentWebhookSubscription(engagementId: string, events: string[]): Promise<{ whopWebhookId: string }> {
  const sortedEvents = [...new Set(events)].sort();

  const existing = await db
    .select({ whopWebhookId: whopWebhookRegistry.whopWebhookId, events: whopWebhookRegistry.events })
    .from(whopWebhookRegistry)
    .where(and(eq(whopWebhookRegistry.engagementId, engagementId), eq(whopWebhookRegistry.createdByAgent, true)));

  const match = existing.find((row) => {
    const rowEvents = [...new Set(row.events)].sort();
    return rowEvents.length === sortedEvents.length && rowEvents.every((e, i) => e === sortedEvents[i]);
  });
  if (match) return { whopWebhookId: match.whopWebhookId };

  const client = await WhopAgentClient.forEngagement(engagementId);
  if (!client.accountId) {
    throw new Error("This connection has no Whop account id on file — reconnect before creating a webhook.");
  }
  if (!client.pinnedVersionDate) {
    // Section 2.6: "the agent never creates an unpinned webhook under any
    // circumstance." Enforced here, not left to the caller to remember.
    throw new Error("No validated Api-Version-Date pin on file — cannot create a webhook until pin selection succeeds.");
  }

  const url = webhookReceiverUrl(engagementId);
  const created = await client.request<CreatedWebhookResponse>("webhooks.create", "/v1/webhooks", {
    method: "POST",
    query: { account_id: client.accountId },
    body: { url, events: sortedEvents, api_version_date: client.pinnedVersionDate },
    idempotencyKey: `whop-webhook-create:${engagementId}:${sortedEvents.join(",")}`,
  });

  const secret = created.secret ?? created.signing_secret ?? created.webhook_secret;
  if (!secret) {
    throw new Error("Whop did not return a signing secret for the new webhook subscription — cannot verify future deliveries on it.");
  }

  const groupKey = duplicateGroupKey(url, sortedEvents);
  const { encryptedValue, iv, keyVersion } = encryptSecret(secret);
  try {
    await db.insert(whopWebhookRegistry).values({
      id: crypto.randomUUID(),
      engagementId,
      whopWebhookId: created.id,
      url,
      events: sortedEvents,
      createdByAgent: true,
      duplicateGroupKey: groupKey,
      apiVersion: "v1",
      apiVersionDate: client.pinnedVersionDate,
      signingSecretEncrypted: encryptedValue,
      signingSecretIv: iv,
      signingSecretKeyVersion: keyVersion,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } catch (insertErr: unknown) {
    // Closes the check-then-create race: two concurrent calls for the same
    // (engagementId, event set) can both pass the pre-insert SELECT above
    // and both create a live Whop-side subscription. The DB's partial
    // unique index (engagementId, duplicateGroupKey) WHERE created_by_agent
    // catches the loser here — it never gets a row of its own, and instead
    // deletes the now-redundant subscription it just created on Whop's side
    // and defers to whichever call actually won the insert.
    const code = insertErr && typeof insertErr === "object" && "code" in insertErr ? (insertErr as { code?: string }).code : undefined;
    const message = insertErr instanceof Error ? insertErr.message : String(insertErr);
    if (code !== "23505" && !/duplicate key|unique/i.test(message)) throw insertErr;

    const [winner] = await db
      .select({ whopWebhookId: whopWebhookRegistry.whopWebhookId })
      .from(whopWebhookRegistry)
      .where(and(eq(whopWebhookRegistry.engagementId, engagementId), eq(whopWebhookRegistry.duplicateGroupKey, groupKey), eq(whopWebhookRegistry.createdByAgent, true)))
      .limit(1);

    await client
      .request("webhooks.delete", `/v1/webhooks/${created.id}`, { method: "DELETE", idempotencyKey: `whop-webhook-race-cleanup:${created.id}` })
      .catch(() => {}); // best-effort — the winner's subscription is what matters, not this one

    if (!winner) throw insertErr; // the winning row vanished before we could read it back — surface the original error
    return { whopWebhookId: winner.whopWebhookId };
  }

  return { whopWebhookId: created.id };
}

/**
 * Every agent-created subscription's decrypted secret for an engagement —
 * the receiver route tries each until one verifies, since more than one
 * agent-created subscription can exist (different skills, different event
 * sets) and the inbound request carries no id telling us which one fired.
 */
export async function getAgentWebhookSecrets(engagementId: string): Promise<Array<{ whopWebhookId: string; secret: string }>> {
  const rows = await db
    .select()
    .from(whopWebhookRegistry)
    .where(
      and(
        eq(whopWebhookRegistry.engagementId, engagementId),
        eq(whopWebhookRegistry.createdByAgent, true),
        isNotNull(whopWebhookRegistry.signingSecretEncrypted)
      )
    );

  return rows
    .filter((r) => r.signingSecretEncrypted && r.signingSecretIv && r.signingSecretKeyVersion != null)
    .map((r) => ({
      whopWebhookId: r.whopWebhookId,
      secret: decryptSecret(r.signingSecretEncrypted!, r.signingSecretIv!, r.signingSecretKeyVersion!),
    }));
}

export async function markWebhookDeliveryReceived(engagementId: string, whopWebhookId: string): Promise<void> {
  await db
    .update(whopWebhookRegistry)
    .set({ lastDeliveryReceivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(whopWebhookRegistry.engagementId, engagementId), eq(whopWebhookRegistry.whopWebhookId, whopWebhookId)));
}

interface WhopDeliveryRecord {
  id: string;
  event_type?: string;
  type?: string;
  payload?: { type?: string; data?: Record<string, unknown>; previous_attributes?: Record<string, unknown> };
  delivered_at?: string;
  created_at?: string;
}

/**
 * Section 7.4 step 5 / Section 5.12/5.13's gap backfill: bounded to Whop's
 * own 30-day delivery retention (Section 7.3). The exact shape of
 * GET /v1/webhooks/{id}/deliveries beyond "a list of past deliveries" isn't
 * pinned down by the research this build is grounded in — this reads the
 * plausible `payload`/`type` fields defensively and skips (rather than
 * guesses at) any record it can't recognize, logging the gap explicitly
 * per the fail-open table's own "report the retention bound explicitly
 * rather than reporting no drift" discipline.
 */
export async function replayGapDeliveries(engagementId: string, whopWebhookId: string, sinceIso: string): Promise<{ replayed: number; skipped: number }> {
  const client = await WhopAgentClient.forEngagement(engagementId);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const from = sinceIso > thirtyDaysAgo ? sinceIso : thirtyDaysAgo;

  const response = await client.request<{ data: WhopDeliveryRecord[] }>("webhooks.deliveries", `/v1/webhooks/${whopWebhookId}/deliveries`, {
    query: { from },
  });

  let replayed = 0;
  let skipped = 0;
  for (const delivery of response.data ?? []) {
    const eventType = delivery.payload?.type ?? delivery.event_type ?? delivery.type;
    if (!eventType) {
      skipped += 1;
      continue;
    }
    await inngest.send(
      whopWebhookProcess.create({
        engagementId,
        whopWebhookId,
        envelope: { type: eventType, data: delivery.payload?.data, previous_attributes: delivery.payload?.previous_attributes },
        occurredAtIso: delivery.delivered_at ?? delivery.created_at ?? new Date().toISOString(),
        replay: true,
      })
    );
    replayed += 1;
  }

  return { replayed, skipped };
}
