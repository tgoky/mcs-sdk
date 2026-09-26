// src/features/cold-open/server/esp/instantly.ts
//
// Instantly v2 adapter. Port of the Cold Open skill pack's esp/instantly.py.
// Auth: Bearer key. Push: POST /leads with campaign + custom_variables.

import { ESPAdapter, extractArray, missingPlaceholders, type EspLead, type EspMergeFields, type EspCampaign, espApiBase } from "./base";
import { coldOpenCredentialProvider } from "../source-connect";


export class InstantlyAdapter extends ESPAdapter {
  espType = "instantly";
  protected credentialProvider(): string {
    return coldOpenCredentialProvider("instantly");
  }

  private baseUrl(): string {
    return espApiBase("instantly", this.cfg.baseUrl);
  }

  private async headers(): Promise<Record<string, string>> {
    return { Authorization: `Bearer ${await this.credential()}` };
  }

  async listCampaigns(): Promise<EspCampaign[]> {
    const { data } = await this.request("GET", `${this.baseUrl()}/campaigns?limit=100`, await this.headers());
    return extractArray(data, "items").map((c) => ({ id: String(c.id ?? ""), name: c.name ?? "" }));
  }

  /** Instantly's campaign carries its copy at sequences[0].steps[].variants[]
   * ({ subject, body }), per Instantly's own API SDK; only the first
   * sequence is used. */
  async checkCopyPlaceholders(campaignId: string): Promise<string[] | null> {
    const { data } = await this.request("GET", `${this.baseUrl()}/campaigns/${encodeURIComponent(campaignId)}`, await this.headers());
    const campaign = (Array.isArray(data) ? null : data) as { sequences?: { steps?: { variants?: { subject?: string; body?: string; v_disabled?: boolean }[] }[] }[] } | null;
    const steps = campaign?.sequences?.[0]?.steps;
    if (!Array.isArray(steps)) return null;
    return missingPlaceholders(
      steps.map((step) => {
        const live = (step.variants ?? []).filter((v) => !v.v_disabled);
        return { subjects: live.map((v) => v.subject ?? ""), bodies: live.map((v) => v.body ?? "") };
      })
    );
  }

  async buildPayload(lead: EspLead, campaignId: string, mergeFields: EspMergeFields): Promise<Record<string, unknown>> {
    const custom: Record<string, string> = {};
    for (const [k, v] of Object.entries(mergeFields)) if ((v ?? "").trim()) custom[k] = v!.trim();
    for (const k of ["companyName", "title", "city", "state", "linkedinUrl", "icp"] as const) {
      const v = lead[k as keyof EspLead];
      if (typeof v === "string" && v.trim()) custom[k] = v.trim();
    }
    return {
      campaign: campaignId,
      email: lead.email.trim(),
      first_name: (lead.firstName ?? "").trim(),
      last_name: (lead.lastName ?? "").trim(),
      custom_variables: custom,
    };
  }

  protected async pushRequest(payload: Record<string, unknown>): Promise<{ statusCode: number; detail: Record<string, unknown> }> {
    const { status, data } = await this.request("POST", `${this.baseUrl()}/leads`, await this.headers(), payload);
    return { statusCode: status, detail: { id: Array.isArray(data) ? undefined : data.id } };
  }

  // POST /api/v2/campaigns/{id}/pause and /activate, no body (Instantly's
  // own SDK, CampaignApi.pauseCampaign / activateCampaign).
  async setCampaignPaused(campaignId: string, paused: boolean): Promise<boolean> {
    await this.throttle();
    await this.request("POST", `${this.baseUrl()}/campaigns/${encodeURIComponent(campaignId)}/${paused ? "pause" : "activate"}`, await this.headers());
    return true;
  }
}
