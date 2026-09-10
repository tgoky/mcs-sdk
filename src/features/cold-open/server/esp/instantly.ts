// src/features/cold-open/server/esp/instantly.ts
//
// Instantly v2 adapter. Port of the Cold Open skill pack's esp/instantly.py.
// Auth: Bearer key. Push: POST /leads with campaign + custom_variables.

import { ESPAdapter, extractArray, type EspLead, type EspMergeFields, type EspCampaign } from "./base";
import { coldOpenCredentialProvider } from "../source-connect";

const DEFAULT_BASE = "https://api.instantly.ai/api/v2";

export class InstantlyAdapter extends ESPAdapter {
  espType = "instantly";
  protected credentialProvider(): string {
    return coldOpenCredentialProvider("instantly");
  }

  private baseUrl(): string {
    return (this.cfg.baseUrl || DEFAULT_BASE).replace(/\/$/, "");
  }

  private async headers(): Promise<Record<string, string>> {
    return { Authorization: `Bearer ${await this.credential()}` };
  }

  async listCampaigns(): Promise<EspCampaign[]> {
    const { data } = await this.request("GET", `${this.baseUrl()}/campaigns?limit=100`, await this.headers());
    return extractArray(data, "items").map((c) => ({ id: String(c.id ?? ""), name: c.name ?? "" }));
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
}
