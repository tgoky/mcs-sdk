import { Composio } from "@composio/core";

/**
 * Composio integration layer.
 *
 * Design: Composio is used purely as an auth broker, not as the execution
 * layer for actual platform API calls. Every existing platform client in
 * src/lib/platforms/*.ts calls resolveCredential(engagementId, provider)
 * and expects back a plain bearer-token-style string it attaches to its
 * own fetch() calls — that pattern is unchanged by this file. A vault
 * credential whose refKey is a "composio:<connectedAccountId>" pointer
 * (see storeComposioVaultCredential below) resolves through
 * getComposioCredentialValue() at call time instead of decrypting a
 * locally stored ciphertext — see the branch added to resolveCredential()
 * in src/lib/credentials.ts. Every downstream caller stays exactly as
 * unaware of Composio as it already was of the vault itself.
 *
 * Why live-fetch instead of caching a copy locally: Composio's docs are
 * explicit that connected-account credential values come back redacted
 * ("values shorter than 4 characters replaced with REDACTED") except on
 * "initial creation or specific credential retrieval calls" — a targeted
 * GET by connectedAccountId (connectedAccounts.get()) is one of those
 * specific-retrieval calls, so it's safe to call every time rather than
 * caching a snapshot that could silently go stale when Composio rotates
 * the underlying token in the background (which it does automatically).
 * One extra network hop per credential resolution, in exchange for never
 * shipping a stale token — an acceptable trade for this app's call
 * volume (see the credential-health cron for the existing precedent of
 * network calls happening at check/use time, not just at save time).
 *
 * Toolkit coverage: only the 5 platforms confirmed to have real,
 * Composio-supported OAuth as of Aug 2026 — see PROVIDER_TOOLKIT_MAP.
 * Every other provider in this app (cal_com, oncehub, activecampaign,
 * smtp, convertkit) keeps using the existing paste-a-key vault flow
 * unchanged; Composio was never going to remove that step for platforms
 * that don't offer OAuth themselves.
 */

const PROVIDER_TOOLKIT_MAP: Record<string, string> = {
  calendly: "calendly",
  hubspot: "hubspot",
  klaviyo: "klaviyo",
  mailchimp: "mailchimp",
  // GoHighLevel: this app reuses the booking-slot credential
  // (ghl_calendar) for both booking and email/CRM use — see the
  // "GoHighLevel CRM actions reuse the Location ID set under Booking
  // above" comment in edit-stack-settings.tsx. One Composio connection
  // covers both.
  ghl_calendar: "highlevel",
};

export function isComposioManagedProvider(provider: string): boolean {
  return provider in PROVIDER_TOOLKIT_MAP;
}

export function toolkitSlugForProvider(provider: string): string | null {
  return PROVIDER_TOOLKIT_MAP[provider] ?? null;
}

let client: Composio | null = null;

function getComposioClient(): Composio {
  if (!process.env.COMPOSIO_API_KEY) {
    throw new Error("COMPOSIO_API_KEY is not set — Composio-managed connections are unavailable until it's configured.");
  }
  if (!client) {
    client = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
  }
  return client;
}

/**
 * List-or-create an auth config for a toolkit, using Composio's own
 * managed OAuth app (no client ID/secret of ours required to get started;
 * see "Custom Auth Configs" in Composio's docs if this app ever wants to
 * bring its own OAuth app per toolkit instead — out of scope here).
 * Idempotent and cheap enough to just call on every connect attempt
 * rather than caching the id anywhere; Composio's own list() call is the
 * source of truth so there's nothing to keep in sync.
 */
async function ensureAuthConfigId(toolkitSlug: string): Promise<string> {
  const composio = getComposioClient();
  const existing = await composio.authConfigs.list({ toolkit: toolkitSlug, isComposioManaged: true });
  const activeConfig = existing.items?.find((c) => c.status === "ENABLED");
  if (activeConfig) return activeConfig.id;

  const created = await composio.authConfigs.create(toolkitSlug, {
    type: "use_composio_managed_auth",
    name: `${toolkitSlug} (managed)`,
  });
  return created.id;
}

/**
 * Starts a hosted Composio connect flow for one of this app's internal
 * platform keys (e.g. "calendly", not the Composio toolkit slug). Returns
 * a redirectUrl the browser should navigate to — Composio handles the
 * entire OAuth dance on its own hosted page and redirects back to
 * callbackUrl with ?status=success&connected_account_id=... appended.
 *
 * userId passed to Composio is this app's workspaceId, not an individual
 * login — credentials here are workspace-scoped (see credentialVault),
 * matching "one connection per tenant per platform," the same
 * granularity storeVaultCredential already uses.
 */
export async function startComposioConnect(
  provider: string,
  workspaceId: string,
  callbackUrl: string
): Promise<{ redirectUrl: string }> {
  const toolkitSlug = toolkitSlugForProvider(provider);
  if (!toolkitSlug) {
    throw new Error(`${provider} is not a Composio-managed provider.`);
  }
  const composio = getComposioClient();
  const authConfigId = await ensureAuthConfigId(toolkitSlug);

  // link() is the current, non-deprecated hosted-auth method — initiate()
  // is being retired for Composio-managed OAuth (fully rolled out as of
  // 2026-07-03, before today's date), so link() is the only correct
  // choice here, not a style preference. See ConnectedAccounts.link()'s
  // own doc comment in @composio/core for the cutover dates.
  const connectionRequest = await composio.connectedAccounts.link(workspaceId, authConfigId, {
    callbackUrl,
  });
  if (!connectionRequest.redirectUrl) {
    throw new Error(`Composio did not return a redirect URL for ${provider}.`);
  }
  return { redirectUrl: connectionRequest.redirectUrl };
}

/**
 * Extracts the bearer-token-equivalent value out of a connected account's
 * state, whatever auth scheme the toolkit actually uses. Every scheme
 * this app's 5 Composio-managed providers use resolves to one of these
 * three fields — see the Oauth2ActiveConnectionData / ApiKey /
 * BearerToken schemas in @composio/core.
 */
function extractCredentialValue(state: unknown): string | null {
  if (!state || typeof state !== "object") return null;
  const val = (state as { val?: Record<string, unknown> }).val;
  if (!val) return null;
  const candidate = val.access_token ?? val.api_key ?? val.bearer_token;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

/**
 * Live-fetches the current usable credential value for a Composio
 * connected account. Called both right after a connection is created
 * (finalizeComposioConnection) and on every resolveCredential() call for
 * a composio:-linked vault row (see credentials.ts) — always a fresh
 * value, Composio refreshes expired OAuth tokens in the background
 * before this returns.
 */
export async function getComposioCredentialValue(connectedAccountId: string): Promise<string> {
  const composio = getComposioClient();
  const account = await composio.connectedAccounts.get(connectedAccountId);
  if (account.status !== "ACTIVE") {
    throw new Error(
      `Composio connection ${connectedAccountId} is ${account.status}${account.statusReason ? ` (${account.statusReason})` : ""} — reconnect it under Settings > Apps.`
    );
  }
  const value = extractCredentialValue(account.state);
  if (!value) {
    throw new Error(`Composio connection ${connectedAccountId} is ACTIVE but returned no usable credential value.`);
  }
  return value;
}

/** Confirms a just-created connection is active and returns its toolkit slug, for the callback route to label the vault row correctly. */
export async function finalizeComposioConnection(
  connectedAccountId: string
): Promise<{ toolkitSlug: string; status: string }> {
  const composio = getComposioClient();
  const account = await composio.connectedAccounts.get(connectedAccountId);
  return { toolkitSlug: account.toolkit.slug, status: account.status };
}

/**
 * Revokes a connection at Composio (and therefore at the underlying
 * platform) — the actual "revoke access" action, not just forgetting our
 * own pointer to it. Called from deleteVaultCredential() before the local
 * row is removed. Swallows errors deliberately: if Composio's API is
 * briefly unavailable, the person clicking Delete should still be able to
 * remove the credential locally rather than getting stuck — see the
 * caller's comment for why this doesn't block local deletion.
 */
export async function deleteComposioConnection(connectedAccountId: string): Promise<void> {
  const composio = getComposioClient();
  await composio.connectedAccounts.delete(connectedAccountId);
}

export const COMPOSIO_VAULT_REFKEY_PREFIX = "composio:";

export function composioVaultRefKey(connectedAccountId: string): string {
  return `${COMPOSIO_VAULT_REFKEY_PREFIX}${connectedAccountId}`;
}

export function connectedAccountIdFromRefKey(refKey: string): string | null {
  return refKey.startsWith(COMPOSIO_VAULT_REFKEY_PREFIX) ? refKey.slice(COMPOSIO_VAULT_REFKEY_PREFIX.length) : null;
}
