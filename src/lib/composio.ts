import { Composio } from "@composio/core";
import crypto from "crypto";
import { db } from "@/lib/db";
import { composioConnectAttempts } from "@/models/schema";
import { eq } from "drizzle-orm";
import { isComposioManagedProvider, toolkitSlugForProvider } from "@/lib/composio-providers";

// Re-exported for backward compatibility — every existing import of these
// three from "@/lib/composio" (composio/connect, composio/callback, etc.)
// keeps working unchanged. See composio-providers.ts for why the
// declaration itself moved out of this file.
export { isComposioManagedProvider, toolkitSlugForProvider };

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

/**
 * Pages allowed to ask the Composio connect flow to return them there
 * instead of the default /dashboard/settings/apps — checked on both the
 * way out (/api/composio/connect) and the way back
 * (/api/composio/callback), since returnTo round-trips through a
 * Composio-hosted page and this app should never trust it blindly as an
 * open redirect target. Exact-match only, no prefix matching: add a new
 * entry here deliberately rather than widening the check.
 *
 * /dashboard/engagements/new is dead — that route is a permanent redirect
 * to /home/new (see its own page.tsx), and nothing live renders
 * CredentialField's "Connect" tab from there anymore. Left in place rather
 * than removed: it's inert (isAllowedComposioReturnPath is the only thing
 * that reads it, and a dead route matching it changes nothing), and
 * deleting the entry is a separate cleanup from what this change is for.
 *
 * /dashboard/queue, /dashboard/reputation-manager, /dashboard/showtime:
 * the 3 real, static pages that render <QueuePanel> directly (confirmed
 * by grep, not assumed — dashboard/page.tsx does not), which renders
 * QueueFixDrawer, which renders CredentialRow/UpdateCredentialsForm for
 * whatever provider a stuck run's credential fix is for. Closes the gap
 * CredentialRow's Connect return-handling effect flagged as a known
 * limit when it first shipped: reconnecting from this drawer used to
 * silently fall back to landing on Settings > Apps (the credential still
 * linked correctly server-side since the fix earlier this phase, just
 * with no inline confirmation on the page the person was actually on).
 */
const COMPOSIO_RETURN_ALLOWLIST = [
  "/dashboard/settings/apps",
  "/dashboard/engagements/new",
  "/dashboard/teammates",
  "/dashboard/queue",
  "/dashboard/reputation-manager",
  "/dashboard/showtime",
];

/**
 * The 4 worker config forms that render CredentialRow with a live "Connect"
 * option (see update-credentials-form.tsx) — each is a real, standalone,
 * bookmarkable route at /dashboard/engagements/<id>/bridges/<worker>, but
 * <id> is per-engagement and can't be exact-matched the way the static
 * paths above are. Still a closed, explicit set — not "anything under
 * /bridges/" — so this stays a real allowlist, not a prefix check.
 */
const COMPOSIO_RETURN_BRIDGE_WORKERS = ["pin-down", "pre-call-read", "icp-lock", "rep-onboarding"];
const COMPOSIO_RETURN_BRIDGE_PATTERN = new RegExp(
  `^/dashboard/engagements/[^/]+/bridges/(${COMPOSIO_RETURN_BRIDGE_WORKERS.join("|")})$`
);

/**
 * The engagement detail page itself — /dashboard/engagements/<id>, no
 * further segment. Confirmed (grep, not assumed) that
 * engagement-actions-menu.tsx renders UpdateCredentialsForm directly from
 * this exact page.tsx, and workers-panel.tsx (also rendered here) is
 * where pin-down/pre-call-read/icp-lock/rep-onboarding's own config forms
 * can appear embedded instead of via their standalone bridges/<worker>
 * routes above. Same closed-set reasoning as the bridge pattern: matches
 * only the bare detail page, not anything nested under it.
 */
const COMPOSIO_RETURN_ENGAGEMENT_DETAIL_PATTERN = /^\/dashboard\/engagements\/[^/]+$/;

export function isAllowedComposioReturnPath(path: string): boolean {
  return (
    COMPOSIO_RETURN_ALLOWLIST.includes(path) ||
    COMPOSIO_RETURN_BRIDGE_PATTERN.test(path) ||
    COMPOSIO_RETURN_ENGAGEMENT_DETAIL_PATTERN.test(path)
  );
}

const CONNECT_ATTEMPT_MAX_AGE_MS = 15 * 60_000; // 15 minutes

/** Mints a single-use OAuth state token binding a Composio connect
 * attempt to the workspace that actually started it — see
 * composioConnectAttempts' own schema comment for the vulnerability this
 * closes. Call once, right before building the callbackUrl, and thread
 * the returned state through as one more query param. */
export async function createComposioConnectAttempt(workspaceId: string, provider: string): Promise<string> {
  const state = crypto.randomBytes(32).toString("hex");
  await db.insert(composioConnectAttempts).values({ id: crypto.randomUUID(), state, workspaceId, provider });
  return state;
}

/** Validates and consumes (single-use, deleted on first lookup regardless
 * of outcome — never replayable) a connect-attempt state. Returns the
 * workspaceId that actually initiated the flow when the state is valid,
 * unexpired, and for the right provider — or null otherwise. The caller
 * MUST treat null as "reject the callback outright," never fall back to
 * trusting the current session alone; that fallback is the exact bug
 * this exists to close. */
export async function consumeComposioConnectAttempt(state: string | null, provider: string): Promise<string | null> {
  if (!state) return null;
  const [row] = await db.select().from(composioConnectAttempts).where(eq(composioConnectAttempts.state, state)).limit(1);
  if (!row) return null;
  await db.delete(composioConnectAttempts).where(eq(composioConnectAttempts.state, state));
  if (row.provider !== provider) return null;
  if (Date.now() - row.createdAt.getTime() > CONNECT_ATTEMPT_MAX_AGE_MS) return null;
  return row.workspaceId;
}

export const COMPOSIO_VAULT_REFKEY_PREFIX = "composio:";

export function composioVaultRefKey(connectedAccountId: string): string {
  return `${COMPOSIO_VAULT_REFKEY_PREFIX}${connectedAccountId}`;
}

export function connectedAccountIdFromRefKey(refKey: string): string | null {
  return refKey.startsWith(COMPOSIO_VAULT_REFKEY_PREFIX) ? refKey.slice(COMPOSIO_VAULT_REFKEY_PREFIX.length) : null;
}
