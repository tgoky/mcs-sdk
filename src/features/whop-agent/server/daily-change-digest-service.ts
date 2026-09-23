// src/features/whop-agent/server/daily-change-digest-service.ts
//
// Playbook 5.13. The accumulation half (previous_attributes -> whopChangeLedger
// on every .updated event) already runs for every connected engagement
// regardless of whether this skill is enabled — see webhook-envelope-
// service.ts and its wiring in src/inngest/whop-agent.ts's
// processWhopWebhookEvent, per Section 4's "written by every playbook run"
// framing and Section 5.13's own "Zero read-back, zero cache maintenance."
// This file is the digest-rendering and reconciliation half.
import { db } from "@/lib/db";
import { engagements, whopChangeLedger, whopWebhookRegistry, type EngagementStack } from "@/models/schema";
import { and, eq, gte, lt } from "drizzle-orm";
import { notifyUser } from "@/lib/notify";
import { isSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { WhopAgentClient } from "@/lib/whop-agent/client";
import { listConnectedEngagementIds } from "./receiver-health-service";

export interface DigestEntry {
  resourceType: string;
  resourceId: string;
  eventType: string;
  changedFields: Record<string, { previous: unknown; current?: unknown }> | null;
  deltaAvailable: boolean;
  occurredAt: Date;
}

export interface DailyDigest {
  periodStart: Date;
  periodEnd: Date;
  entries: DigestEntry[];
  materialCount: number;
  incompleteReason: string | null;
}

/** Section 5.13's own guardrail: "The digest never claims completeness
 * when reconciliation found a gap. A gap is reported as a gap." Compares
 * the ledger's own entry count for the window against the agent's
 * webhook-delivery count for the same window on its own subscription(s).
 * Bounded to whatever GET /v1/webhooks/{id}/deliveries actually returns —
 * the same undocumented-shape caveat replayGapDeliveries already flags. */
async function reconcileDigestCoverage(engagementId: string, periodStart: Date, periodEnd: Date, ledgerCount: number): Promise<string | null> {
  const agentSubs = await db
    .select({ whopWebhookId: whopWebhookRegistry.whopWebhookId })
    .from(whopWebhookRegistry)
    .where(and(eq(whopWebhookRegistry.engagementId, engagementId), eq(whopWebhookRegistry.createdByAgent, true)));
  if (agentSubs.length === 0) return null;

  try {
    const client = await WhopAgentClient.forEngagement(engagementId);
    let deliveredCount = 0;
    for (const sub of agentSubs) {
      const response = await client
        .request<{ data?: Array<{ payload?: { type?: string } }> }>("webhooks.deliveries", `/v1/webhooks/${sub.whopWebhookId}/deliveries`, {
          query: { from: periodStart.toISOString(), to: periodEnd.toISOString() },
        })
        .catch(() => null);
      deliveredCount += (response?.data ?? []).filter((d) => d.payload?.type?.endsWith(".updated") || d.payload?.type === "membership.cancel_at_period_end_changed").length;
    }
    if (deliveredCount > ledgerCount) {
      return `Reconciliation found ${deliveredCount} .updated deliveries but only ${ledgerCount} ledger entries this period. Some deltas may be missing.`;
    }
    return null;
  } catch (err) {
    return `Reconciliation check itself failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function buildDailyDigest(engagementId: string, forDate: Date = new Date()): Promise<DailyDigest> {
  const periodStart = new Date(forDate);
  periodStart.setUTCHours(0, 0, 0, 0);
  periodStart.setUTCDate(periodStart.getUTCDate() - 1); // "yesterday" per Section 5.13's own framing ("what moved on my Whop yesterday")
  const periodEnd = new Date(periodStart);
  periodEnd.setUTCDate(periodEnd.getUTCDate() + 1);

  const rows = await db
    .select()
    .from(whopChangeLedger)
    .where(and(eq(whopChangeLedger.engagementId, engagementId), gte(whopChangeLedger.occurredAt, periodStart), lt(whopChangeLedger.occurredAt, periodEnd)));

  const entries: DigestEntry[] = rows
    .filter((r) => r.material)
    .map((r) => ({
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      eventType: r.eventType,
      changedFields: r.changedFields as Record<string, { previous: unknown; current?: unknown }> | null,
      deltaAvailable: r.deltaAvailable,
      occurredAt: r.occurredAt,
    }));

  const incompleteReason = await reconcileDigestCoverage(engagementId, periodStart, periodEnd, rows.length);

  return { periodStart, periodEnd, entries, materialCount: entries.length, incompleteReason };
}

function formatDigestBody(digest: DailyDigest): string {
  if (digest.entries.length === 0) {
    return "No material changes detected yesterday.";
  }
  const byResource = new Map<string, DigestEntry[]>();
  for (const entry of digest.entries) {
    const list = byResource.get(entry.resourceType) ?? [];
    list.push(entry);
    byResource.set(entry.resourceType, list);
  }
  const lines: string[] = [];
  for (const [resourceType, list] of byResource) {
    lines.push(`${resourceType} (${list.length}):`);
    for (const entry of list) {
      const fieldSummary = entry.deltaAvailable && entry.changedFields
        ? Object.entries(entry.changedFields).map(([field, delta]) => `${field}: ${JSON.stringify(delta.previous)} → ${JSON.stringify(delta.current)}`).join(", ")
        : "changed, delta unavailable";
      lines.push(`  ${entry.resourceId}: ${fieldSummary}`);
    }
  }
  if (digest.incompleteReason) lines.push(`\n⚠ ${digest.incompleteReason}`);
  return lines.join("\n");
}

export async function sendDailyDigest(engagementId: string): Promise<void> {
  if (!(await isSkillEnabledForEngagement(engagementId, "whop-daily-change-digest"))) return;

  const [tenant] = await db
    .select({ whopUserId: engagements.whopUserId, workspaceId: engagements.workspaceId, stack: engagements.stack })
    .from(engagements)
    .where(eq(engagements.engagementId, engagementId))
    .limit(1);
  if (!tenant) return;

  const digest = await buildDailyDigest(engagementId);
  // Section 5.13 guardrail: nothing to report is still worth a quiet
  // no-op, not a forced daily notification — same "don't manufacture
  // noise" instinct the rest of this app's alerting already follows.
  if (digest.entries.length === 0 && !digest.incompleteReason) return;

  await notifyUser({
    whopUserId: tenant.whopUserId,
    engagementId,
    type: "whop_webhook_health",
    severity: digest.incompleteReason ? "warning" : "info",
    title: `Whop change digest: ${digest.materialCount} change${digest.materialCount === 1 ? "" : "s"} yesterday`,
    body: formatDigestBody(digest),
    slackWebhookUrl: (tenant.stack as EngagementStack | null)?.slack_webhook_url,
    workspaceId: tenant.workspaceId ?? undefined,
  }).catch((e) => console.error("[whop-agent daily-change-digest] notify failed (non-fatal):", e));
}

export async function listEngagementsForDailyDigest(): Promise<string[]> {
  return listConnectedEngagementIds();
}
