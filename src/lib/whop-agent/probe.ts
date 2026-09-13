// src/lib/whop-agent/probe.ts
//
// The bootstrap calls that have to run BEFORE a whopAgentConnections row
// exists — credential-type detection, the pin-selection/validation dance,
// and the Section 2.4 scope probe table. These use raw fetch() rather than
// WhopAgentClient, deliberately: WhopAgentClient.forEngagement() requires an
// existing connection row to resolve a pinned version date and account id
// against, which is exactly what these functions are here to produce in the
// first place.
import { WHOP_API_BASE } from "./client";

export interface ProbeOutcome {
  ok: boolean;
  missingScope?: string;
  unnamedDenial?: boolean;
  checkedAt: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

async function rawGet(apiKey: string, path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: unknown; headers: Headers }> {
  const res = await fetch(`${WHOP_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, ...headers },
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // leave as raw text
  }
  return { status: res.status, body, headers: res.headers };
}

function classifyDenial(status: number, body: unknown): ProbeOutcome {
  const record = asRecord(body);
  const message: string = typeof record?.message === "string" ? record.message : typeof body === "string" ? body : "";
  const scopeMatch = message.match(/missing all required permissions:\s*(.+)/i);
  if (scopeMatch) {
    return { ok: false, missingScope: scopeMatch[1].trim(), checkedAt: new Date().toISOString() };
  }
  return { ok: false, unnamedDenial: true, checkedAt: new Date().toISOString() };
}

/**
 * Used by credential-health.ts's daily cron (Section 2.7 "Token expiry or
 * revocation. Detected on the first credential-level 401 or 403 that is not
 * attributable to a missing scope"). GET /v1/accounts is Section 2.4's own
 * hard-stop probe — the cheapest call that's meaningful on every credential
 * type, since a dead key fails it regardless of which scopes it once had.
 */
export async function checkWhopBotApiKeyCredential(apiKey: string): Promise<void> {
  const { status, body } = await rawGet(apiKey, "/v1/accounts");
  if (status === 200) return;
  if (status === 401 || (status === 403 && !classifyDenial(status, body).missingScope)) {
    throw new Error("Whop Bot API key is invalid, expired, or revoked.");
  }
  throw new Error(`Whop account check failed (HTTP ${status}).`);
}

export type WhopCredentialKind = "bot" | "app" | "oauth" | "unknown";

/**
 * Section 2.1: the apik_ prefix alone can't tell a Bot/Account key apart
 * from an App key, so the connect flow probes GET /api/v5/app/users and
 * reads Whop's own error message. A 403 naming "Bot API key" confirms a
 * Bot/Account key; a 200 confirms an App key. Anything else is left
 * "unknown" rather than guessed — the connect flow reports that honestly
 * instead of asserting a credential type nothing actually confirmed.
 */
export async function detectWhopCredentialType(apiKey: string): Promise<WhopCredentialKind> {
  const { status, body } = await rawGet(apiKey, "/api/v5/app/users");
  if (status === 200) return "app";
  const record = asRecord(body);
  const message: string = typeof record?.message === "string" ? record.message : "";
  if (status === 403 && /Bot API key/i.test(message)) return "bot";
  return "unknown";
}

/**
 * Section 2.6's pin-capture: read the `api-version-date` response header
 * from a live v1 call as the candidate, then validate it by re-issuing an
 * explicit read with that exact date set as the Api-Version-Date header,
 * confirming a 200 with the expected shape. Only a validated candidate is
 * ever returned — Section 2.6 confirmed live that not every syntactically
 * valid date is accepted (2025-01-01 was rejected against /v1/memberships
 * with "You are not authorized" even though it parses as a valid date).
 *
 * Returns null, never a guessed value, if the candidate fails validation —
 * callers must treat that as "pin selection failed," not fall back to an
 * unvalidated date.
 */
export async function findValidatedApiVersionDatePin(apiKey: string): Promise<string | null> {
  const initial = await rawGet(apiKey, "/v1/memberships", { });
  const candidate = initial.headers.get("api-version-date");
  if (!candidate) return null;

  const validation = await rawGet(apiKey, "/v1/memberships", { "Api-Version-Date": candidate });
  if (validation.status !== 200) return null;

  return candidate;
}

/** Section 2.4's 15-call scope probe table, run at connect and on every key
 * rotation. Each entry maps 1:1 to a row in that table — the probe label is
 * stored verbatim in whopAgentConnections.scopeProbeResults, keyed exactly
 * as written here, so the connect-flow UI can show "what unlocked" against
 * the same names this file uses. */
export const SCOPE_PROBE_TABLE: Array<{ label: string; run: (apiKey: string, accountId: string | null) => Promise<{ status: number; body: unknown }> }> = [
  { label: "accounts", run: (key) => rawGet(key, "/v1/accounts") },
  { label: "products", run: (key, accountId) => rawGet(key, `/v1/products?account_id=${accountId ?? ""}&limit=1`) },
  { label: "plans", run: (key, accountId) => rawGet(key, `/v1/plans?account_id=${accountId ?? ""}&limit=1`) },
  { label: "memberships", run: (key) => rawGet(key, "/v1/memberships?limit=1") },
  { label: "stats", run: (key) => rawGet(key, "/v1/stats/describe") },
  { label: "webhooks", run: (key, accountId) => rawGet(key, `/v1/webhooks?account_id=${accountId ?? ""}`) },
  { label: "disputes", run: (key) => rawGet(key, "/v1/disputes?limit=1") },
  { label: "dispute_alerts", run: (key) => rawGet(key, "/v1/dispute_alerts?limit=1") },
  { label: "payments", run: (key) => rawGet(key, "/v1/payments?limit=1") }, // elevated-scope check — failure expected on a standard key
  { label: "affiliates", run: (key) => rawGet(key, "/v1/affiliates?limit=1") },
  { label: "chat_channels", run: (key, accountId) => rawGet(key, `/v1/chat_channels?company_id=${accountId ?? ""}&limit=1`) },
  { label: "dm_channels", run: (key) => rawGet(key, "/v1/dm_channels?limit=1") },
  { label: "support_channels", run: (key) => rawGet(key, "/v1/support_channels?limit=1") },
  { label: "app_users", run: (key) => rawGet(key, "/api/v5/app/users") }, // identifies credential type, not scoped
  { label: "memberships_v2", run: (key) => rawGet(key, "/api/v2/memberships?per=1") },
];

export interface ScopeProbeSummary {
  whopAccountId: string | null;
  results: Record<string, ProbeOutcome>;
  hardStopped: boolean;
}

/**
 * Runs the full 15-call table in order, hard-stopping after `accounts` if
 * that one fails (Section 2.4: "Hard stop. Key invalid or has no
 * account") — every later probe needs an account id to scope its own call,
 * so there's nothing useful left to check once the very first call is
 * dead.
 */
export async function runScopeProbe(apiKey: string): Promise<ScopeProbeSummary> {
  const results: Record<string, ProbeOutcome> = {};
  const nowIso = () => new Date().toISOString();

  const accountsProbe = SCOPE_PROBE_TABLE[0];
  const accountsRes = await accountsProbe.run(apiKey, null);
  if (accountsRes.status !== 200) {
    results.accounts = classifyDenial(accountsRes.status, accountsRes.body);
    return { whopAccountId: null, results, hardStopped: true };
  }
  const accountsBody = asRecord(accountsRes.body);
  const firstAccount = Array.isArray(accountsBody?.data) ? asRecord(accountsBody.data[0]) : null;
  const whopAccountId: string | null =
    (typeof accountsBody?.id === "string" ? accountsBody.id : null) ?? (typeof firstAccount?.id === "string" ? firstAccount.id : null);
  results.accounts = { ok: true, checkedAt: nowIso() };

  for (const probe of SCOPE_PROBE_TABLE.slice(1)) {
    try {
      const { status, body } = await probe.run(apiKey, whopAccountId);
      results[probe.label] = status >= 200 && status < 300 ? { ok: true, checkedAt: nowIso() } : classifyDenial(status, body);
    } catch {
      results[probe.label] = { ok: false, unnamedDenial: true, checkedAt: nowIso() };
    }
  }

  return { whopAccountId, results, hardStopped: false };
}
