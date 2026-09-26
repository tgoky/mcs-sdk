// src/features/cold-open/server/esp/base.ts
//
// The ESPAdapter interface + shared push machinery. Port of the Cold Open
// skill pack's esp/base.py, adapted to this app's own conventions in two
// deliberate ways:
//
//   - Credentials resolve through this app's own encrypted vault
//     (resolveCredential from @/lib/credentials), not an `env://VAR_NAME`
//     reference into a buyer-local .env file — there is no buyer-local
//     filesystem here.
//   - The idempotency registry and the review-gate check both need
//     engagementId-scoped DB/config access, so they live in the caller
//     (daily-send.ts), not in this adapter — same layering this app
//     already uses everywhere else (src/lib/platforms/*.ts are thin HTTP
//     clients; business logic and persistence live in each feature's
//     server module). What's shared here is exactly what the source
//     module's own header calls "identical across ESPs": the HTTP
//     plumbing, throttling, and the merge-field completeness check.

import { resolveCredential } from "@/lib/credentials";
import { providerErrorReason } from "@/lib/provider-error";
import type { ColdOpenSendPlatformId } from "@/models/schema";

export const MERGE_FIELDS = ["subject", "body1", "body2", "body3"] as const;

/**
 * Where each field Daily Send pushes has to appear in the client's
 * campaign, or the email tool sends its own written text instead and the
 * copy Cold Open wrote is silently unused: the subject line of email 1
 * uses {{subject}}, and emails 1, 2 and 3 use {{body1}}, {{body2}},
 * {{body3}}.
 */
export const PLACEHOLDER_GUIDE = [
  { field: "subject", where: "the subject line of email 1" },
  { field: "body1", where: "the body of email 1" },
  { field: "body2", where: "the body of email 2" },
  { field: "body3", where: "the body of email 3" },
] as const;

export interface CampaignStepCopy {
  /** Every variant's subject and body for this step (A/B variants). */
  subjects: string[];
  bodies: string[];
}

const hasToken = (texts: string[], field: string) => texts.some((t) => new RegExp(`\\{\\{\\s*${field}\\s*\\}\\}`, "i").test(t ?? ""));

/** Which placeholders a campaign's steps are missing, in plain words.
 * Empty when the campaign will send what Cold Open wrote. */
export function missingPlaceholders(steps: CampaignStepCopy[]): string[] {
  const gaps: string[] = [];
  if (steps.length < 3) gaps.push(`the campaign has ${steps.length} email step${steps.length === 1 ? "" : "s"}; Cold Open writes 3`);
  if (!hasToken(steps[0]?.subjects ?? [], "subject")) gaps.push("{{subject}} isn't in the subject line of email 1");
  (["body1", "body2", "body3"] as const).forEach((field, i) => {
    if (steps[i] && !hasToken(steps[i].bodies, field)) gaps.push(`{{${field}}} isn't in the body of email ${i + 1}`);
  });
  return gaps;
}

// Instantly's Cloudflare rejects fetch's default UA with error 1010 —
// same browser-shaped UA fix the source module ported from its own
// reference pusher.
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export class ESPError extends Error {}

/**
 * The only API base each adapter will call with the client's stored key.
 * A configured baseUrl may only restate one of these (same https origin),
 * never point the key somewhere else — sendPlatform.baseUrl is saved from
 * a request body, so an arbitrary value would send the credential (and,
 * through error messages, the response) wherever it pointed.
 */
export const ESP_API_BASES = {
  instantly: "https://api.instantly.ai/api/v2",
  smartlead: "https://server.smartlead.ai/api/v1",
  lemlist: "https://api.lemlist.com/api",
  reply_io: "https://api.reply.io/v1",
} as const satisfies Record<ColdOpenSendPlatformId, string>;

/** Null when `configured` is empty or on the platform's own API origin;
 * otherwise the reason it's refused. */
export function espBaseUrlProblem(platform: ColdOpenSendPlatformId, configured: string | undefined | null): string | null {
  if (!configured) return null;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    return "baseUrl isn't a valid URL.";
  }
  const allowed = new URL(ESP_API_BASES[platform]);
  if (url.protocol !== "https:" || url.host !== allowed.host || url.username || url.password) {
    return `baseUrl must be on ${allowed.origin} for ${platform}.`;
  }
  return null;
}

export function espApiBase(platform: ColdOpenSendPlatformId, configured: string | undefined): string {
  const problem = espBaseUrlProblem(platform, configured);
  if (problem) throw new ESPError(problem);
  return (configured || ESP_API_BASES[platform]).replace(/\/$/, "");
}

/** Kept under this name for the adapters; see provider-error.ts. */
export const upstreamErrorReason = providerErrorReason;

/** Honest shape for an ESP's raw JSON response: this app never assumes
 * the full documented shape of a third-party API is stable, only that a
 * parsed JSON body is an object or an array. Adapters narrow further at
 * the point they actually read a field — see extractArray/RawCampaign
 * below, same "type only what's read" convention src/lib/platforms/
 * booking.ts's own header documents for external API responses. */
export type JsonResponse = Record<string, unknown> | unknown[];

/** A campaign entry as any of the four ESPs' list-campaigns endpoints
 * might shape it — every field optional because that's the honest
 * contract with an external response, not because the shape is
 * genuinely unknown. */
export interface RawCampaign {
  id?: string | number;
  _id?: string;
  name?: string;
}

/** Pulls the array of items out of a JSON response that's either a bare
 * array or an object with the array under `key` (both conventions show
 * up across the four ESPs' list endpoints). */
export function extractArray(data: JsonResponse, key?: string): RawCampaign[] {
  if (Array.isArray(data)) return data as RawCampaign[];
  if (key && Array.isArray((data as Record<string, unknown>)[key])) return (data as Record<string, unknown>)[key] as RawCampaign[];
  return [];
}

export interface EspLead {
  email: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  title?: string;
  city?: string;
  state?: string;
  linkedinUrl?: string;
  icp?: string;
}

export interface EspMergeFields {
  subject?: string;
  body1?: string;
  body2?: string;
  body3?: string;
}

export interface EspCampaign {
  id: string;
  name: string;
}

export abstract class ESPAdapter {
  abstract espType: string;
  /** Stays under every Tier 1 ESP's rate limit. Reply.io overrides this much higher (see reply-io.ts). */
  protected requestIntervalMs = 750;
  private lastRequestTs = 0;

  constructor(
    protected engagementId: string,
    protected cfg: { baseUrl?: string }
  ) {}

  protected abstract credentialProvider(): string;
  protected async credential(): Promise<string> {
    return resolveCredential(this.engagementId, this.credentialProvider());
  }

  /** Live: campaigns from the buyer's own account. */
  abstract listCampaigns(): Promise<EspCampaign[]>;
  abstract buildPayload(lead: EspLead, campaignId: string, mergeFields: EspMergeFields): Promise<Record<string, unknown>>;
  /** Live POST of one built payload. Throws ESPError on failure. */
  protected abstract pushRequest(payload: Record<string, unknown>, campaignId: string, lead: EspLead): Promise<{ statusCode: number; detail: Record<string, unknown> }>;

  /** Live check that every mapped campaign id exists in the account. */
  async verifyCampaigns(campaignIds: string[]): Promise<string[]> {
    let known: Set<string>;
    try {
      known = new Set((await this.listCampaigns()).map((c) => String(c.id)));
    } catch (err) {
      return [`could not list campaigns: ${err instanceof Error ? err.message : String(err)}`];
    }
    return campaignIds.filter((id) => !known.has(String(id))).map((id) => `campaign id '${id}' not found in the ${this.espType} account`);
  }

  /**
   * Whether this campaign's emails use the placeholders the pushed copy
   * fills (see PLACEHOLDER_GUIDE). Null when this tool's campaign steps
   * can't be read here, so the check can't be made.
   */
  async checkCopyPlaceholders(campaignId: string): Promise<string[] | null> {
    void campaignId;
    return null;
  }

  /** The one push entry point (minus the review gate and idempotency
   * check — see this file's header for why those live in the caller).
   * Returns "dry_run" | "pushed". */
  async pushLead(lead: EspLead, campaignId: string, mergeFields: EspMergeFields, dryRun: boolean): Promise<{ status: "dry_run" | "pushed"; detail: Record<string, unknown> }> {
    const email = (lead.email ?? "").trim();
    if (!email) throw new ESPError("lead has no email");
    const missing = MERGE_FIELDS.filter((k) => !(mergeFields[k] ?? "").trim());
    if (missing.length > 0) throw new ESPError(`merge fields missing/empty: ${missing.join(", ")}`);

    const payload = await this.buildPayload(lead, campaignId, mergeFields);
    if (dryRun) return { status: "dry_run", detail: { payload } };

    await this.throttle();
    const { detail } = await this.pushRequest(payload, campaignId, lead);
    return { status: "pushed", detail };
  }

  protected async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestTs;
    if (elapsed < this.requestIntervalMs) {
      await new Promise((resolve) => setTimeout(resolve, this.requestIntervalMs - elapsed));
    }
    this.lastRequestTs = Date.now();
  }

  protected async request(method: string, url: string, headers: Record<string, string> = {}, body?: unknown, timeoutMs = 30000): Promise<{ status: number; data: JsonResponse }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": BROWSER_UA, ...headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const raw = await res.text();
      let data: JsonResponse = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { raw: raw.slice(0, 500) };
      }
      if (!res.ok) {
        throw new ESPError(`${this.espType} API ${res.status}${upstreamErrorReason(raw)}`);
      }
      return { status: res.status, data };
    } catch (err) {
      if (err instanceof ESPError) throw err;
      throw new ESPError(`${this.espType} unreachable: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
