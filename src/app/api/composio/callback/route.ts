import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import {
  storeComposioVaultCredential,
  linkEngagementToVault,
  rotateComposioVaultCredential,
  vaultCredentialBelongsToTenant,
} from "@/lib/credentials";
import { composioVaultRefKey, finalizeComposioConnection, isAllowedComposioReturnPath } from "@/lib/composio";
import { db } from "@/lib/db";
import { engagements, credentialVault } from "@/models/schema";
import { and, eq } from "drizzle-orm";

/**
 * Composio redirects the browser here after its hosted connect page
 * finishes, appending its own query params to whatever callbackUrl
 * /api/composio/connect passed — see startComposioConnect's doc comment.
 * This is a plain browser navigation back to our own domain, so the
 * normal session cookie is present; no state needs threading through the
 * URL beyond `provider`, the optional `returnTo`, and the optional
 * `engagementId`/`vaultId`, all of which this app set itself in
 * /api/composio/connect (and ownership-checked there) rather than trusting
 * anything Composio-supplied for any of them.
 *
 * Lands back on `returnTo` when one was supplied and is still on the
 * allowlist (re-checked here, never trusted from the round trip alone),
 * otherwise falls back to /dashboard/settings/apps exactly as before —
 * every caller that doesn't pass returnTo (i.e. every call site that
 * existed before the wizard started using this route) sees identical
 * behavior to today.
 *
 * When engagementId is present, the new vault credential is linked to
 * that engagement right here, server-side — re-checking ownership again
 * (never trusting the earlier check alone across the OAuth round trip) —
 * rather than depending on a specific page's own client-side code being
 * mounted and watching for a query param when the browser lands back.
 * This is what makes Connect work correctly regardless of which page or
 * drawer it was opened from: the credential ends up linked to the right
 * client even if the return path is just the default Settings > Apps
 * landing page.
 *
 * When vaultId is present instead, this is a reconnect of an existing
 * shared vault row (Settings > Apps' "Reconnect" action on a Composio-
 * managed row whose health check went invalid) — rotateComposioVaultCredential
 * updates that row's own refKey in place rather than storeComposioVaultCredential
 * inserting an unrelated new one, so every engagement already linked to it
 * picks up the fresh connection immediately, no re-linking needed. Takes
 * priority over engagementId if a caller somehow sent both (it shouldn't —
 * see /api/composio/connect's own comment), since a reconnect is about
 * fixing the shared credential itself, not linking one specific client.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const provider = searchParams.get("provider");
  const status = searchParams.get("status");
  const connectedAccountId = searchParams.get("connected_account_id");
  const returnToParam = searchParams.get("returnTo");
  const engagementId = searchParams.get("engagementId");
  const reconnectVaultId = searchParams.get("vaultId");
  const returnPath = returnToParam && isAllowedComposioReturnPath(returnToParam) ? returnToParam : "/dashboard/settings/apps";
  const returnUrl = new URL(returnPath, origin);

  if (!provider) {
    returnUrl.searchParams.set("composio_error", "Missing provider on callback.");
    return NextResponse.redirect(returnUrl);
  }

  // Echoed on every outcome from here on (success and failure alike) so a
  // caller rendering several credential rows on one page at once — e.g.
  // Pre-Call Read's video/research/call-intelligence keys, each a
  // potentially-different provider — can tell which row's own connect
  // attempt this particular return belongs to, instead of every row on the
  // page reacting to composio_connected/composio_error alike. Purely
  // additive: existing readers of this route (apps-page-client.tsx,
  // teammates-workspace.tsx) only ever looked at composio_connected/
  // composio_error and stay unaffected by this extra param.
  returnUrl.searchParams.set("composio_provider", provider);
  // Echoed unconditionally too, distinct from composio_linked_engagement
  // below (which only appears once the credential actually succeeded in
  // linking) — this one just says which engagement the attempt was FOR,
  // present even on failure. Lets a page whose relevant UI isn't tied to
  // the URL at all (queue-panel.tsx's QueueFixDrawer, opened via plain
  // React state, not a query param) know to re-open that same context on
  // return, success or error alike, instead of only ever handling the
  // happy path.
  if (engagementId) {
    returnUrl.searchParams.set("composio_context_engagement", engagementId);
  }

  if (status !== "success" || !connectedAccountId) {
    returnUrl.searchParams.set("composio_error", `Connecting ${provider} was cancelled or failed.`);
    return NextResponse.redirect(returnUrl);
  }

  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      returnUrl.searchParams.set("composio_error", "Session expired — please sign in and try connecting again.");
      return NextResponse.redirect(returnUrl);
    }
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const { status: connectionStatus, toolkitSlug } = await finalizeComposioConnection(connectedAccountId);
    if (connectionStatus !== "ACTIVE") {
      returnUrl.searchParams.set("composio_error", `${provider} connection ended up ${connectionStatus.toLowerCase()}, not active — try reconnecting.`);
      return NextResponse.redirect(returnUrl);
    }

    if (reconnectVaultId) {
      const belongsToTenant = await vaultCredentialBelongsToTenant(reconnectVaultId, activeWorkspace.workspaceId);
      const [row] = belongsToTenant
        ? await db.select({ provider: credentialVault.provider }).from(credentialVault).where(eq(credentialVault.id, reconnectVaultId)).limit(1)
        : [];
      if (belongsToTenant && row?.provider === provider) {
        await rotateComposioVaultCredential(reconnectVaultId, connectedAccountId);
        returnUrl.searchParams.set("composio_reconnected_vault", reconnectVaultId);
        returnUrl.searchParams.set("composio_connected", provider);
        return NextResponse.redirect(returnUrl);
      }
      // Ownership or provider mismatch — fall through to the normal
      // "create a new row" path below rather than silently no-op'ing, so
      // the OAuth connection that already succeeded at Composio isn't lost.
    }

    const vaultId = await storeComposioVaultCredential(
      activeWorkspace.workspaceId,
      session.whopUserId,
      provider,
      `${toolkitSlug} (via Composio)`,
      composioVaultRefKey(connectedAccountId)
    );

    if (engagementId) {
      const [owned] = await db
        .select({ id: engagements.id })
        .from(engagements)
        .where(
          and(
            eq(engagements.engagementId, engagementId),
            eq(engagements.whopUserId, session.whopUserId),
            eq(engagements.workspaceId, activeWorkspace.workspaceId)
          )
        )
        .limit(1);
      if (owned) {
        await linkEngagementToVault(engagementId, provider, vaultId);
        returnUrl.searchParams.set("composio_linked_engagement", engagementId);
        returnUrl.searchParams.set("composio_vault_id", vaultId);
      }
      // Not owned (or no longer exists) — the credential is still saved to
      // the vault either way; it just isn't linked to a specific client.
      // Not surfaced as composio_error: the connection itself succeeded.
    }

    returnUrl.searchParams.set("composio_connected", provider);
    return NextResponse.redirect(returnUrl);
  } catch (err) {
    console.error("[composio/callback GET]", err);
    returnUrl.searchParams.set("composio_error", `Something went wrong saving the ${provider} connection.`);
    return NextResponse.redirect(returnUrl);
  }
}
