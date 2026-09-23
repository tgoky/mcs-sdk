import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { hasCredential, resolveCredential } from "@/lib/credentials";
import { PROVIDER_BY_RESOURCE, fetchStackOptions } from "@/lib/stack-options";

export const runtime = "nodejs";
export const revalidate = 0;

// Live option lists for edit-stack-settings.tsx — every one of these was,
// until this route existed, a bare text input asking the operator to go
// copy an id out of a third-party dashboard, even though the credential
// for that exact platform is already saved on this engagement
// (resolveCredential(engagementId, provider)). One route, switched on
// `resource`, instead of a dozen near-identical proxy routes — each case
// resolves the one credential it needs and maps that platform's list
// response into { id, name } pairs.
//
// Unlike src/app/api/integrations/* (the new-engagement wizard's proxies),
// this never takes a raw key from the client — the wizard has a plaintext
// key in hand because the credential hasn't been saved yet; this panel
// only ever runs against a credential this engagement already has.

export async function GET(req: Request, { params }: { params: Promise<{ id: string; resource: string }> }) {
  try {
    const { id, resource } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const [row] = await db
      .select({ engagementId: engagements.engagementId })
      .from(engagements)
      .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session.whopUserId), eq(engagements.workspaceId, activeWorkspace.workspaceId)))
      .limit(1);
    if (!row) {
      return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
    }

    const provider = PROVIDER_BY_RESOURCE[resource];
    if (!provider) {
      return NextResponse.json({ error: `Unknown resource "${resource}"` }, { status: 400 });
    }
    if (!(await hasCredential(id, provider))) {
      return NextResponse.json({ error: `No credential saved for this engagement's ${provider} connection yet. Connect it under "Update credentials" first.` }, { status: 400 });
    }
    const credential = await resolveCredential(id, provider);
    const url = new URL(req.url);

    const options = await fetchStackOptions(resource, credential, url.searchParams);
    return NextResponse.json({ success: true, options });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[engagements/[id]/stack-options] ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
