// src/features/whop-agent/server/purchase-cap-copilot-service.ts
//
// Playbook 5.2 — entirely read-only, no writes to Whop (there is no API to
// submit the application itself; the value is assembly + a walkthrough).
import crypto from "crypto";
import { startRun, logStep, finishRun, failRun } from "@/lib/run-log";
import { WhopAgentClient } from "@/lib/whop-agent/client";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

interface WhopAccountHealth {
  required_actions?: string[];
  recommended_actions?: string[];
  verification?: { individual?: { status?: string }; business?: { status?: string } | null };
  payment_controls?: unknown;
  status?: string;
  status_reason?: string;
}

export interface PurchaseCapPacketInput {
  highestPricedOfferCents: number;
  targetApprovalAmountCents: number;
  contactEmail: string;
}

export interface PurchaseCapPacket {
  salesHistory: { grossRevenueCents: number | null; successfulPayments: number | null; unavailable: boolean };
  accountHealth: WhopAccountHealth | null;
  walkthrough: string[];
  reserveAlternativeNote: string;
}

function latestValue(response: { data: Array<[string, ...(number | string)[]]> } | null): number | null {
  if (!response?.data?.length) return null;
  const value = response.data[response.data.length - 1][1];
  return typeof value === "number" ? value : Number(value);
}

const WALKTHROUGH_STEPS = [
  "Go to Whop Dashboard → Settings → Payments.",
  "Find the purchase-cap increase request form.",
  "Enter the target approval amount and attach this packet's sales history and account-health summary.",
  "Submit. Whop reviews within 24 hours. There is no API to check status; check back in the dashboard.",
];

/**
 * Playbook 5.2's own executor. Not wired into whop-agent-skill-registry.ts
 * generically — same "needs real input, own route" reasoning as Product
 * Launch Pre-Flight — but can also be triggered as an automatic hand-off
 * from 5.1 when a plan's price exceeds the purchase cap.
 */
export async function assemblePurchaseCapPacket(engagementId: string, input: PurchaseCapPacketInput, step?: StepTools): Promise<PurchaseCapPacket> {
  const runId = crypto.randomUUID();
  const runStep = step
    ? <R,>(id: string, fn: () => Promise<R>) => step.run(id, fn)
    : <R,>(_id: string, fn: () => Promise<R>) => fn();

  await startRun({ id: runId, engagementId, skillName: "whop-purchase-cap-copilot", phase: "sales_history_pull", label: "Purchase Cap Application Packet" });

  try {
    const client = await WhopAgentClient.forEngagement(engagementId);

    await logStep(runId, { phase: "sales_history_pull", status: "running" });
    let grossRevenue: number | null = null;
    let successfulPayments: number | null = null;
    let salesHistoryUnavailable = false;
    try {
      const [revenueRes, paymentsRes] = await Promise.all([
        runStep("fetch-gross-revenue", () => client.statsMetric("receipts:gross_revenue")),
        runStep("fetch-successful-payments", () => client.statsMetric("receipts:successful_payments")),
      ]);
      grossRevenue = latestValue(revenueRes);
      successfulPayments = latestValue(paymentsRes);
      await logStep(runId, { phase: "sales_history_pull", status: "success" });
    } catch (err) {
      // Fail-open: "Sales history query fails — Assemble the packet with
      // that section blank and flag the operator to fill it manually."
      salesHistoryUnavailable = true;
      const message = err instanceof Error ? err.message : String(err);
      await logStep(runId, { phase: "sales_history_pull", status: "failed", detail: `${message}. Packet will note this section needs manual entry.` });
    }

    await logStep(runId, { phase: "account_health_read", status: "running" });
    let accountHealth: WhopAccountHealth | null = null;
    try {
      accountHealth = await runStep("fetch-account-health", () => client.request<WhopAccountHealth>("accounts.get", "/v1/accounts"));
      await logStep(runId, { phase: "account_health_read", status: "success" });
    } catch (err) {
      // Fail-open: "Account-health read fails — Assemble without it; do
      // not block the packet."
      const message = err instanceof Error ? err.message : String(err);
      await logStep(runId, { phase: "account_health_read", status: "failed", detail: `${message}. Assembling without account-health context.` });
    }

    const packet: PurchaseCapPacket = {
      salesHistory: { grossRevenueCents: grossRevenue, successfulPayments, unavailable: salesHistoryUnavailable },
      accountHealth,
      walkthrough: WALKTHROUGH_STEPS,
      reserveAlternativeNote:
        "New businesses without processing history can alternately hold a percentage of funds in reserve for 60 days to unlock immediately, instead of waiting on a cap increase.",
    };

    await finishRun(runId, {
      summary: {
        whatWasAttempted: ["Pull sales history from the stats engine", "Read account-health signals", "Assemble application packet"],
        whatWorked: [
          salesHistoryUnavailable ? "Packet assembled with sales history flagged for manual entry" : `Gross revenue: ${grossRevenue ?? "n/a"}, successful payments: ${successfulPayments ?? "n/a"}`,
          accountHealth ? `Account status: ${accountHealth.status ?? "unknown"}` : "Account-health section omitted (read failed)",
        ],
        whatFailed: salesHistoryUnavailable ? ["Sales history unavailable. Needs manual entry"] : [],
        openItems: ["Submit is manual. Whop has no API for it. Operator should record the outcome once Whop responds."],
        decisionsMade: [`Target approval amount: $${(input.targetApprovalAmountCents / 100).toFixed(2)}`, `Highest-priced offer: $${(input.highestPricedOfferCents / 100).toFixed(2)}`],
      },
    });

    return packet;
  } catch (err) {
    await failRun(runId, err).catch(() => {});
    throw err;
  }
}
