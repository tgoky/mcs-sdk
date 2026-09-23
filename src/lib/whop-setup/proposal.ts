// src/lib/whop-setup/proposal.ts
//
// What Whop Agent's review screen proposes, from the saved settings and
// the latest account read. Pure. Saved values always win. The save-offer
// discount is only ever the client's own (saved, or already set on their
// Whop plans) and the message is never written for them.

import type { EngagementStack } from "@/models/schema";
import { DEFAULT_ALERTS, existingCancelDiscount, proposeAlerts, snapshotOf, topReasons, webhookProblems } from "./analyze";
import { EXPECTED_LOCKED, PROBE_LABELS } from "./probe-labels";
import type { WhopAccountRead, WhopSetupState } from "./types";

export interface ProposalInput {
  read: WhopAccountRead | null;
  stack: Partial<EngagementStack>;
  probe: Record<string, { ok: boolean }> | null;
  agentEvents: string[] | null;
  receiverUrl: string;
  ghlConnected: boolean;
  groupKey: (url: string, events: string[]) => string;
}

export function buildWhopProposal(input: ProposalInput): Pick<WhopSetupState, "snapshot" | "saveOffer" | "alerts" | "webhook"> & { bridge: Omit<WhopSetupState["bridge"], "signingSecret">; locked: WhopSetupState["connection"]["locked"] } {
  const { read, stack } = input;
  const snapshot = read ? snapshotOf(read) : null;

  // ── Save offer ──
  const savedOffer = stack.whop_save_offer_discount_percentage != null;
  const own = read && !savedOffer ? existingCancelDiscount(read.plans) : null;
  const evidence: string[] = [];
  if (read?.canceling) {
    const n = read.canceling.count;
    evidence.push(n === 0 ? "No members are set to cancel right now." : `${n}${read.canceling.more ? "+" : ""} ${n === 1 ? "member is" : "members are"} set to cancel at the end of their period.`);
    const reasons = topReasons(read.canceling.reasons);
    if (reasons.length) evidence.push(`Most given reason${reasons.length > 1 ? "s" : ""}: ${reasons.map((r) => `"${r.reason}"${r.count > 1 ? ` (${r.count})` : ""}`).join(", ")}.`);
  }
  if (snapshot?.churn != null) evidence.push(`Whop's stats put churn at ${(snapshot.churn * 100).toFixed(1)}%.`);
  const saveOffer = {
    discount: stack.whop_save_offer_discount_percentage ?? own?.percentage ?? null,
    months: stack.whop_save_offer_duration_months ?? own?.months ?? null,
    message: stack.whop_save_offer_message ?? "",
    minTenureDays: stack.whop_save_offer_min_tenure_days ?? null,
    cooldownDays: stack.whop_save_offer_cooldown_days ?? null,
    source: own ? `the cancel discount already on ${own.plans.length === 1 ? own.plans[0] : `${own.plans.length} of your plans`}` : null,
    evidence,
  };

  // ── Alerts ──
  const proposed = read && snapshot ? proposeAlerts(snapshot, read) : { ...DEFAULT_ALERTS, why: { rate: "Whop Agent's default.", alerts: "Whop Agent's default.", sample: "Rates are only checked once a week has at least this many payments." }, fromData: false };
  const savedAlerts = stack.refund_dispute_rate_threshold != null || stack.dispute_alert_threshold != null || stack.min_payment_sample_size != null;
  const alerts = savedAlerts
    ? {
        ...proposed,
        rateThreshold: stack.refund_dispute_rate_threshold ?? proposed.rateThreshold,
        alertThreshold: stack.dispute_alert_threshold ?? proposed.alertThreshold,
        minSample: stack.min_payment_sample_size ?? proposed.minSample,
        saved: true,
      }
    : { ...proposed, saved: false };

  // ── Connection problems ──
  const locked = Object.entries(input.probe ?? {})
    .filter(([label, r]) => !r.ok && !EXPECTED_LOCKED.has(label))
    .map(([label]) => ({ label: PROBE_LABELS[label]?.label ?? label, locks: PROBE_LABELS[label]?.locksWhat ?? "" }));

  return {
    snapshot,
    saveOffer,
    alerts,
    bridge: { url: stack.whop_bridge_destination_url ?? "", ghlConnected: input.ghlConnected },
    webhook: {
      current: input.agentEvents,
      receiverUrl: input.receiverUrl,
      // The agent's own subscription isn't the client's problem to fix.
      problems: read ? webhookProblems({ ...read, webhooks: (read.webhooks ?? []).filter((w) => w.url !== input.receiverUrl) }, input.groupKey) : [],
    },
    locked,
  };
}
