import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { storeComposioVaultCredential } from "@/lib/credentials";
import { composioVaultRefKey, finalizeComposioConnection } from "@/lib/composio";

/**
 * Composio redirects the browser here after its hosted connect page
 * finishes, appending its own query params to whatever callbackUrl
 * /api/composio/connect passed — see startComposioConnect's doc comment.
 * This is a plain browser navigation back to our own domain, so the
 * normal session cookie is present; no state needs threading through the
 * URL beyond `provider`, which this app controls itself rather than
 * trusting anything Composio-supplied for that part.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const provider = searchParams.get("provider");
  const status = searchParams.get("status");
  const connectedAccountId = searchParams.get("connected_account_id");
  const appsUrl = new URL("/dashboard/settings/apps", origin);

  if (!provider) {
    appsUrl.searchParams.set("composio_error", "Missing provider on callback.");
    return NextResponse.redirect(appsUrl);
  }

  if (status !== "success" || !connectedAccountId) {
    appsUrl.searchParams.set("composio_error", `Connecting ${provider} was cancelled or failed.`);
    return NextResponse.redirect(appsUrl);
  }

  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      appsUrl.searchParams.set("composio_error", "Session expired — please sign in and try connecting again.");
      return NextResponse.redirect(appsUrl);
    }
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const { status: connectionStatus, toolkitSlug } = await finalizeComposioConnection(connectedAccountId);
    if (connectionStatus !== "ACTIVE") {
      appsUrl.searchParams.set("composio_error", `${provider} connection ended up ${connectionStatus.toLowerCase()}, not active — try reconnecting.`);
      return NextResponse.redirect(appsUrl);
    }

    await storeComposioVaultCredential(
      activeWorkspace.workspaceId,
      session.whopUserId,
      provider,
      `${toolkitSlug} (via Composio)`,
      composioVaultRefKey(connectedAccountId)
    );

    appsUrl.searchParams.set("composio_connected", provider);
    return NextResponse.redirect(appsUrl);
  } catch (err) {
    console.error("[composio/callback GET]", err);
    appsUrl.searchParams.set("composio_error", `Something went wrong saving the ${provider} connection.`);
    return NextResponse.redirect(appsUrl);
  }
}
