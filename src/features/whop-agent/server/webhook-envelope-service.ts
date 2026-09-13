// src/features/whop-agent/server/webhook-envelope-service.ts
//
// Section 7.5's previous_attributes handling — the cross-cutting behavior
// every .updated event goes through regardless of which skill (if any)
// also reacts to it. "Every delta received is appended to the change
// ledger regardless of whether a playbook consumed it, so Playbook 5.13
// has a complete record."
import crypto from "crypto";
import { db } from "@/lib/db";
import { whopChangeLedger } from "@/models/schema";

// Section 5.13's default material-field allowlist: "pricing, visibility,
// status, policy, and payout fields." Per-resource-type, so a plan's price
// change and a webhook's own housekeeping field are judged by different
// rules. Deliberately conservative and small — an operator can widen this
// later (Section 5.13: "The operator can widen it"); nothing here silently
// assumes a field is material that this list doesn't name.
const MATERIAL_FIELDS: Record<string, string[]> = {
  plan: ["initial_price", "renewal_price", "visibility", "release_method", "billing_period"],
  product: ["visibility", "title", "headline"],
  membership: ["status", "valid", "cancel_at_period_end"],
  dispute: ["status"],
  refund: ["status"],
  payout: ["status"],
  payout_account: ["status", "payouts_enabled"],
  identity_profile: ["payout_status", "payouts_enabled", "status"],
};

function isMaterial(resourceType: string, changedKeys: string[]): boolean {
  const allowlist = MATERIAL_FIELDS[resourceType];
  if (!allowlist) return true; // unknown resource type — don't silently hide it behind a rule that was never written for it
  return changedKeys.some((key) => allowlist.includes(key));
}

export interface WhopUpdatedEnvelope {
  type: string; // "plan.updated", "membership.cancel_at_period_end_changed", ...
  data?: { id?: string; previous_attributes?: Record<string, unknown>; [key: string]: unknown };
  // Some Whop envelopes may carry previous_attributes at the top level
  // rather than nested under data — both are checked (Section 7.5 doesn't
  // pin the exact envelope shape down to this level of detail).
  previous_attributes?: Record<string, unknown>;
}

/**
 * Appends one change-ledger entry per .updated-shaped event, per Section
 * 7.5's rules: never a read-back diff, never a cached prior state, and
 * "changed, delta unavailable" (not a dropped event) when
 * previous_attributes is genuinely absent.
 */
export async function recordWhopChangeLedgerEntry(engagementId: string, envelope: WhopUpdatedEnvelope, occurredAt: Date): Promise<void> {
  const [resourceType] = envelope.type.split(".");
  const resourceId = envelope.data?.id ?? "unknown";
  const previousAttributes = envelope.previous_attributes ?? envelope.data?.previous_attributes ?? null;

  if (!previousAttributes) {
    await db.insert(whopChangeLedger).values({
      id: crypto.randomUUID(),
      engagementId,
      resourceType,
      resourceId,
      eventType: envelope.type,
      changedFields: null,
      deltaAvailable: false,
      material: true, // never silently hidden behind the allowlist when there's no delta to judge in the first place
      occurredAt,
    });
    return;
  }

  const changedKeys = Object.keys(previousAttributes);
  const changedFields: Record<string, { previous: unknown; current?: unknown }> = {};
  for (const key of changedKeys) {
    changedFields[key] = { previous: previousAttributes[key], current: envelope.data?.[key] };
  }

  await db.insert(whopChangeLedger).values({
    id: crypto.randomUUID(),
    engagementId,
    resourceType,
    resourceId,
    eventType: envelope.type,
    changedFields,
    deltaAvailable: true,
    material: isMaterial(resourceType, changedKeys),
    occurredAt,
  });
}

/** Section 7.5: `.updated` events, plus `membership.cancel_at_period_end_changed`
 * which carries the same field and is treated as one for this purpose. */
export function isUpdatedShapedEvent(eventType: string): boolean {
  return eventType.endsWith(".updated") || eventType === "membership.cancel_at_period_end_changed";
}
