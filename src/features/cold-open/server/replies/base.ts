// src/features/cold-open/server/replies/base.ts
//
// The reply-feed interface (Reply Sort's read side). Port of the Cold
// Open skill pack's replies/base.py. Mirrors the ESPAdapter pattern: one
// contract, per-ESP subclasses, so the Reply Sort runner polls blind to
// which ESP is behind the config.
//
// V1 scope: only the Instantly reply feed is ported (replies/instantly.ts)
// — its endpoint and reply-type detection are doc-verified in the source
// module. SmartLead, Lemlist, and Reply.io reply feeds are real,
// separately-scoped follow-up work, same "ask, flagged unbuilt"
// convention this app already applies elsewhere in Cold Open (see
// source-connect.ts's Apify/Sales-Nav handling).

import { resolveCredential } from "@/lib/credentials";

const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export class ReplyFetchError extends Error {}

export interface ColdOpenReply {
  replyId: string;
  leadEmail: string;
  subject: string;
  bodyText: string;
  campaignId: string;
  receivedAt: string;
}

export function stripHtml(text: string): string {
  if (!text || !text.includes("<")) return text ?? "";
  return text.replace(/<[^>]+>/g, " ");
}

export abstract class ReplyFetcher {
  abstract sourceType: string;

  constructor(
    protected engagementId: string,
    protected credentialProviderKey: string,
    protected cfg: { baseUrl?: string } = {}
  ) {}

  protected async credential(): Promise<string> {
    return resolveCredential(this.engagementId, this.credentialProviderKey);
  }

  /** Pull the most recent replies (newest first where the API allows).
   * Cursor/seen-id dedupe happens in the caller, not here. */
  async fetchReplies(limit = 100): Promise<ColdOpenReply[]> {
    const raw = await this.fetchRaw(limit);
    const out: ColdOpenReply[] = [];
    for (const rec of raw) {
      const mapped = this.mapRecord(rec);
      if (mapped && mapped.replyId) out.push(mapped);
    }
    return out;
  }

  protected abstract fetchRaw(limit: number): Promise<Record<string, unknown>[]>;
  protected abstract mapRecord(rec: Record<string, unknown>): ColdOpenReply | null;

  protected async request(method: string, url: string, headers: Record<string, string> = {}, timeoutMs = 30000): Promise<{ status: number; data: Record<string, unknown> | unknown[] }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": BROWSER_UA, ...headers }, signal: controller.signal });
      const raw = await res.text();
      let data: Record<string, unknown> | unknown[] = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { raw: raw.slice(0, 500) };
      }
      if (!res.ok) throw new ReplyFetchError(`${this.sourceType} API ${res.status}: ${raw.slice(0, 300)}`);
      return { status: res.status, data };
    } catch (err) {
      if (err instanceof ReplyFetchError) throw err;
      throw new ReplyFetchError(`${this.sourceType} unreachable: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
