import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { isComposioManagedProvider, startComposioConnect, isAllowedComposioReturnPath } from "@/lib/composio";

/**
 * Body: { provider, returnTo? }. Starts a hosted Composio Connect flow for
 * one of the 5 providers Composio has real OAuth for (see
 * PROVIDER_TOOLKIT_MAP in src/lib/composio-providers.ts). Returns a
 * redirectUrl — the frontend does a full-page navigation to it, not a
 * popup: Composio's hosted page handles the entire OAuth exchange and
 * redirects the browser straight back to /api/composio/callback on success
 * or failure, no client-side SDK or polling required on this app's side.
 *
 * returnTo lets a caller other than Settings > Apps (currently: the "new
 * engagement" wizard's credential picker) ask to land back on its own page
 * instead of the default. Checked against isAllowedComposioReturnPath
 * before being threaded through — never trust it as an open-redirect
 * target. An invalid/omitted returnTo just falls back to today's behavior
 * (the callback route defaults to /dashboard/settings/apps on its own),
 * so this is purely additive.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const { provider, returnTo } = await request.json();
    if (!provider || typeof provider !== "string") {
      return NextResponse.json({ error: "Missing required field: provider" }, { status: 400 });
    }
    if (!isComposioManagedProvider(provider)) {
      return NextResponse.json({ error: `${provider} isn't a Composio-managed provider.` }, { status: 400 });
    }

    const origin = new URL(request.url).origin;
    const callbackUrl = new URL("/api/composio/callback", origin);
    callbackUrl.searchParams.set("provider", provider);
    if (typeof returnTo === "string" && isAllowedComposioReturnPath(returnTo)) {
      callbackUrl.searchParams.set("returnTo", returnTo);
    }

    const { redirectUrl } = await startComposioConnect(provider, activeWorkspace.workspaceId, callbackUrl.toString());
    return NextResponse.json({ redirectUrl });
  } catch (err) {
    console.error("[composio/connect POST]", err);
    const message = err instanceof Error ? err.message : "Failed to start Composio connection.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
