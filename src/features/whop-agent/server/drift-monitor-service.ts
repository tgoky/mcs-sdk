// src/features/whop-agent/server/drift-monitor-service.ts
//
// Playbook 5.3 — scoped to exactly the 6 resources Whop documents as
// exempt from version pinning: cards, plans, transfers, swaps, deposits,
// exports. `plans` is the commercially significant one (pricing payloads,
// and Playbook 5.1's plan.updated confirmation channel depends on its
// shape).
import crypto from "crypto";
import { db } from "@/lib/db";
import { whopWebhookRegistry } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { WhopAgentClient } from "@/lib/whop-agent/client";
import { queuePendingAction } from "@/lib/approval-gate";
import { isSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { startRun, logStep, finishRun, failRun } from "@/lib/run-log";

const PIN_EXEMPT_EVENT_TYPES = ["card.updated", "plan.updated", "transfer.updated", "swap.updated", "deposit.updated", "export.updated"] as const;

/**
 * A shallow structural fingerprint — the sorted key set at the top level
 * plus one level of nesting, not a full type schema. "Structural" per
 * Section 5.3's own language: the goal is noticing a field appeared,
 * disappeared, or got nested differently, not validating types.
 */
export function computeStructuralFingerprint(payload: unknown): Record<string, string[]> {
  const fingerprint: Record<string, string[]> = {};
  if (!payload || typeof payload !== "object") return fingerprint;
  const topKeys = Object.keys(payload as Record<string, unknown>).sort();
  fingerprint["$"] = topKeys;
  for (const key of topKeys) {
    const value = (payload as Record<string, unknown>)[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      fingerprint[key] = Object.keys(value as Record<string, unknown>).sort();
    }
  }
  return fingerprint;
}

function fingerprintsEqual(a: Record<string, string[]>, b: Record<string, string[]>): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function diffFingerprints(prior: Record<string, string[]>, next: Record<string, string[]>): string[] {
  const diffs: string[] = [];
  const allKeys = new Set([...Object.keys(prior), ...Object.keys(next)]);
  for (const key of allKeys) {
    const priorFields = new Set(prior[key] ?? []);
    const nextFields = new Set(next[key] ?? []);
    const added = [...nextFields].filter((f) => !priorFields.has(f));
    const removed = [...priorFields].filter((f) => !nextFields.has(f));
    if (added.length) diffs.push(`${key}: added [${added.join(", ")}]`);
    if (removed.length) diffs.push(`${key}: removed [${removed.join(", ")}]`);
  }
  return diffs;
}

/**
 * Playbook 5.3's own executor. Auto-detects the subset of the operator's
 * subscribed events belonging to the 6 exempt resources (Section 5.3:
 * "If the operator subscribes to none of them, the playbook reports 'not
 * applicable' and consumes no budget").
 */
export async function runDriftMonitor(tenant: any, runId: string): Promise<void> {
  const engagementId = tenant.engagementId as string;

  try {
    const subscriptions = await db.select().from(whopWebhookRegistry).where(eq(whopWebhookRegistry.engagementId, engagementId));
    const monitoredEventTypes = new Set<string>();
    for (const sub of subscriptions) {
      for (const eventType of sub.events) {
        if ((PIN_EXEMPT_EVENT_TYPES as readonly string[]).includes(eventType)) monitoredEventTypes.add(eventType);
      }
    }

    if (monitoredEventTypes.size === 0) {
      await finishRun(runId, {
        status: "skipped",
        summary: { whatWasAttempted: ["Checked subscribed events against the 6 pin-exempt resources"], whatWorked: [], whatFailed: [], openItems: ["Not applicable — no pin-exempt-resource events subscribed."], decisionsMade: [] },
      });
      return;
    }

    const client = await WhopAgentClient.forEngagement(engagementId);
    const alerts: string[] = [];
    const unmonitorable: string[] = [];

    for (const eventType of monitoredEventTypes) {
      await logStep(runId, { phase: `drift_${eventType}`, status: "running" });
      const sub = subscriptions.find((s) => s.events.includes(eventType));
      if (!sub) continue;

      let sample: unknown = null;
      try {
        const testEventRes = await client.request<{ data?: unknown; payload?: unknown }>("webhooks.send_test_event", `/v1/webhooks/${sub.whopWebhookId}/send_test_event`, {
          method: "POST",
          body: { event_type: eventType },
        });
        sample = testEventRes.data ?? testEventRes.payload ?? testEventRes;
      } catch {
        // Fail-open: "send_test_event fails on a specific event type —
        // Fall back to comparing recent live deliveries only for that
        // type; flag reduced coverage."
        try {
          const deliveries = await client.request<{ data?: Array<{ payload?: unknown }> }>("webhooks.deliveries", `/v1/webhooks/${sub.whopWebhookId}/deliveries`, {});
          sample = deliveries.data?.[0]?.payload ?? null;
          if (!sample) throw new Error("no recent deliveries to compare against");
          await logStep(runId, { phase: `drift_${eventType}`, status: "success", detail: "send_test_event failed — used a recent live delivery instead (reduced coverage)." });
        } catch (fallbackErr) {
          unmonitorable.push(eventType);
          await logStep(runId, { phase: `drift_${eventType}`, status: "failed", detail: `Both test event and live-delivery comparison failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}` });
          continue;
        }
      }

      const nextFingerprint = computeStructuralFingerprint(sample);
      const priorFingerprint = sub.schemaFingerprint as Record<string, string[]> | null;

      if (!priorFingerprint) {
        // First observation — store as baseline, nothing to diff against yet.
        await db.update(whopWebhookRegistry).set({ schemaFingerprint: nextFingerprint, schemaFingerprintUpdatedAt: new Date() }).where(and(eq(whopWebhookRegistry.engagementId, engagementId), eq(whopWebhookRegistry.whopWebhookId, sub.whopWebhookId)));
        await logStep(runId, { phase: `drift_${eventType}`, status: "success", detail: "Baseline fingerprint recorded." });
        continue;
      }

      if (fingerprintsEqual(priorFingerprint, nextFingerprint)) {
        await logStep(runId, { phase: `drift_${eventType}`, status: "success", detail: "No structural change." });
        continue;
      }

      const diffs = diffFingerprints(priorFingerprint, nextFingerprint);
      alerts.push(`${eventType}: ${diffs.join("; ")}`);
      await logStep(runId, { phase: `drift_${eventType}`, status: "failed", detail: `Structural change detected: ${diffs.join("; ")}` });

      // Section 5.3 guardrail: "Never adopts a new schema silently." Staged
      // via the same confirmation-gate mechanism as every other Whop write —
      // approval here just means "start using this shape as the new
      // baseline," it doesn't touch Whop itself.
      await queuePendingAction(
        engagementId,
        "whop_drift_fingerprint_adopt",
        { whopWebhookId: sub.whopWebhookId, eventType, nextFingerprint },
        `${eventType}'s payload shape changed (${diffs.join("; ")}). ${eventType === "plan.updated" ? "This backs Product Launch Pre-Flight's pricing confirmation — review before adopting." : ""} Adopt the new shape as the baseline?`
      );
    }

    await finishRun(runId, {
      summary: {
        whatWasAttempted: [`Checked ${monitoredEventTypes.size} pin-exempt event type(s)`],
        whatWorked: [...monitoredEventTypes].filter((e) => !alerts.some((a) => a.startsWith(e)) && !unmonitorable.includes(e)),
        whatFailed: [...alerts, ...unmonitorable.map((e) => `${e}: unmonitorable this pass`)],
        openItems: alerts.length ? ["Structural changes queued for operator review — never auto-adopted."] : [],
        decisionsMade: [],
      },
    });
  } catch (err) {
    await failRun(runId, err).catch(() => {});
    throw err;
  }
}

export async function executeDriftFingerprintAdopt(engagementId: string, whopWebhookId: string, nextFingerprint: Record<string, string[]>): Promise<void> {
  await db
    .update(whopWebhookRegistry)
    .set({ schemaFingerprint: nextFingerprint, schemaFingerprintUpdatedAt: new Date() })
    .where(and(eq(whopWebhookRegistry.engagementId, engagementId), eq(whopWebhookRegistry.whopWebhookId, whopWebhookId)));
}

/** Manual/scheduled dispatch — mirrors dispatchWeeklyOpsReportRun's shape. */
export async function dispatchDriftMonitorRun(engagementId: string): Promise<string> {
  if (!(await isSkillEnabledForEngagement(engagementId, "whop-drift-monitor"))) {
    throw new Error("Drift Monitor is turned off for this engagement.");
  }
  const runId = crypto.randomUUID();
  await startRun({ id: runId, engagementId, skillName: "whop-drift-monitor", phase: "drift_plan.updated", label: "Pin-Exempt Resource Drift Monitor" });
  await runDriftMonitor({ engagementId }, runId);
  return runId;
}
