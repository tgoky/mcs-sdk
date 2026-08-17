import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { listVaultCredentials, storeVaultCredential } from "@/lib/credentials";

/**
 * The operator's reusable credentials — "how n8n does it," per the
 * original request this feature came from. Scoped to the caller's active
 * workspace, not pooled across every workspace a whopUserId owns: see
 * credential_vault in src/models/schema.ts and the resolution logic in
 * src/lib/credentials.ts.
 */
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const { searchParams } = new URL(request.url);
    const provider = searchParams.get("provider") ?? undefined;

    const items = await listVaultCredentials(activeWorkspace.workspaceId, provider);
    return NextResponse.json({ items });
  } catch (err) {
    console.error("[credential-vault GET]", err);
    return NextResponse.json({ error: "Failed to load saved credentials." }, { status: 500 });
  }
}

/** Body: { provider, label, value }. Saves a brand new reusable credential — does not touch any engagement. Use /api/engagements/[id]/credentials/link to attach it to one. */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const { provider, label, value } = await request.json();
    if (!provider || !label || !value) {
      return NextResponse.json(
        { error: "Missing required fields: provider, label, value" },
        { status: 400 }
      );
    }
    if (typeof label !== "string" || label.trim().length === 0) {
      return NextResponse.json({ error: "label must be a non-empty string." }, { status: 400 });
    }

    const id = await storeVaultCredential(
      activeWorkspace.workspaceId,
      session.whopUserId,
      provider,
      label.trim(),
      `secrets://vault/${activeWorkspace.workspaceId}/${provider}/${Date.now()}`,
      value
    );

    return NextResponse.json({ id });
  } catch (err) {
    console.error("[credential-vault POST]", err);
    return NextResponse.json({ error: "Failed to save credential." }, { status: 500 });
  }
}
