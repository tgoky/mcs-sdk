import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { isComposioManagedProvider, startComposioConnect } from "@/lib/composio";

/**
 * Body: { provider }. Starts a hosted Composio Connect flow for one of
 * the 5 providers Composio has real OAuth for (see PROVIDER_TOOLKIT_MAP
 * in src/lib/composio.ts). Returns a redirectUrl — the frontend does a
 * full-page navigation to it, not a popup: Composio's hosted page handles
 * the entire OAuth exchange and redirects the browser straight back to
 * /api/composio/callback on success or failure, no client-side SDK or
 * polling required on this app's side.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const { provider } = await request.json();
    if (!provider || typeof provider !== "string") {
      return NextResponse.json({ error: "Missing required field: provider" }, { status: 400 });
    }
    if (!isComposioManagedProvider(provider)) {
      return NextResponse.json({ error: `${provider} isn't a Composio-managed provider.` }, { status: 400 });
    }

    const origin = new URL(request.url).origin;
    const callbackUrl = `${origin}/api/composio/callback?provider=${encodeURIComponent(provider)}`;

    const { redirectUrl } = await startComposioConnect(provider, activeWorkspace.workspaceId, callbackUrl);
    return NextResponse.json({ redirectUrl });
  } catch (err) {
    console.error("[composio/connect POST]", err);
    const message = err instanceof Error ? err.message : "Failed to start Composio connection.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
