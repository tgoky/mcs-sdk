import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import {
  linkEngagementToVault,
  unlinkEngagementFromVault,
  vaultCredentialBelongsToTenant,
} from "@/lib/credentials";

/**
 * The "reuse a saved credential" action from Edit stack settings /
 * Update credentials — points this engagement's provider at a shared
 * credential_vault row instead of its own value. See
 * src/lib/credentials.ts's linkEngagementToVault for what actually
 * changes.
 *
 * Body: { provider, vaultId } to link, or { provider, vaultId: null } to
 * unlink back to "not configured" (distinct from POSTing a fresh value to
 * /api/credentials, which de-links implicitly as part of storing a new
 * value — this is for de-linking with nothing to replace it yet).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: engagementId } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const [engagement] = await db
      .select({ id: engagements.id })
      .from(engagements)
      .where(
        and(
          eq(engagements.engagementId, engagementId),
          eq(engagements.whopUserId, session.whopUserId),
          // FIX: this lookup previously only checked whopUserId, so a
          // link/unlink call could reach an engagement belonging to a
          // *different* workspace under the same account, same gap the
          // page.tsx detail route and skill-runs/trigger route both
          // guard against. Matches their pattern now.
          eq(engagements.workspaceId, activeWorkspace.workspaceId)
        )
      )
      .limit(1);
    if (!engagement) {
      return NextResponse.json({ error: "Engagement not found or access denied." }, { status: 404 });
    }

    const { provider, vaultId } = await request.json();
    if (!provider || typeof provider !== "string") {
      return NextResponse.json({ error: "provider is required." }, { status: 400 });
    }

    if (vaultId === null) {
      await unlinkEngagementFromVault(engagementId, provider);
      return NextResponse.json({ ok: true });
    }

    if (!vaultId || typeof vaultId !== "string") {
      return NextResponse.json({ error: "vaultId is required (or null to unlink)." }, { status: 400 });
    }

    const owned = await vaultCredentialBelongsToTenant(vaultId, activeWorkspace.workspaceId);
    if (!owned) {
      return NextResponse.json({ error: "Saved credential not found or access denied." }, { status: 404 });
    }

    await linkEngagementToVault(engagementId, provider, vaultId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[engagements/[id]/credentials/link POST]", err);
    return NextResponse.json({ error: "Failed to link credential." }, { status: 500 });
  }
}
