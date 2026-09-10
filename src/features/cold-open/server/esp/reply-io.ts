// src/features/cold-open/server/esp/reply-io.ts
//
// Reply.io adapter (v1 API). Port of the Cold Open skill pack's
// esp/reply_io.py. Auth: X-Api-Key header. Push: POST
// /v1/actions/addandpushtocampaign — creates the contact if needed AND
// pushes it into the campaign in one call (Reply's long-standing
// convention). NOTE: Reply marks v1 as legacy (their newer API is
// OAuth-based); v1 remains documented at apidocs.reply.io and is the
// key-based path a buyer can wire without an OAuth app.

import { ESPAdapter, extractArray, type EspLead, type EspMergeFields, type EspCampaign } from "./base";
import { coldOpenCredentialProvider } from "../source-connect";

const DEFAULT_BASE = "https://api.reply.io/v1";

export class ReplyIoAdapter extends ESPAdapter {
  espType = "reply_io";
  // Reply v1 throttles hard (~10 req/min).
  protected requestIntervalMs = 6500;

  protected credentialProvider(): string {
    return coldOpenCredentialProvider("reply_io");
  }

  private baseUrl(): string {
    return (this.cfg.baseUrl || DEFAULT_BASE).replace(/\/$/, "");
  }

  private async headers(): Promise<Record<string, string>> {
    return { "X-Api-Key": await this.credential() };
  }

  async listCampaigns(): Promise<EspCampaign[]> {
    const { data } = await this.request("GET", `${this.baseUrl()}/campaigns`, await this.headers());
    return extractArray(data).map((c) => ({ id: String(c.id ?? ""), name: c.name ?? "" }));
  }

  async buildPayload(lead: EspLead, campaignId: string, mergeFields: EspMergeFields): Promise<Record<string, unknown>> {
    const custom: Record<string, string> = {};
    for (const [k, v] of Object.entries(mergeFields)) if ((v ?? "").trim()) custom[k] = v!.trim();
    return {
      campaignId,
      email: lead.email.trim(),
      firstName: (lead.firstName ?? "").trim(),
      lastName: (lead.lastName ?? "").trim(),
      company: (lead.companyName ?? "").trim(),
      title: (lead.title ?? "").trim(),
      customFields: Object.entries(custom).map(([key, value]) => ({ key, value })),
    };
  }

  protected async pushRequest(payload: Record<string, unknown>): Promise<{ statusCode: number; detail: Record<string, unknown> }> {
    const { status } = await this.request("POST", `${this.baseUrl()}/actions/addandpushtocampaign`, await this.headers(), payload);
    return { statusCode: status, detail: {} };
  }
}
