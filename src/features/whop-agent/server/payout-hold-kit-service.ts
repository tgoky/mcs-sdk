// src/features/whop-agent/server/payout-hold-kit-service.ts
//
// Playbook 5.9 — entirely read-only. The agent never contacts Whop support
// on the operator's behalf; the value is packet assembly and escalation
// drafting.
import crypto from "crypto";
import { startRun, logStep, finishRun, failRun } from "@/lib/run-log";
import { WhopAgentClient } from "@/lib/whop-agent/client";

interface WhopAccountHealth {
  required_actions?: string[];
  recommended_actions?: string[];
  status?: string;
  status_reason?: string;
  payment_controls?: unknown;
  verification?: unknown;
}

interface WhopIdentityProfile {
  payout_status?: string;
  payouts_enabled?: boolean;
  linked_companies?: string[];
  verifications?: unknown;
  business_structure?: string;
  status?: string;
}

interface WhopPayoutMethod {
  id: string;
  is_default?: boolean;
  institution_name?: string;
  currency?: string;
  destination?: string;
}

export interface PayoutHoldPacket {
  accountHealth: WhopAccountHealth | null;
  identityProfile: WhopIdentityProfile | null;
  payoutMethods: WhopPayoutMethod[];
  chargebackRatio90d: number | null;
  draftedEscalation: string;
  followUpChecklist: string[];
  gatheredManually: string[];
}

function draftEscalationMessage(health: WhopAccountHealth | null, identity: WhopIdentityProfile | null): string {
  const lines = [
    "Subject: Payout hold / suspension (requesting review)",
    "",
    "Hello Whop Support,",
    "",
    `My account's payout status is currently "${identity?.payout_status ?? health?.status ?? "unknown"}".`,
  ];
  if (health?.status_reason) lines.push(`Whop's stated reason: ${health.status_reason}`);
  if (health?.required_actions?.length) lines.push(`Required actions on file: ${health.required_actions.join(", ")}`);
  if (health?.recommended_actions?.length) lines.push(`Recommended actions on file: ${health.recommended_actions.join(", ")}`);
  lines.push("", "I'd like to understand what's needed to resolve this and resume payouts. Evidence packet attached.", "", "Thank you,");
  return lines.join("\n");
}

const FOLLOW_UP_CHECKLIST = [
  "Confirm business verification documents are current in the Whop dashboard.",
  "Review recent dispute and chargeback activity for patterns Whop may be flagging.",
  "Check that the default payout method's bank details are current and verified.",
  "Respond to any outstanding required_actions before following up a second time.",
];

/** Section 5.9's own executor — read-only, can run on a real hold signal
 * or on-demand ("packet-on-demand mode so the operator has it ready
 * before a hold happens"). */
export async function assemblePayoutHoldPacket(engagementId: string): Promise<{ runId: string; packet: PayoutHoldPacket }> {
  const runId = crypto.randomUUID();
  await startRun({ id: runId, engagementId, skillName: "whop-payout-hold-kit", phase: "evidence_gather", label: "Payout Hold Evidence Packet" });

  try {
    const client = await WhopAgentClient.forEngagement(engagementId);
    const gatheredManually: string[] = [];

    await logStep(runId, { phase: "account_health_read", status: "running" });
    const accountHealth = await client.request<WhopAccountHealth>("accounts.get", "/v1/accounts").catch((err) => {
      gatheredManually.push("Account health (required_actions/recommended_actions/status)");
      logStep(runId, { phase: "account_health_read", status: "failed", detail: err instanceof Error ? err.message : String(err) });
      return null;
    });
    if (accountHealth) await logStep(runId, { phase: "account_health_read", status: "success" });

    await logStep(runId, { phase: "identity_profile_read", status: "running" });
    const identityRes = await client.request<{ data?: WhopIdentityProfile[] }>("identity_profiles.list", "/v1/identity_profiles").catch((err) => {
      gatheredManually.push("Identity profile (payout_status/payouts_enabled/verifications)");
      logStep(runId, { phase: "identity_profile_read", status: "failed", detail: err instanceof Error ? err.message : String(err) });
      return null;
    });
    const identityProfile = identityRes?.data?.[0] ?? null;
    if (identityProfile) await logStep(runId, { phase: "identity_profile_read", status: "success" });

    await logStep(runId, { phase: "payout_methods_read", status: "running" });
    const payoutMethodsRes = await client.request<{ data?: WhopPayoutMethod[] }>("payout_methods.list", "/v1/payout_methods", { query: { company_id: client.accountId ?? "" } }).catch((err) => {
      gatheredManually.push("Payout methods");
      logStep(runId, { phase: "payout_methods_read", status: "failed", detail: err instanceof Error ? err.message : String(err) });
      return null;
    });
    const payoutMethods = payoutMethodsRes?.data ?? [];
    if (payoutMethodsRes) await logStep(runId, { phase: "payout_methods_read", status: "success", detail: `${payoutMethods.length} method(s) on file` });

    await logStep(runId, { phase: "dispute_history_read", status: "running" });
    const disputeRateRes = await client.statsMetric("receipts/disputes:dispute_rate", { granularity: "weekly" }).catch(() => null);
    const chargebackRatio90d = disputeRateRes?.data?.length ? Number(disputeRateRes.data[disputeRateRes.data.length - 1][1]) : null;
    if (chargebackRatio90d === null) gatheredManually.push("Chargeback ratio (90-day)");
    await logStep(runId, { phase: "dispute_history_read", status: chargebackRatio90d === null ? "failed" : "success" });

    const packet: PayoutHoldPacket = {
      accountHealth,
      identityProfile,
      payoutMethods,
      chargebackRatio90d,
      draftedEscalation: draftEscalationMessage(accountHealth, identityProfile),
      followUpChecklist: FOLLOW_UP_CHECKLIST,
      gatheredManually,
    };

    await finishRun(runId, {
      summary: {
        whatWasAttempted: ["Account-health read", "Identity profile read", "Payout methods read", "Dispute-rate read", "Escalation draft"],
        whatWorked: [
          accountHealth ? `Account status: ${accountHealth.status ?? "unknown"}` : "",
          identityProfile ? `Payout status: ${identityProfile.payout_status ?? "unknown"}` : "",
          `${payoutMethods.length} payout method(s) found`,
        ].filter(Boolean),
        whatFailed: gatheredManually.length ? gatheredManually.map((g) => `${g} (needs manual gathering)`) : [],
        openItems: ["The agent does not contact Whop support. Send the drafted escalation and packet yourself."],
        decisionsMade: [],
      },
    });

    return { runId, packet };
  } catch (err) {
    await failRun(runId, err).catch(() => {});
    throw err;
  }
}
