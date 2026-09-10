// src/features/cold-open/server/esp/smartlead.ts
//
// SmartLead adapter. Port of the Cold Open skill pack's esp/smartlead.py.
// Auth: api_key QUERY PARAM (their convention). Push: POST
// /campaigns/{id}/leads with {"lead_list": [...]}, max 400/request (this
// adapter sends 1). Docs: api.smartlead.ai/api-reference/leads/add-to-campaign

import { ESPAdapter, ESPError, extractArray, type EspLead, type EspMergeFields, type EspCampaign } from "./base";
import { coldOpenCredentialProvider } from "../source-connect";

const DEFAULT_BASE = "https://server.smartlead.ai/api/v1";

export class SmartleadAdapter extends ESPAdapter {
  espType = "smartlead";
  protected credentialProvider(): string {
    return coldOpenCredentialProvider("smartlead");
  }

  private baseUrl(): string {
    return (this.cfg.baseUrl || DEFAULT_BASE).replace(/\/$/, "");
  }

  async listCampaigns(): Promise<EspCampaign[]> {
    const key = await this.credential();
    const { data } = await this.request("GET", `${this.baseUrl()}/campaigns?api_key=${encodeURIComponent(key)}`);
    return extractArray(data, "data").map((c) => ({ id: String(c.id ?? ""), name: c.name ?? "" }));
  }

  async buildPayload(lead: EspLead, _campaignId: string, mergeFields: EspMergeFields): Promise<Record<string, unknown>> {
    const custom: Record<string, string> = {};
    for (const [k, v] of Object.entries(mergeFields)) if ((v ?? "").trim()) custom[k] = v!.trim();
    for (const k of ["title", "city", "state", "linkedinUrl", "icp"] as const) {
      const v = lead[k as keyof EspLead];
      if (typeof v === "string" && v.trim()) custom[k] = v.trim();
    }
    return {
      lead_list: [
        {
          email: lead.email.trim(),
          first_name: (lead.firstName ?? "").trim(),
          last_name: (lead.lastName ?? "").trim(),
          company_name: (lead.companyName ?? "").trim(),
          custom_fields: custom,
        },
      ],
    };
  }

  protected async pushRequest(payload: Record<string, unknown>, campaignId: string): Promise<{ statusCode: number; detail: Record<string, unknown> }> {
    const key = await this.credential();
    const { status, data } = await this.request("POST", `${this.baseUrl()}/campaigns/${campaignId}/leads?api_key=${encodeURIComponent(key)}`, {}, payload);
    const obj = Array.isArray(data) ? {} : data;
    if (obj.success === false) {
      throw new ESPError(`smartlead rejected the lead: ${JSON.stringify(obj)}`);
    }
    return { statusCode: status, detail: { added: obj.added_count } };
  }
}
