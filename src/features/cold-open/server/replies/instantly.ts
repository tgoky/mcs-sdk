// src/features/cold-open/server/replies/instantly.ts
//
// Reply feed from the Instantly v2 unibox. Port of the Cold Open skill
// pack's replies/instantly.py. GET {base}/emails (Bearer auth, same key
// as the push adapter), filtered server-side via email_type=received and
// again client-side as a backstop across the field names Instantly has
// used for the reply-type flag across doc revisions.

import { ReplyFetcher, stripHtml, type ColdOpenReply } from "./base";
import { coldOpenCredentialProvider } from "../source-connect";

const DEFAULT_BASE = "https://api.instantly.ai/api/v2";

export class InstantlyReplyFetcher extends ReplyFetcher {
  sourceType = "instantly";

  constructor(engagementId: string, cfg: { baseUrl?: string } = {}) {
    super(engagementId, coldOpenCredentialProvider("instantly"), cfg);
  }

  private baseUrl(): string {
    return (this.cfg.baseUrl || DEFAULT_BASE).replace(/\/$/, "");
  }

  protected async fetchRaw(limit: number): Promise<Record<string, unknown>[]> {
    const key = await this.credential();
    const q = new URLSearchParams({ limit: String(Math.min(limit, 100)), email_type: "received" });
    const { data } = await this.request("GET", `${this.baseUrl()}/emails?${q}`, { Authorization: `Bearer ${key}` });
    if (Array.isArray(data)) return data as Record<string, unknown>[];
    return ((data.items ?? data.data ?? []) as Record<string, unknown>[]) ?? [];
  }

  private static isInboundReply(rec: Record<string, unknown>): boolean {
    if (rec.ue_type === 2) return true;
    if (String(rec.email_type ?? "").toLowerCase() === "received") return true;
    return Boolean(rec.is_reply) || rec.i_status === "received";
  }

  protected mapRecord(rec: Record<string, unknown>): ColdOpenReply | null {
    if (!InstantlyReplyFetcher.isInboundReply(rec)) return null;
    const body = (rec.body ?? {}) as Record<string, unknown>;
    let text = typeof body === "object" ? (body.text as string | undefined) : String(body);
    if (!text && typeof body === "object") text = stripHtml((body.html as string) ?? "");
    return {
      replyId: String(rec.id ?? ""),
      leadEmail: String(rec.from_address_email ?? rec.from_email ?? rec.lead ?? "").toLowerCase(),
      subject: String(rec.subject ?? ""),
      bodyText: (text ?? "").trim(),
      campaignId: String(rec.campaign_id ?? rec.campaign ?? ""),
      receivedAt: String(rec.timestamp_email ?? rec.timestamp_created ?? ""),
    };
  }
}
