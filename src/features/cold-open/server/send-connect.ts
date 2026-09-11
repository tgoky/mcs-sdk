// src/features/cold-open/server/send-connect.ts
//
// Send Connect: wires the sending platform, maps each ICP to a real
// campaign, and checks sending-domain DNS. Port of the Cold Open skill
// pack's send_connect.py — credential resolution goes through this app's
// own vault (see esp/base.ts's header) instead of an env:// reference.

import { getColdOpenConfig, upsertColdOpenConfig, setColdOpenPhaseState } from "./config";
import { createEspAdapter } from "./esp/factory";
import { coldOpenCredentialProvider } from "./source-connect";
import { validateDomainLive, type Gap } from "./dns-validator";
import { normalizeDomain } from "./url-normalize";
import { hasCredential } from "@/lib/credentials";
import { logStep, finishRun, failRun, emptySummary } from "@/lib/run-log";
import type { ColdOpenSendPlatformId } from "@/models/schema";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

export type SendConnectInput = {
  platform: ColdOpenSendPlatformId;
  baseUrl?: string;
  campaignMap: Record<string, string>;
  autoPushIcps: string[];
};

export async function saveSendConnect(engagementId: string, input: SendConnectInput): Promise<{ ok: true } | { error: string }> {
  const config = await getColdOpenConfig(engagementId);
  const icpSlugs = (config?.icps ?? []).map((i) => i.slug);

  if (Object.keys(input.campaignMap ?? {}).length === 0) {
    return { error: "campaign map is empty — map at least one ICP to a real campaign." };
  }
  const unknownMapped = Object.keys(input.campaignMap).filter((slug) => !icpSlugs.includes(slug));
  if (unknownMapped.length > 0) {
    return { error: `campaign map references ICP(s) not on file: ${unknownMapped.join(", ")} — run ICP Lock first.` };
  }
  if (!(await hasCredential(engagementId, coldOpenCredentialProvider(input.platform)))) {
    return { error: `no ${input.platform} credential saved for this engagement yet — connect it first.` };
  }

  await upsertColdOpenConfig(engagementId, {
    sendPlatform: { platform: input.platform, baseUrl: input.baseUrl },
    campaignMap: input.campaignMap,
    autoPushIcps: input.autoPushIcps ?? [],
  });
  await setColdOpenPhaseState(engagementId, "send_connect", "complete");
  return { ok: true };
}

export async function runSendConnect(tenant: any, runId: string, step: StepTools | undefined): Promise<void> {
  const summary = emptySummary();
  const engagementId: string = tenant.engagementId;

  try {
    const config = await (step ? step.run("load-cold-open-config", () => getColdOpenConfig(engagementId)) : getColdOpenConfig(engagementId));
    if (!config?.sendPlatform) {
      throw new Error("No sending platform configured — save the Send Connect form before this skill can run.");
    }

    summary.whatWasAttempted.push(`Verifying the ${config.sendPlatform.platform} connection and campaign map.`);

    const adapter = createEspAdapter(engagementId, config.sendPlatform.platform, { baseUrl: config.sendPlatform.baseUrl });
    const campaignIds = Object.values(config.campaignMap);

    try {
      const gaps = await adapter.verifyCampaigns(campaignIds);
      if (gaps.length > 0) {
        await logStep(runId, { phase: "campaign_verify", status: "failed", detail: gaps.join("; ") });
        summary.whatFailed.push(...gaps);
      } else {
        await logStep(runId, { phase: "campaign_verify", status: "success", detail: `All ${campaignIds.length} mapped campaign(s) exist in the ${config.sendPlatform.platform} account.` });
        summary.whatWorked.push(`All ${campaignIds.length} mapped campaign(s) confirmed live in ${config.sendPlatform.platform}.`);
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      await logStep(runId, { phase: "campaign_verify", status: "failed", detail });
      summary.whatFailed.push(`Could not verify campaigns: ${detail}`);
    }

    // Advisory DNS gap check against the product's own domain — the
    // sending-domain DNS Send Connect cares about. Never blocks (WARNS
    // only), same as the source module's own dns_validator.py contract.
    const sendingDomain = normalizeDomain(config.productIdentity?.url);
    if (sendingDomain) {
      const gaps: Gap[] = await validateDomainLive(sendingDomain);
      if (gaps.length > 0) {
        const detail = gaps.map((g) => `[${g.severity}] ${g.code}: ${g.message}`).join("; ");
        await logStep(runId, { phase: "dns_gap_check", status: "success", detail });
        summary.openItems.push(...gaps.map((g) => `${g.code}: ${g.message}${g.fix ? ` — ${g.fix}` : ""}`));
      } else {
        await logStep(runId, { phase: "dns_gap_check", status: "success", detail: "SPF/DKIM/DMARC all present, no gaps found." });
        summary.whatWorked.push("Sending-domain DNS (SPF/DKIM/DMARC) has no gaps.");
      }
    }

    await finishRun(runId, { summary });
  } catch (err) {
    await failRun(runId, err, { summary }).catch(() => {});
    throw err;
  }
}
