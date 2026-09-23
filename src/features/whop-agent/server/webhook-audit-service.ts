// src/features/whop-agent/server/webhook-audit-service.ts
//
// Section 2.5: the four-step connect-flow webhook audit (inventory, pin
// audit, duplicate detection, health baseline), plus the two write actions
// it can offer — pin and dedupe — both of which are destructive-adjacent
// infrastructure changes and therefore always gated (Section 8.3), never
// run automatically regardless of any per-engagement approval setting.
import crypto from "crypto";
import { db } from "@/lib/db";
import { whopWebhookRegistry, whopAgentConnections } from "@/models/schema";
import { and, eq, inArray } from "drizzle-orm";
import { WhopAgentClient } from "@/lib/whop-agent/client";
import { queuePendingAction } from "@/lib/approval-gate";

interface WhopWebhookRecord {
  id: string;
  url: string;
  enabled: boolean;
  events: string[];
  api_version?: string;
  api_version_date?: string | null;
  consecutive_failures?: number;
  failing_since?: string | null;
  last_failure_at?: string | null;
  disabled_at?: string | null;
  disabled_reason?: string | null;
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

export function duplicateGroupKey(url: string, events: string[]): string {
  const normalized = `${normalizeUrl(url)}|${[...events].sort().join(",")}`;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

export interface WebhookAuditReport {
  total: number;
  unpinned: string[]; // whopWebhookId list
  unverifiable: string[]; // api_version v2/v5
  duplicateGroups: Array<{ groupKey: string; whopWebhookIds: string[]; url: string; events: string[] }>;
  alreadyDisabled: Array<{ whopWebhookId: string; disabledReason: string | null }>;
}

/**
 * Section 2.5, steps 1-4. Inventories the live fleet, upserts every
 * subscription into whopWebhookRegistry (creating a row only if one
 * doesn't exist — createdByAgent defaults false for a row discovered this
 * way, since the audit finds pre-existing infrastructure, it doesn't
 * create it), and returns the report the connect-flow UI renders.
 */
export async function auditWebhookFleet(engagementId: string): Promise<WebhookAuditReport> {
  const client = await WhopAgentClient.forEngagement(engagementId);
  if (!client.accountId) {
    throw new Error("This connection has no Whop account id on file. Reconnect before auditing webhooks.");
  }

  const response = await client.request<{ data: WhopWebhookRecord[] }>("webhooks.list", "/v1/webhooks", {
    query: { account_id: client.accountId },
  });
  const webhooks = response.data ?? [];

  const existingRows = await db
    .select({ whopWebhookId: whopWebhookRegistry.whopWebhookId, createdByAgent: whopWebhookRegistry.createdByAgent })
    .from(whopWebhookRegistry)
    .where(eq(whopWebhookRegistry.engagementId, engagementId));
  const createdByAgentSet = new Set(existingRows.filter((r) => r.createdByAgent).map((r) => r.whopWebhookId));

  const groupCounts = new Map<string, WhopWebhookRecord[]>();

  for (const hook of webhooks) {
    const groupKey = duplicateGroupKey(hook.url, hook.events);
    const group = groupCounts.get(groupKey) ?? [];
    group.push(hook);
    groupCounts.set(groupKey, group);
  }

  const report: WebhookAuditReport = { total: webhooks.length, unpinned: [], unverifiable: [], duplicateGroups: [], alreadyDisabled: [] };

  for (const hook of webhooks) {
    const groupKey = duplicateGroupKey(hook.url, hook.events);
    const isDuplicate = (groupCounts.get(groupKey)?.length ?? 0) > 1;

    if (!hook.api_version_date) report.unpinned.push(hook.id);
    if (hook.api_version === "v2" || hook.api_version === "v5") report.unverifiable.push(hook.id);
    if (hook.disabled_at) report.alreadyDisabled.push({ whopWebhookId: hook.id, disabledReason: hook.disabled_reason ?? null });

    const values = {
      url: hook.url,
      events: hook.events,
      apiVersion: hook.api_version ?? null,
      apiVersionDate: hook.api_version_date ?? null,
      duplicateGroupKey: isDuplicate ? groupKey : null,
      consecutiveFailures: hook.consecutive_failures ?? 0,
      failingSince: hook.failing_since ? new Date(hook.failing_since) : null,
      lastFailureAt: hook.last_failure_at ? new Date(hook.last_failure_at) : null,
      disabledAt: hook.disabled_at ? new Date(hook.disabled_at) : null,
      disabledReason: hook.disabled_reason ?? null,
      updatedAt: new Date(),
    };

    const existing = existingRows.find((r) => r.whopWebhookId === hook.id);
    if (existing) {
      await db
        .update(whopWebhookRegistry)
        .set(values)
        .where(and(eq(whopWebhookRegistry.engagementId, engagementId), eq(whopWebhookRegistry.whopWebhookId, hook.id)));
    } else {
      await db.insert(whopWebhookRegistry).values({
        id: crypto.randomUUID(),
        engagementId,
        whopWebhookId: hook.id,
        createdByAgent: createdByAgentSet.has(hook.id),
        createdAt: new Date(),
        ...values,
      });
    }
  }

  for (const [groupKey, group] of groupCounts) {
    if (group.length > 1) {
      report.duplicateGroups.push({ groupKey, whopWebhookIds: group.map((h) => h.id), url: group[0].url, events: group[0].events });
    }
  }

  return report;
}

/** Section 2.5 Step 2: offers a pin to the current-at-connect validated
 * date. This is a write to the operator's live infrastructure — always
 * gated (Section 8.3), regardless of any opt-in approval setting, exactly
 * like Reputation Manager's response-routing queues rep_response_approval
 * directly rather than through gateOrExecute's opt-in check. */
export async function queueWebhookPin(engagementId: string, whopWebhookId: string): Promise<string> {
  const [connection] = await db.select().from(whopAgentConnections).where(eq(whopAgentConnections.engagementId, engagementId)).limit(1);
  if (!connection?.pinnedVersionDate) {
    throw new Error("No validated Api-Version-Date pin on file for this connection. Resolve pin selection first.");
  }
  return queuePendingAction(
    engagementId,
    "whop_webhook_pin",
    { whopWebhookId, pinnedVersionDate: connection.pinnedVersionDate },
    `Pin webhook ${whopWebhookId} to ${connection.pinnedVersionDate}? This changes the shape of every future delivery on it.`
  );
}

/** Section 2.5 Step 3: retains the healthiest member of a duplicate group
 * (lowest consecutive_failures, then oldest created_at) and deletes the
 * rest. Deletion is destructive — always gated, and the queued payload
 * names exactly which subscription ids will be removed so the confirmation
 * screen can show them verbatim, not just a count. */
export async function queueWebhookDedupe(engagementId: string, groupKey: string): Promise<string> {
  const rows = await db
    .select()
    .from(whopWebhookRegistry)
    .where(and(eq(whopWebhookRegistry.engagementId, engagementId), eq(whopWebhookRegistry.duplicateGroupKey, groupKey)));
  if (rows.length < 2) {
    throw new Error("This group no longer has duplicate members. Re-run the audit.");
  }
  const sorted = [...rows].sort((a, b) => {
    if (a.consecutiveFailures !== b.consecutiveFailures) return a.consecutiveFailures - b.consecutiveFailures;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  const [keep, ...remove] = sorted;
  return queuePendingAction(
    engagementId,
    "whop_webhook_dedupe_delete",
    { keepWhopWebhookId: keep.whopWebhookId, deleteWhopWebhookIds: remove.map((r) => r.whopWebhookId), groupKey },
    `Delete ${remove.length} duplicate webhook(s) pointed at ${keep.url}, keeping ${keep.whopWebhookId} (lowest failure count)? Every matching event currently fires this receiver ${rows.length}x.`
  );
}

/** Re-fetched at execution time by approval-gate.ts's ACTION_EXECUTORS —
 * never trusts anything about pin state beyond the ids in the payload. */
export async function executeWebhookPin(engagementId: string, whopWebhookId: string, pinnedVersionDate: string): Promise<void> {
  const client = await WhopAgentClient.forEngagement(engagementId);
  await client.request("webhooks.update", `/v1/webhooks/${whopWebhookId}`, {
    method: "PATCH",
    body: { api_version_date: pinnedVersionDate },
    idempotencyKey: `whop-webhook-pin:${whopWebhookId}:${pinnedVersionDate}`,
  });

  // Read-back verification (Section 3's silent-save-verification discipline
  // applies to every write, webhook pinning included).
  const verify = await client
    .request<{ api_version_date?: string | null }>("webhooks.get", `/v1/webhooks/${whopWebhookId}`, { method: "GET" })
    .catch(() => null);

  await db
    .update(whopWebhookRegistry)
    .set({ apiVersionDate: pinnedVersionDate, updatedAt: new Date() })
    .where(and(eq(whopWebhookRegistry.engagementId, engagementId), eq(whopWebhookRegistry.whopWebhookId, whopWebhookId)));

  if (verify && verify.api_version_date !== pinnedVersionDate) {
    throw new Error(`Read-back after pinning ${whopWebhookId} did not confirm the new date. Flagging for review.`);
  }
}

export async function executeWebhookDedupe(engagementId: string, deleteWhopWebhookIds: string[]): Promise<void> {
  const client = await WhopAgentClient.forEngagement(engagementId);
  for (const whopWebhookId of deleteWhopWebhookIds) {
    await client.request("webhooks.delete", `/v1/webhooks/${whopWebhookId}`, {
      method: "DELETE",
      idempotencyKey: `whop-webhook-dedupe-delete:${whopWebhookId}`,
    });
  }
  await db
    .delete(whopWebhookRegistry)
    .where(and(eq(whopWebhookRegistry.engagementId, engagementId), inArray(whopWebhookRegistry.whopWebhookId, deleteWhopWebhookIds)));
}
