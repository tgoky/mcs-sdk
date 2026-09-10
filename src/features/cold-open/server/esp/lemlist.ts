// src/features/cold-open/server/esp/lemlist.ts
//
// Lemlist adapter. Port of the Cold Open skill pack's esp/lemlist.py.
// Auth: HTTP Basic with EMPTY username and the API key as password (their
// convention). Push: POST /api/campaigns/{campaignId}/leads/{email} with
// the lead fields as the body; merge variables ride as top-level custom
// keys. Docs: developer.lemlist.com/api-reference/endpoints/leads/create-lead-in-campaign
//
// Lemlist carries the email in the URL, not the body — base.ts's
// pushRequest signature already threads `lead` through for exactly this
// case, so no instance-state stash is needed the way the source module's
// _pending_email workaround required.

import { ESPAdapter, extractArray, type EspLead, type EspMergeFields, type EspCampaign } from "./base";
import { coldOpenCredentialProvider } from "../source-connect";

const DEFAULT_BASE = "https://api.lemlist.com/api";

export class LemlistAdapter extends ESPAdapter {
  espType = "lemlist";
  protected credentialProvider(): string {
    return coldOpenCredentialProvider("lemlist");
  }

  private baseUrl(): string {
    return (this.cfg.baseUrl || DEFAULT_BASE).replace(/\/$/, "");
  }

  private async headers(): Promise<Record<string, string>> {
    const key = await this.credential();
    const token = Buffer.from(`:${key}`).toString("base64");
    return { Authorization: `Basic ${token}` };
  }

  async listCampaigns(): Promise<EspCampaign[]> {
    const { data } = await this.request("GET", `${this.baseUrl()}/campaigns`, await this.headers());
    return extractArray(data).map((c) => ({ id: c._id ?? "", name: c.name ?? "" }));
  }

  async buildPayload(lead: EspLead, _campaignId: string, mergeFields: EspMergeFields): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = {
      firstName: (lead.firstName ?? "").trim(),
      lastName: (lead.lastName ?? "").trim(),
      companyName: (lead.companyName ?? "").trim(),
    };
    for (const [k, v] of Object.entries(mergeFields)) if ((v ?? "").trim()) payload[k] = v!.trim();
    return payload;
  }

  protected async pushRequest(payload: Record<string, unknown>, campaignId: string, lead: EspLead): Promise<{ statusCode: number; detail: Record<string, unknown> }> {
    const email = encodeURIComponent((lead.email ?? "").trim());
    const { status, data } = await this.request("POST", `${this.baseUrl()}/campaigns/${campaignId}/leads/${email}`, await this.headers(), payload);
    return { statusCode: status, detail: { id: Array.isArray(data) ? undefined : data._id } };
  }
}
