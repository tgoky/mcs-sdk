// src/features/whop-agent/server/receiver-health-service.ts
//
// Section 7.4 — the receiver health and re-enable subsystem. A platform
// subsystem, not a skill: it runs for every connected engagement
// regardless of which Whop Agent skills are enabled, because every
// webhook-driven skill depends on it.
import { db } from "@/lib/db";
import { engagements, whopWebhookRegistry, whopAgentConnections, activeAlerts, type EngagementStack } from "@/models/schema";
import { and, eq, isNull } from "drizzle-orm";
import { notifyUser } from "@/lib/notify";
import { queuePendingAction } from "@/lib/approval-gate";
import { auditWebhookFleet } from "./webhook-audit-service";
import { WhopAgentClient } from "@/lib/whop-agent/client";
import { replayGapDeliveries, getAgentWebhookSecrets } from "./webhook-subscription-service";
import { claimAlertFiring } from "@/lib/whop-agent/alert-cooldown";
import { signWhopWebhookPayload } from "@/lib/whop-agent/webhook-verify";

type HealthTier = "degraded_12h" | "degraded_24h" | "urgent_48h";

const TIER_THRESHOLDS_HOURS: Array<{ tier: HealthTier; hours: number; severity: "warning" | "critical" }> = [
  { tier: "urgent_48h", hours: 48, severity: "critical" },
  { tier: "degraded_24h", hours: 24, severity: "critical" },
  { tier: "degraded_12h", hours: 12, severity: "warning" },
];

// A tier, once fired for a given subscription, doesn't re-fire on every
// 4-hour sweep — cooldown reuses activeAlerts.lastFiredAt exactly the way
// its own schema comment describes ("last_fired_at for cooldown"), keyed
// per (webhook id, tier) via `source` so escalating from 12h to 24h still
// fires a fresh, distinct alert rather than being suppressed by the
// earlier tier's cooldown. See lib/whop-agent/alert-cooldown.ts for the
// shared implementation (also used by the Refund/Dispute Velocity Alert).
const TIER_COOLDOWN_HOURS = 4;

/** Atomically checks cooldown and records the firing in one step — see
 * alert-cooldown.ts's own header for why this can't be a separate check
 * then a separate record without reopening the exact race it closes. */
async function claimFiring(source: string, metricName: string, threshold: string, severity: string, engagementId: string): Promise<boolean> {
  return claimAlertFiring({ source, cooldownHours: TIER_COOLDOWN_HOURS, engagementId, metricName, threshold, severity });
}

/** Updates only the outcome detail (threshold/severity) on an already-
 * claimed alert row — used by attemptReenable, which must claim the
 * cooldown window before its network probe (so two overlapping sweeps
 * can't both probe and both queue a duplicate re-enable action) but only
 * learns the real outcome after the probe returns. */
async function updateFiringOutcome(source: string, threshold: string, severity: string): Promise<void> {
  await db.update(activeAlerts).set({ threshold, severity }).where(eq(activeAlerts.source, source));
}

async function alertOperator(engagementId: string, title: string, body: string, severity: "warning" | "critical"): Promise<void> {
  const [tenant] = await db
    .select({ whopUserId: engagements.whopUserId, workspaceId: engagements.workspaceId, stack: engagements.stack })
    .from(engagements)
    .where(eq(engagements.engagementId, engagementId))
    .limit(1);
  if (!tenant) return;

  await notifyUser({
    whopUserId: tenant.whopUserId,
    engagementId,
    type: "whop_webhook_health",
    severity: severity === "critical" ? "critical" : "warning",
    title,
    body,
    slackWebhookUrl: (tenant.stack as EngagementStack | null)?.slack_webhook_url,
    workspaceId: tenant.workspaceId ?? undefined,
  }).catch((e) => console.error("[whop-agent receiver-health] notify failed (non-fatal):", e));
}

/**
 * Section 7.4's health sweep for one engagement — re-audits the fleet
 * (refreshing consecutive_failures/failing_since/disabled_at from Whop),
 * then evaluates every subscription against the escalation tiers and the
 * pin-mismatch check. Called every 4 hours across every connected
 * engagement by the scheduled cron, regardless of which skills are on.
 */
export async function sweepReceiverHealth(engagementId: string): Promise<void> {
  await auditWebhookFleet(engagementId).catch((e) => {
    // A connection with a tripped circuit breaker or a dead credential
    // shouldn't crash the whole sweep for every other engagement — the
    // credential-health cron already owns alerting on that separately.
    console.error(`[whop-agent receiver-health] audit failed for ${engagementId} (non-fatal):`, e instanceof Error ? e.message : e);
  });

  const [connection] = await db.select().from(whopAgentConnections).where(eq(whopAgentConnections.engagementId, engagementId)).limit(1);
  if (!connection) return;

  const rows = await db.select().from(whopWebhookRegistry).where(eq(whopWebhookRegistry.engagementId, engagementId));

  for (const row of rows) {
    // Pin-mismatch: reported, never corrected (Section 2.6/7.4).
    if (row.apiVersionDate && connection.pinnedVersionDate && row.apiVersionDate !== connection.pinnedVersionDate) {
      const source = `whop:pin-mismatch:${row.whopWebhookId}`;
      if (await claimFiring(source, "pin_mismatch", connection.pinnedVersionDate, "warning", engagementId)) {
        await alertOperator(
          engagementId,
          "A Whop webhook's pin changed outside the agent",
          `Subscription ${row.whopWebhookId} is now pinned to ${row.apiVersionDate}, not the account's validated pin (${connection.pinnedVersionDate}). Reported, not corrected — review before it drifts further.`,
          "warning"
        );
      }
    }

    if (row.disabledAt) {
      await attemptReenable(engagementId, row);
      continue;
    }

    if (!row.failingSince) continue;
    const hoursFailing = (Date.now() - row.failingSince.getTime()) / (60 * 60 * 1000);

    for (const { tier, hours, severity } of TIER_THRESHOLDS_HOURS) {
      if (hoursFailing < hours) continue;
      const source = `whop:${tier}:${row.whopWebhookId}`;
      if (!(await claimFiring(source, "webhook_failing_hours", String(hours), severity, engagementId))) break;

      const hoursRemaining = Math.max(0, Math.round(72 - hoursFailing));
      const body =
        tier === "urgent_48h"
          ? `${row.url} has been failing for ${Math.round(hoursFailing)}h. Whop auto-disables this subscription at 72h — ${hoursRemaining}h remaining.`
          : tier === "degraded_24h"
            ? `${row.url} has been failing for ${Math.round(hoursFailing)}h. Whop has also sent its own warning email at the 24h mark.`
            : `${row.url} has been failing for ${Math.round(hoursFailing)}h with ${row.consecutiveFailures} consecutive failures.`;

      await alertOperator(engagementId, `Webhook receiver degraded (${Math.round(hoursFailing)}h)`, body, severity);
      break; // only the highest tier that just crossed fires this sweep
    }
  }
}

/**
 * Section 7.4's re-enable flow, steps 1-3 (probe-then-gate). Step 4
 * (the actual PATCH) is the whop_webhook_reenable executor in
 * approval-gate.ts — always gated, never automatic, per the spec's own
 * "Fully automatic re-enable was considered and rejected."
 */
async function attemptReenable(engagementId: string, row: typeof whopWebhookRegistry.$inferSelect): Promise<void> {
  // Step 1: operator-initiated disables are reported and left alone.
  if (row.disabledReason && /manual|operator/i.test(row.disabledReason)) {
    return;
  }

  const source = `whop:reenable-candidate:${row.whopWebhookId}`;
  // Claimed up front, before the probe — the real outcome (probe passed/
  // failed/no secret) is filled in via updateFiringOutcome below once
  // known. Claiming here, not after the probe, is what actually closes
  // the race between two overlapping sweeps: without it, both could pass
  // this gate, both probe, and both queue their own duplicate
  // whop_webhook_reenable pending action for the same subscription.
  if (!(await claimFiring(source, "reenable_probe", "pending", "warning", engagementId))) return;

  // Step 2: probe the destination directly. An agent-created subscription's
  // url is this app's own receiver route (webhookReceiverUrl in
  // webhook-subscription-service.ts), which rejects anything that doesn't
  // carry a valid Standard Webhooks signature (Section 7.1) — an unsigned
  // probe would fail every single time regardless of whether the receiver
  // is actually healthy, making re-enable permanently unreachable for
  // exactly the subscriptions this agent manages. Sign it with that
  // subscription's own secret, the same way a real Whop delivery would be
  // signed. Third-party destinations discovered by the audit (not agent-
  // created) have no secret this agent was ever shown, so those keep the
  // plain unsigned probe — 2xx-or-not is the only signal available for a
  // receiver this agent doesn't own.
  const probeBody = JSON.stringify({ type: "whop_agent.health_probe", data: {} });
  let probeHeaders: Record<string, string> = { "Content-Type": "application/json" };
  if (row.createdByAgent) {
    const secrets = await getAgentWebhookSecrets(engagementId);
    const match = secrets.find((s) => s.whopWebhookId === row.whopWebhookId);
    if (!match) {
      // No signing secret on file (e.g. torn down on disconnect) — can't
      // produce a probe the receiver would ever accept. Report rather than
      // silently probe-and-fail.
      await updateFiringOutcome(source, "no_secret_on_file", "critical");
      await alertOperator(
        engagementId,
        "Disabled webhook can't be re-enable-probed",
        `${row.url} (${row.whopWebhookId}) is disabled, but this agent has no signing secret on file for it — cannot produce a probe the receiver would accept.`,
        "critical"
      );
      return;
    }
    const signed = signWhopWebhookPayload(probeBody, match.secret);
    probeHeaders = {
      ...probeHeaders,
      "webhook-id": signed.webhookId!,
      "webhook-timestamp": signed.webhookTimestamp!,
      "webhook-signature": signed.webhookSignature!,
    };
  }

  let probePassed = false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(row.url, {
      method: "POST",
      headers: probeHeaders,
      body: probeBody,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    probePassed = res.status >= 200 && res.status < 300;
  } catch {
    probePassed = false;
  }

  await updateFiringOutcome(source, probePassed ? "passed" : "failed", probePassed ? "warning" : "critical");

  if (!probePassed) {
    await alertOperator(
      engagementId,
      "Disabled webhook still unreachable",
      `${row.url} (${row.whopWebhookId}) is disabled and failed a fresh health probe — not offering re-enable until it responds.`,
      "critical"
    );
    return;
  }

  // Step 3: passing probe -> confirmable action, never silent re-enable.
  await queuePendingAction(
    engagementId,
    "whop_webhook_reenable",
    { whopWebhookId: row.whopWebhookId, url: row.url, events: row.events, consecutiveFailures: row.consecutiveFailures, disabledReason: row.disabledReason },
    `Re-enable ${row.whopWebhookId} (${row.url})? It just passed a fresh health probe after being disabled for: ${row.disabledReason ?? "unknown reason"}.`
  );
}

/**
 * Section 7.4 step 4-6 — the actual re-enable, run only from
 * approval-gate.ts's ACTION_EXECUTORS after an operator approves. Never
 * called directly from the sweep; that's the whole point of the gate.
 */
export async function executeWebhookReenable(engagementId: string, whopWebhookId: string): Promise<void> {
  const client = await WhopAgentClient.forEngagement(engagementId);
  const beforeRow = await db
    .select({ lastDeliveryReceivedAt: whopWebhookRegistry.lastDeliveryReceivedAt, disabledAt: whopWebhookRegistry.disabledAt })
    .from(whopWebhookRegistry)
    .where(and(eq(whopWebhookRegistry.engagementId, engagementId), eq(whopWebhookRegistry.whopWebhookId, whopWebhookId)))
    .then((r) => r[0]);

  await client.request("webhooks.update", `/v1/webhooks/${whopWebhookId}`, {
    method: "PATCH",
    body: { enabled: true },
    idempotencyKey: `whop-webhook-reenable:${whopWebhookId}`,
  });

  const verify = await client
    .request<{ enabled?: boolean; disabled_at?: string | null }>("webhooks.get", `/v1/webhooks/${whopWebhookId}`, { method: "GET" })
    .catch(() => null);

  await db
    .update(whopWebhookRegistry)
    .set({ disabledAt: null, disabledReason: null, consecutiveFailures: 0, failingSince: null, lastFailureAt: null, updatedAt: new Date() })
    .where(and(eq(whopWebhookRegistry.engagementId, engagementId), eq(whopWebhookRegistry.whopWebhookId, whopWebhookId)));

  if (verify && verify.disabled_at) {
    throw new Error(`Read-back after re-enabling ${whopWebhookId} still shows it disabled — flagging for review.`);
  }

  // Step 5: gap replay bounded to the outage window (or 30 days,
  // whichever is shorter — replayGapDeliveries clamps this itself).
  const sinceIso = (beforeRow?.disabledAt ?? beforeRow?.lastDeliveryReceivedAt ?? new Date(0)).toISOString();
  await replayGapDeliveries(engagementId, whopWebhookId, sinceIso).catch((e) => {
    // The re-enable itself already succeeded and is verified above — a
    // failed backfill is a real gap to report, not a reason to fail the
    // whole approved action after the write already landed.
    console.error(`[whop-agent receiver-health] gap replay failed for ${whopWebhookId} (non-fatal):`, e instanceof Error ? e.message : e);
  });
}

/** Every engagement with a live, non-disconnected Whop connection whose
 * credential isn't already known-dead — the sweep's own fan-out list,
 * independent of which skills are enabled. A tripped circuit breaker means
 * every call in the sweep would fail anyway, and credential-health.ts's
 * own cron already owns alerting on that case. */
export async function listConnectedEngagementIds(): Promise<string[]> {
  const rows = await db
    .select({ engagementId: whopAgentConnections.engagementId })
    .from(whopAgentConnections)
    .where(and(isNull(whopAgentConnections.disconnectedAt), eq(whopAgentConnections.circuitBreakerState, "closed")));
  return rows.map((r) => r.engagementId);
}
