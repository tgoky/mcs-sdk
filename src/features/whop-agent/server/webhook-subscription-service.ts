// src/features/whop-agent/server/webhook-subscription-service.ts
//
// Creates and looks up the agent-owned webhook subscription(s) any
// webhook-driven skill needs. Section 2.6's create-time rule is enforced
// here, at the one call site every skill funnels through: "the agent never
// creates an unpinned webhook under any circumstance."
import crypto from "crypto";
import { db } from "@/lib/db";
import { whopWebhookRegistry } from "@/models/schema";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { WhopAgentClient } from "@/lib/whop-agent/client";
import { encryptSecret, decryptSecret } from "@/lib/credentials";
import { inngest, whopWebhookProcess } from "@/lib/inngest";
import { duplicateGroupKey } from "./webhook-audit-service";
import { mergeWebhookEvents } from "./webhook-events";
import { isUniqueConstraintViolation } from "@/lib/db-errors";

interface CreatedWebhookResponse {
  id: string;
  // Whop's SDK (@whop/sdk 1.1.5, Webhook.webhook_secret) names it
  // webhook_secret: "Returned on the create response". The other two are
  // kept as fallbacks.
  secret?: string;
  signing_secret?: string;
  webhook_secret?: string;
}

export function webhookReceiverUrl(engagementId: string): string {
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
    throw new Error("This connection has no Whop account id on file. Reconnect before creating a webhook.");
  }
  if (!client.pinnedVersionDate) {
    // Section 2.6: "the agent never creates an unpinned webhook under any
    // circumstance." Enforced here, not left to the caller to remember.
    throw new Error("No validated Api-Version-Date pin on file. Cannot create a webhook until pin selection succeeds.");
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
    throw new Error("Whop did not return a signing secret for the new webhook subscription. Cannot verify future deliveries on it.");
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
    if (!isUniqueConstraintViolation(insertErr)) throw insertErr;

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
 * Keeps the agent's one subscription carrying `events`: created the first
 * time (pinned, as ensureAgentWebhookSubscription requires), then updated
 * in place with PATCH /webhooks/{id} when the events change, so choosing
 * different workers never leaves a second, overlapping subscription
 * delivering the same events twice. Events it already carries that
 * `keep` accepts stay on it (the setup keeps what Product Launch Preflight
 * added). An empty result leaves whatever exists alone. If an older
 * duplicate left more than one agent subscription, the oldest is the one
 * kept up to date; the setup lists the rest to clean up.
 */
export async function syncAgentWebhookEvents(
  engagementId: string,
  events: string[],
  opts: { keep?: (event: string) => boolean } = {}
): Promise<{ whopWebhookId: string | null; action: "created" | "updated" | "unchanged" | "none" }> {
  const rows = await db
    .select({ id: whopWebhookRegistry.id, whopWebhookId: whopWebhookRegistry.whopWebhookId, url: whopWebhookRegistry.url, events: whopWebhookRegistry.events })
    .from(whopWebhookRegistry)
    .where(and(eq(whopWebhookRegistry.engagementId, engagementId), eq(whopWebhookRegistry.createdByAgent, true)))
    .orderBy(asc(whopWebhookRegistry.createdAt));
  const row = rows[0];
  const wanted = mergeWebhookEvents(row?.events ?? [], events, opts.keep);
  if (wanted.length === 0) return { whopWebhookId: null, action: "none" };
  if (!row) {
    const { whopWebhookId } = await ensureAgentWebhookSubscription(engagementId, wanted);
    return { whopWebhookId, action: "created" };
  }
  const have = [...new Set(row.events)].sort();
  if (have.length === wanted.length && have.every((e, i) => e === wanted[i])) return { whopWebhookId: row.whopWebhookId, action: "unchanged" };

  const client = await WhopAgentClient.forEngagement(engagementId);
  if (!client.pinnedVersionDate) {
    throw new Error("No validated Api-Version-Date pin on file. Cannot change the webhook until pin selection succeeds.");
  }
  await client.request("webhooks.update", `/v1/webhooks/${row.whopWebhookId}`, {
    method: "PATCH",
    body: { events: wanted, api_version_date: client.pinnedVersionDate },
    idempotencyKey: `whop-webhook-events:${row.whopWebhookId}:${wanted.join(",")}`,
  });
  await db
    .update(whopWebhookRegistry)
    .set({ events: wanted, duplicateGroupKey: duplicateGroupKey(row.url, wanted), apiVersionDate: client.pinnedVersionDate, updatedAt: new Date() })
    .where(eq(whopWebhookRegistry.id, row.id));
  return { whopWebhookId: row.whopWebhookId, action: "updated" };
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

/** Adds events to the agent's one subscription, keeping every event it
 * already carries, instead of creating a second subscription. What a
 * worker that needs extra events (Product Launch Preflight) calls. */
export function addAgentWebhookEvents(engagementId: string, events: string[]) {
  return syncAgentWebhookEvents(engagementId, events, { keep: () => true });
}
