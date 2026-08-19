import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { storeComposioVaultCredential } from "@/lib/credentials";
import { composioVaultRefKey, finalizeComposioConnection, isAllowedComposioReturnPath } from "@/lib/composio";

/**
 * Composio redirects the browser here after its hosted connect page
 * finishes, appending its own query params to whatever callbackUrl
 * /api/composio/connect passed — see startComposioConnect's doc comment.
 * This is a plain browser navigation back to our own domain, so the
 * normal session cookie is present; no state needs threading through the
 * URL beyond `provider` and the optional `returnTo`, both of which this
 * app set itself in /api/composio/connect rather than trusting anything
 * Composio-supplied for either.
 *
 * Lands back on `returnTo` when one was supplied and is still on the
 * allowlist (re-checked here, never trusted from the round trip alone),
 * otherwise falls back to /dashboard/settings/apps exactly as before —
 * every caller that doesn't pass returnTo (i.e. every call site that
 * existed before the wizard started using this route) sees identical
 * behavior to today.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const provider = searchParams.get("provider");
  const status = searchParams.get("status");
  const connectedAccountId = searchParams.get("connected_account_id");
  const returnToParam = searchParams.get("returnTo");
  const returnPath = returnToParam && isAllowedComposioReturnPath(returnToParam) ? returnToParam : "/dashboard/settings/apps";
  const returnUrl = new URL(returnPath, origin);

  if (!provider) {
    returnUrl.searchParams.set("composio_error", "Missing provider on callback.");
    return NextResponse.redirect(returnUrl);
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

    await storeComposioVaultCredential(
      activeWorkspace.workspaceId,
      session.whopUserId,
      provider,
      `${toolkitSlug} (via Composio)`,
      composioVaultRefKey(connectedAccountId)
    );

    returnUrl.searchParams.set("composio_connected", provider);
    return NextResponse.redirect(returnUrl);
  } catch (err) {
    console.error("[composio/callback GET]", err);
    returnUrl.searchParams.set("composio_error", `Something went wrong saving the ${provider} connection.`);
    return NextResponse.redirect(returnUrl);
  }
}
