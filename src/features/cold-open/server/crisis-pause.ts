// src/features/cold-open/server/crisis-pause.ts
//
// When Reputation declares a crisis, cold email shouldn't keep going out
// under the client's name. This proposes pausing Cold Open's campaigns in
// the client's own sending tool (approval first), stops Daily Send from
// pushing while paused, and proposes the restart once the incident is
// resolved. Only campaigns this app paused are restarted.
//
// Pause calls per sending tool (setCampaignPaused in esp/*.ts):
//   Instantly  POST /api/v2/campaigns/{id}/pause | /activate
//   Smartlead  POST /campaigns/{id}/status {status: "PAUSED" | "START"}
//   Reply.io   POST /v3/sequences/{id}/pause | /start
//   Lemlist    not paused from here; the client is told to pause it themselves.

import { getColdOpenConfig, upsertColdOpenConfig } from "./config";
import { createEspAdapter } from "./esp/factory";
import { queuePendingAction } from "@/lib/approval-gate";
import { isSkillEnabledForEngagement } from "@/lib/engagement-skills";
import type { ColdOpenSendingPause } from "@/models/schema";

const TOOL_NAME: Record<string, string> = { instantly: "Instantly", smartlead: "Smartlead", lemlist: "lemlist", reply_io: "Reply.io" };

/** The campaigns Cold Open sends into: every campaign the lead map points at. */
export function coldOpenCampaignIds(campaignMap: Record<string, string>): string[] {
  return [...new Set(Object.values(campaignMap).map((id) => String(id).trim()).filter(Boolean))];
}

/** One line for the Queue, the client, and the run log. */
export function pauseOutcomeLine(pause: Pick<ColdOpenSendingPause, "campaigns">, platform: string): string {
  const tool = TOOL_NAME[platform] ?? platform;
  const paused = pause.campaigns.filter((c) => c.result === "paused").length;
  const unsupported = pause.campaigns.filter((c) => c.result === "not_supported");
  const failed = pause.campaigns.filter((c) => c.result === "failed");
  const parts = [`Cold Open stopped pushing new leads.`];
  if (paused) parts.push(`Paused ${paused} ${paused === 1 ? "campaign" : "campaigns"} in ${tool}.`);
  if (unsupported.length) parts.push(`${tool} campaigns can't be paused from here: pause ${unsupported.map((c) => c.id).join(", ")} in ${tool} yourself.`);
  if (failed.length) parts.push(`${tool} refused to pause ${failed.map((c) => `${c.id} (${c.detail ?? "no reason given"})`).join(", ")}; pause ${failed.length === 1 ? "it" : "them"} in ${tool} yourself.`);
  return parts.join(" ");
}

/** Called when Reputation declares an incident. Null when Cold Open isn't
 * sending for this client, or is already paused. */
export async function proposeCrisisPause(engagementId: string, incidentId: string, summary: string): Promise<string | null> {
  const config = await getColdOpenConfig(engagementId);
  if (!config?.sendPlatform || config.sendingPause) return null;
  const campaignIds = coldOpenCampaignIds(config.campaignMap);
  if (campaignIds.length === 0) return null;
  if (!(await isSkillEnabledForEngagement(engagementId, "daily-send"))) return null;

  const tool = TOOL_NAME[config.sendPlatform.platform] ?? config.sendPlatform.platform;
  return queuePendingAction(
    engagementId,
    "cold_open_crisis_pause",
    { incidentId, campaignIds },
    `A reputation incident was declared: ${summary.slice(0, 300)} Approve to pause Cold Open while it's handled: no new leads pushed, and ${campaignIds.length} ${campaignIds.length === 1 ? "campaign" : "campaigns"} paused in ${tool}. It's proposed to restart when the incident is resolved.`
  );
}

export async function executeCrisisPause(engagementId: string, payload: { incidentId: string; campaignIds: string[] }): Promise<ColdOpenSendingPause> {
  const config = await getColdOpenConfig(engagementId);
  if (!config?.sendPlatform) throw new Error("Cold Open has no sending tool connected any more, so there is nothing to pause.");

  // Our own pushes stop first, whatever the sending tool says after.
  const pause: ColdOpenSendingPause = { incidentId: payload.incidentId, pausedAt: new Date().toISOString(), campaigns: [] };
  await upsertColdOpenConfig(engagementId, { sendingPause: pause });

  const adapter = createEspAdapter(engagementId, config.sendPlatform.platform, { baseUrl: config.sendPlatform.baseUrl });
  for (const id of payload.campaignIds) {
    try {
      pause.campaigns.push({ id, result: (await adapter.setCampaignPaused(id, true)) ? "paused" : "not_supported" });
    } catch (err) {
      pause.campaigns.push({ id, result: "failed", detail: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200) });
    }
  }
  await upsertColdOpenConfig(engagementId, { sendingPause: pause });

  if (pause.campaigns.some((c) => c.result === "failed")) throw new Error(pauseOutcomeLine(pause, config.sendPlatform.platform));
  return pause;
}

/** Called when an incident is resolved: proposes restarting what this app paused for it. */
export async function proposeCrisisResume(engagementId: string, incidentId: string): Promise<string | null> {
  const config = await getColdOpenConfig(engagementId);
  if (!config?.sendingPause || config.sendingPause.incidentId !== incidentId) return null;
  const paused = config.sendingPause.campaigns.filter((c) => c.result === "paused").map((c) => c.id);
  const tool = config.sendPlatform ? (TOOL_NAME[config.sendPlatform.platform] ?? config.sendPlatform.platform) : "the sending tool";
  return queuePendingAction(
    engagementId,
    "cold_open_crisis_resume",
    { incidentId, campaignIds: paused },
    `The reputation incident is resolved. Approve to restart Cold Open: new leads pushed again${paused.length ? `, and ${paused.length} ${paused.length === 1 ? "campaign" : "campaigns"} restarted in ${tool}` : ""}.`
  );
}

export async function executeCrisisResume(engagementId: string, payload: { incidentId: string; campaignIds: string[] }): Promise<void> {
  const config = await getColdOpenConfig(engagementId);
  if (!config?.sendingPause || config.sendingPause.incidentId !== payload.incidentId) return; // already restarted
  const failed: string[] = [];
  if (config.sendPlatform) {
    const adapter = createEspAdapter(engagementId, config.sendPlatform.platform, { baseUrl: config.sendPlatform.baseUrl });
    for (const id of payload.campaignIds) {
      try {
        await adapter.setCampaignPaused(id, false);
      } catch (err) {
        failed.push(`${id} (${err instanceof Error ? err.message.slice(0, 200) : String(err)})`);
      }
    }
  }
  await upsertColdOpenConfig(engagementId, { sendingPause: null });
  if (failed.length) throw new Error(`Cold Open is pushing leads again, but these campaigns didn't restart: ${failed.join(", ")}. Start them in the sending tool.`);
}
