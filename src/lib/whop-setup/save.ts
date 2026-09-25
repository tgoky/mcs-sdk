// src/lib/whop-setup/save.ts
//
// Saves Whop Agent's reviewed setup: the save offer, the alert levels, the
// bridge address, which workers are on, and the one webhook those workers
// need. The webhook is the only thing written to Whop; everything that
// changes a client's members or money still goes through approval.

import type { EngagementStack } from "@/models/schema";
import { patchEngagementStack } from "@/lib/engagement-stack";
import { setSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { assertPublicUrl, UnsafeUrlError } from "@/lib/safe-fetch";
import { WHOP_AGENT_SKILL_IDS } from "@/lib/whop-agent-skill-manifest";
import { syncAgentWebhookEvents } from "@/features/whop-agent/server/webhook-subscription-service";
import { SKILL_EVENTS, eventsFor } from "./analyze";

export interface WhopSetupInput {
  skills: string[];
  saveOffer: { discount: number; months: number; message: string; minTenureDays: number | null; cooldownDays: number | null } | null;
  /** Refund and dispute levels are fractions of payments. */
  alerts: { refundRate: number; disputeRate: number; alertThreshold: number; minSample: number };
  bridgeUrl: string;
  /** Field renames for what's forwarded: an object replaces the saved one,
   * null clears it, undefined (an older caller) leaves it as saved. */
  bridgeFieldMapping?: Record<string, string> | null;
}

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

/** Reads the request body into a clean input, or says what's wrong. */
export function parseWhopSetup(body: unknown): WhopSetupInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "Invalid request body." };
  const b = body as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  // The save offer is all or nothing: never a guessed discount or message.
  let saveOffer: WhopSetupInput["saveOffer"] = null;
  const o = b.saveOffer ?? {};
  const discount = num(o.discount);
  const months = num(o.months);
  const message = typeof o.message === "string" ? o.message.trim().slice(0, 1000) : "";
  const anyOffer = discount !== null || months !== null || message !== "";
  if (anyOffer) {
    if (discount === null || !Number.isFinite(discount) || discount <= 0 || discount > 100) return { error: "The save offer's discount must be between 1 and 100%." };
    if (months === null || !Number.isInteger(months) || months <= 0 || months > 36) return { error: "The save offer's length must be a whole number of months, 1 to 36." };
    if (!message) return { error: "Write the message members see with the save offer, or clear the discount and length." };
    const tenure = num(o.minTenureDays);
    const cooldown = num(o.cooldownDays);
    if (tenure !== null && (!Number.isInteger(tenure) || tenure < 0)) return { error: "Minimum membership length must be a whole number of days." };
    if (cooldown !== null && (!Number.isInteger(cooldown) || cooldown < 0)) return { error: "Days between offers must be a whole number." };
    saveOffer = { discount, months, message, minTenureDays: tenure, cooldownDays: cooldown };
  }

  const a = b.alerts ?? {};
  const refundRate = Number(a.refundRate);
  const disputeRate = Number(a.disputeRate);
  const alertThreshold = Number(a.alertThreshold);
  const minSample = Number(a.minSample);
  if (!Number.isFinite(refundRate) || refundRate < 0.01 || refundRate > 0.5) return { error: "The refund alert level must be between 1% and 50%." };
  if (!Number.isFinite(disputeRate) || disputeRate < 0.001 || disputeRate > 0.05) return { error: "The dispute alert level must be between 0.1% and 5%." };
  if (!Number.isInteger(alertThreshold) || alertThreshold < 1 || alertThreshold > 100) return { error: "Dispute alerts must be a whole number from 1 to 100." };
  if (!Number.isInteger(minSample) || minSample < 1 || minSample > 1000) return { error: "Payments needed before a rate counts must be a whole number from 1 to 1,000." };

  // Field renames: each key a Whop field name, each value the name the
  // receiving tool expects. Only plain strings, and not too many.
  let parsedMapping: Record<string, string> | null = null;
  if (b.bridgeFieldMapping !== undefined && b.bridgeFieldMapping !== null) {
    const m = b.bridgeFieldMapping;
    if (typeof m !== "object" || Array.isArray(m)) return { error: "Field names must be a list of Whop name to your name." };
    const entries = Object.entries(m as Record<string, unknown>);
    if (entries.length > 100) return { error: "Keep field names to 100 or fewer." };
    for (const [k, v] of entries) {
      if (!k.trim() || typeof v !== "string" || !v.trim()) return { error: "Every field name needs both the Whop name and yours." };
    }
    parsedMapping = Object.fromEntries(entries.map(([k, v]) => [k.trim(), String(v).trim()]));
  }

  return {
    skills: Array.isArray(b.skills) ? b.skills.filter((s: unknown): s is string => typeof s === "string" && (WHOP_AGENT_SKILL_IDS as string[]).includes(s)) : [],
    saveOffer,
    alerts: { refundRate, disputeRate, alertThreshold, minSample },
    bridgeUrl: typeof b.bridgeUrl === "string" ? b.bridgeUrl.trim() : "",
    ...(b.bridgeFieldMapping === undefined ? {} : { bridgeFieldMapping: parsedMapping }),
  };
}

/** The events the chosen workers can actually use: the save offer needs
 * an offer to make, the bridge needs somewhere to send. */
/** Every event the setup's workers can ask for. */
const SETUP_EVENTS = new Set(Object.values(SKILL_EVENTS).flat());

export function webhookEventsFor(input: WhopSetupInput): string[] {
  const usable = input.skills.filter((s) => (s !== "whop-cancellation-save-offer" || input.saveOffer) && (s !== "whop-bridge-manager" || input.bridgeUrl));
  return eventsFor(usable);
}

export type WhopSaveResult =
  | { ok: true; webhook: { action: "created" | "updated" | "unchanged" | "none"; events: string[] } | { error: string; events: string[] } }
  | { error: string; field: string };

export async function saveWhopSetup(engagementId: string, input: WhopSetupInput, sync = syncAgentWebhookEvents): Promise<WhopSaveResult> {
  let bridgeUrl: string | undefined;
  if (input.bridgeUrl) {
    try {
      bridgeUrl = (await assertPublicUrl(input.bridgeUrl, { httpsOnly: true })).toString();
    } catch (err) {
      return { error: `The bridge address must be a public https:// address. ${err instanceof UnsafeUrlError ? err.message : ""}`.trim(), field: "bridge" };
    }
  }

  const patch: Partial<EngagementStack> = {
    // refund_dispute_rate_threshold holds the refund level (name kept for saved values).
    refund_dispute_rate_threshold: input.alerts.refundRate,
    dispute_rate_threshold: input.alerts.disputeRate,
    dispute_alert_threshold: input.alerts.alertThreshold,
    min_payment_sample_size: input.alerts.minSample,
    whop_bridge_destination_url: bridgeUrl,
    ...(input.bridgeFieldMapping === undefined ? {} : { whop_bridge_field_mapping: input.bridgeFieldMapping && Object.keys(input.bridgeFieldMapping).length ? input.bridgeFieldMapping : undefined }),
    ...(input.saveOffer
      ? {
          whop_save_offer_discount_percentage: input.saveOffer.discount,
          whop_save_offer_duration_months: input.saveOffer.months,
          whop_save_offer_message: input.saveOffer.message,
          whop_save_offer_min_tenure_days: input.saveOffer.minTenureDays ?? undefined,
          whop_save_offer_cooldown_days: input.saveOffer.cooldownDays ?? undefined,
        }
      : {
          whop_save_offer_discount_percentage: undefined,
          whop_save_offer_duration_months: undefined,
          whop_save_offer_message: undefined,
        }),
  };
  await patchEngagementStack(engagementId, patch);

  const on = new Set(input.skills);
  await setSkillEnabledForEngagement(engagementId, "whop-connect", true);
  for (const skill of WHOP_AGENT_SKILL_IDS) if (skill !== "whop-connect") await setSkillEnabledForEngagement(engagementId, skill, on.has(skill));

  // Settings stay saved even if Whop refuses the webhook; the screen says so.
  const events = webhookEventsFor(input);
  try {
    // Drops only the events of workers switched off here; events another
    // worker added to the same webhook stay.
    const { action } = await sync(engagementId, events, { keep: (e) => !SETUP_EVENTS.has(e) });
    return { ok: true, webhook: { action, events } };
  } catch (err) {
    return { ok: true, webhook: { error: err instanceof Error ? err.message : "Whop didn't accept the webhook.", events } };
  }
}
