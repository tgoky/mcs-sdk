// src/lib/whop-agent/client.ts
//
// The multi-tenant Whop API adapter — deliberately separate from
// src/lib/whop.ts (this app's own single-tenant OAuth login) and
// src/lib/whop-webhooks.ts (this app's own single-secret inbound webhook
// verifier). Both of those exist to authenticate *this app's own* Whop
// product; this file exists to call *an operator's own Whop business* on
// their behalf, one connection per engagement; see whopAgentConnections in
// schema.ts.
//
// Implements Section 6 (rate limits, circuit breaker, version pinning,
// idempotency, error taxonomy, scoping-parameter unpredictability) and
// Section 8.1 (the account-scoping guardrail — the highest-severity item
// in the spec).
import { db } from "@/lib/db";
import { whopAgentConnections } from "@/models/schema";
import { eq } from "drizzle-orm";
import { resolveCredential } from "@/lib/credentials";
import {
  WhopApiError,
  WhopScopePermissionError,
  WhopUnnamedAuthorizationError,
  WhopCredentialError,
  WhopTransientError,
  WhopValidationError,
  ScopeRequiredError,
  ScopeViolationError,
} from "./errors";
import { WHOP_SCOPE_MAP, type WhopEndpoint } from "./scope-map";

export const WHOP_API_BASE = "https://api.whop.com";

/**
 * Section 6.1's open-loop token bucket. Process-local, not a shared/
 * distributed counter — an acknowledged limitation, not a silently assumed
 * correctness property: on more than one live server process this gives
 * each process its own 600/min allowance rather than one true shared
 * budget across the credential. Whop itself gives us nothing to reconcile
 * against (no X-RateLimit-* headers at all — Section 6.1), so "open-loop"
 * was already the ceiling on how tight this can be; moving the bucket into
 * Postgres or Redis is the natural next step once real multi-instance
 * traffic against one credential makes the gap matter, not before.
 */
const buckets = new Map<string, { tokens: number; lastRefillMs: number }>();
const BUCKET_CAPACITY = 600;
const REFILL_PER_MS = BUCKET_CAPACITY / 60_000;

function takeToken(bucketKey: string): boolean {
  const now = Date.now();
  let bucket = buckets.get(bucketKey);
  if (!bucket) {
    bucket = { tokens: BUCKET_CAPACITY, lastRefillMs: now };
    buckets.set(bucketKey, bucket);
  }
  bucket.tokens = Math.min(BUCKET_CAPACITY, bucket.tokens + (now - bucket.lastRefillMs) * REFILL_PER_MS);
  bucket.lastRefillMs = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

export interface WhopRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Required on every write (Section 6.4) — tie it to the run+step id so a
   * retried batch can't duplicate. */
  idempotencyKey?: string;
  /** Overrides the connection's own validated pin for this one call. Used
   * only by the pin-advancement read-back suite (Section 2.6) — every
   * ordinary call should rely on the connection's stored pin instead. */
  apiVersionDateOverride?: string;
}

function readByPath(obj: unknown, path: string): string | undefined {
  const val = path.split(".").reduce<unknown>((acc, key) => (acc != null && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), obj);
  return typeof val === "string" ? val : undefined;
}

function extractRecords(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object" && Array.isArray((json as Record<string, unknown>).data)) {
    return (json as Record<string, unknown>).data as unknown[];
  }
  return [];
}

type ConnectionRow = typeof whopAgentConnections.$inferSelect;

/**
 * One instance per engagement, built fresh on every call site rather than
 * cached across requests — a mid-run credential rotation or a breaker that
 * just tripped is picked up on the very next construction, never masked by
 * a stale instance held from earlier in the same process.
 */
export class WhopAgentClient {
  private constructor(
    private readonly engagementId: string,
    private readonly apiKey: string,
    private readonly connection: ConnectionRow
  ) {}

  static async forEngagement(engagementId: string): Promise<WhopAgentClient> {
    const [connection] = await db
      .select()
      .from(whopAgentConnections)
      .where(eq(whopAgentConnections.engagementId, engagementId))
      .limit(1);
    if (!connection) {
      throw new Error(`No Whop connection on file for engagement ${engagementId}. Run the connect flow first.`);
    }
    if (connection.circuitBreakerState === "open") {
      throw new WhopCredentialError(0, { reason: connection.circuitBreakerReason ?? "circuit breaker open (reconnect required)" });
    }
    const apiKey = await resolveCredential(engagementId, "whop_bot_api_key");
    return new WhopAgentClient(engagementId, apiKey, connection);
  }

  get accountId(): string | null {
    return this.connection.whopAccountId;
  }

  get pinnedVersionDate(): string | null {
    return this.connection.pinnedVersionDate;
  }

  /** Section 8.1, implementation step 2 — a list call missing its required
   * scope parameter throws here and is never dispatched. */
  private assertScoped(endpoint: WhopEndpoint, query: WhopRequestOptions["query"]): void {
    const scope = WHOP_SCOPE_MAP[endpoint];
    if (scope.param === "none") return;
    const value = query?.[scope.param];
    if (value === undefined || value === null || value === "") {
      throw new ScopeRequiredError(endpoint, scope.param);
    }
  }

  /** Section 8.1, implementation step 3 — every record in a list response
   * is checked against the connected account, catching the case where a
   * scope parameter was supplied but Whop ignored it anyway. Never caught
   * by a fail-open table (Section 8.7's stated exception): a violation
   * hard-fails the caller. */
  private assertUnchanged(endpoint: WhopEndpoint, records: unknown[]): void {
    const scope = WHOP_SCOPE_MAP[endpoint];
    const paths = scope.responseIdPaths;
    if (!paths?.length || !this.connection.whopAccountId) return;
    for (const record of records) {
      let found: string | undefined;
      for (const path of paths) {
        found = readByPath(record, path);
        if (found) break;
      }
      if (found && found !== this.connection.whopAccountId) {
        throw new ScopeViolationError(endpoint, found, this.connection.whopAccountId);
      }
    }
  }

  /** Section 6.2 — a credential error trips the breaker immediately, not
   * after a run of consecutive failures: there is no lower-severity
   * "credential is invalid/expired/revoked" outcome to count up to, and
   * WhopCredentialError's own contract ("never retried against the same
   * credential") only holds if the very first occurrence trips it. Resets
   * only via connect-service's reconnect flow, never on a timer. */
  private async tripBreaker(reason: string): Promise<void> {
    await db
      .update(whopAgentConnections)
      .set({ circuitBreakerState: "open", circuitBreakerTrippedAt: new Date(), circuitBreakerReason: reason })
      .where(eq(whopAgentConnections.engagementId, this.engagementId));
  }

  /**
   * The one call-site every typed helper method funnels through. `endpoint`
   * is the WhopEndpoint key (drives the scope guardrail, not just logging),
   * `path`/`opts` are the literal REST call.
   */
  async request<T = unknown>(endpoint: WhopEndpoint, path: string, opts: WhopRequestOptions = {}): Promise<T> {
    this.assertScoped(endpoint, opts.query);

    if (!takeToken(`${this.engagementId}:${endpoint}`)) {
      // Section 5.5/5.8: on a local-budget exhaustion there's no live
      // `Try again in N seconds` from Whop to honor yet — 1s is a
      // deliberately short, cheap default since the real ceiling here is
      // this process's own clock, not anything Whop reported.
      throw new WhopTransientError(429, { reason: "local rate-limit bucket exhausted" }, 1);
    }

    const url = new URL(`${WHOP_API_BASE}${path}`);
    for (const [key, value] of Object.entries(opts.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const versionDate = opts.apiVersionDateOverride ?? this.connection.pinnedVersionDate ?? undefined;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
    if (versionDate) headers["Api-Version-Date"] = versionDate;
    if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

    const res = await fetch(url.toString(), {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

    const requestId = res.headers.get("x-request-id") ?? undefined; // Section 6.1 — the only correlation handle Whop provides

    if (!res.ok) {
      const bodyText = await res.text();
      let body: unknown = bodyText;
      try {
        body = JSON.parse(bodyText);
      } catch {
        // Non-JSON error body — keep the raw text, don't throw a second
        // error trying to parse it.
      }
      const bodyMessage = body && typeof body === "object" ? (body as Record<string, unknown>).message : undefined;
      const message: string = typeof bodyMessage === "string" ? bodyMessage : typeof body === "string" ? body : JSON.stringify(body);

      // Checked BEFORE any generic status-code branch — Section 6.5 names
      // this exact ordering mistake ("a taxonomy that routes on status code
      // alone will classify these as validation errors") as the single
      // most likely error-handling bug in the build.
      const scopeMatch = message.match(/Unauthorized: Actor is missing all required permissions:\s*(.+)/i);
      if (scopeMatch) {
        throw new WhopScopePermissionError(scopeMatch[1].trim(), res.status, { requestId, body });
      }

      if (res.status === 429 || res.status >= 500) {
        const retryMatch = message.match(/Try again in (\d+) seconds?/i);
        throw new WhopTransientError(res.status, { requestId, body }, retryMatch ? Number(retryMatch[1]) : undefined);
      }

      if (/you are not authorized/i.test(message)) {
        throw new WhopUnnamedAuthorizationError(res.status, { requestId, body });
      }

      if (res.status === 401 || res.status === 403) {
        const credError = new WhopCredentialError(res.status, { requestId, body });
        await this.tripBreaker(credError.message);
        throw credError;
      }

      if (res.status === 400 || res.status === 422) {
        throw new WhopValidationError(res.status, { requestId, body });
      }

      throw new WhopApiError(message, res.status, { requestId, body });
    }

    const json = await res.json();
    if ((opts.method ?? "GET") === "GET") {
      this.assertUnchanged(endpoint, extractRecords(json));
    }
    return json as T;
  }

  /**
   * Section 5.4's stats engine interface — `resource` is `<node>:<metric>`,
   * not an account identifier (passing one returns `Unknown metric
   * 'biz_...'`); the account is scoped separately by company_id, which
   * this method always supplies from the connection's own accountId so no
   * caller can accidentally omit it.
   */
  async statsMetric(resource: string, opts: { granularity?: "daily" | "weekly" | "monthly"; from?: string; to?: string; breakdowns?: string } = {}): Promise<WhopStatsMetricResponse> {
    if (!this.connection.whopAccountId) {
      throw new Error("This connection has no Whop account id on file. Reconnect before querying stats.");
    }
    return this.request<WhopStatsMetricResponse>("stats.metric", "/api/v1/stats/metric", {
      query: {
        resource,
        company_id: this.connection.whopAccountId,
        granularity: opts.granularity,
        from: opts.from,
        to: opts.to,
        breakdowns: opts.breakdowns,
      },
    });
  }
}

export interface WhopStatsMetricResponse {
  columns: string[];
  data: Array<[string, ...(number | string)[]]>;
  debug?: { engine?: string; request_id?: string; sql?: string };
  node?: string;
  pagination?: { next_cursor?: string };
}
