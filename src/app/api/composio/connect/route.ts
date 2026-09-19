import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { isComposioManagedProvider, startComposioConnect, isAllowedComposioReturnPath } from "@/lib/composio";
import { vaultCredentialBelongsToTenant } from "@/lib/credentials";
import { db } from "@/lib/db";
import { engagements, credentialVault } from "@/models/schema";
import { and, eq } from "drizzle-orm";

/**
 * Body: { provider, returnTo?, engagementId?, vaultId? }. Starts a hosted
 * Composio Connect flow for one of the 5 providers Composio has real OAuth
 * for (see PROVIDER_TOOLKIT_MAP in src/lib/composio-providers.ts). Returns
 * a redirectUrl — the frontend does a full-page navigation to it, not a
 * popup: Composio's hosted page handles the entire OAuth exchange and
 * redirects the browser straight back to /api/composio/callback on success
 * or failure, no client-side SDK or polling required on this app's side.
 *
 * returnTo lets a caller other than Settings > Apps ask to land back on its
 * own page instead of the default. Checked against
 * isAllowedComposioReturnPath before being threaded through — never trust
 * it as an open-redirect target. An invalid/omitted returnTo just falls
 * back to today's behavior (the callback route defaults to
 * /dashboard/settings/apps on its own), so this is purely additive.
 *
 * engagementId and vaultId are separate from returnTo and don't need a path
 * allowlist the same way — neither is a redirect target. Both are
 * ownership-checked right here before being threaded through at all:
 *
 * engagementId drives a server-side auto-link in the callback route (see
 * that route's own comment) — this is what makes Connect work correctly
 * from CredentialRow no matter which page or drawer it was opened from.
 *
 * vaultId means "this connect is reconnecting an EXISTING shared vault
 * credential that's gone invalid, not creating a brand new one" — the
 * Settings > Apps "Reconnect" action on a Composio-managed row uses this.
 * Without it, reconnecting there would just create an unrelated new vault
 * row, leaving every engagement already linked to the old (now invalid)
 * row silently broken — deleteVaultCredential refuses to delete it while
 * in use, and there was previously no rotate path for a Composio-managed
 * row at all (rotateVaultCredential only accepts a plaintext value). See
 * rotateComposioVaultCredential's own comment in credentials.ts. Mutually
 * exclusive with engagementId in practice (a reconnect fixes a shared
 * credential for everyone using it, not one specific client) — both are
 * independently checked here regardless, and the callback route treats
 * vaultId as taking priority if somehow both were sent.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const { provider, returnTo, engagementId, vaultId } = await request.json();
    if (!provider || typeof provider !== "string") {
      return NextResponse.json({ error: "Missing required field: provider" }, { status: 400 });
    }
    if (!isComposioManagedProvider(provider)) {
      return NextResponse.json({ error: `${provider} isn't a Composio-managed provider.` }, { status: 400 });
    }

    let ownedEngagementId: string | null = null;
    if (typeof engagementId === "string" && engagementId) {
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
      if (!owned) {
        return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
      }
      ownedEngagementId = engagementId;
    }

    let ownedVaultId: string | null = null;
    if (typeof vaultId === "string" && vaultId) {
      const belongsToTenant = await vaultCredentialBelongsToTenant(vaultId, activeWorkspace.workspaceId);
      if (!belongsToTenant) {
        return NextResponse.json({ error: "Saved credential not found or access denied" }, { status: 404 });
      }
      const [row] = await db
        .select({ provider: credentialVault.provider })
        .from(credentialVault)
        .where(eq(credentialVault.id, vaultId))
        .limit(1);
      if (!row || row.provider !== provider) {
        return NextResponse.json({ error: "That saved credential is for a different provider." }, { status: 400 });
      }
      ownedVaultId = vaultId;
    }

    const origin = new URL(request.url).origin;
    const callbackUrl = new URL("/api/composio/callback", origin);
    callbackUrl.searchParams.set("provider", provider);
    if (typeof returnTo === "string" && isAllowedComposioReturnPath(returnTo)) {
      callbackUrl.searchParams.set("returnTo", returnTo);
    }
    if (ownedEngagementId) {
      callbackUrl.searchParams.set("engagementId", ownedEngagementId);
    }
    if (ownedVaultId) {
      callbackUrl.searchParams.set("vaultId", ownedVaultId);
    }

    const { redirectUrl } = await startComposioConnect(provider, activeWorkspace.workspaceId, callbackUrl.toString());
    return NextResponse.json({ redirectUrl });
  } catch (err) {
    console.error("[composio/connect POST]", err);
    const message = err instanceof Error ? err.message : "Failed to start Composio connection.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
