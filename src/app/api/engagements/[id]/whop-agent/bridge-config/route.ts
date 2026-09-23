import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { assertPublicUrl, UnsafeUrlError } from "@/lib/safe-fetch";
import { patchEngagementStack } from "@/lib/engagement-stack";
import { getOrCreateBridgeSigningSecret } from "@/features/whop-agent/server/bridge-manager-service";

export const runtime = "nodejs";
export const revalidate = 0;

/** Loads the currently-saved routing config, if any — without this the
 * config form had no way to show what's already configured and could only
 * ever blind-overwrite it. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const activeWorkspace = await getActiveWorkspace(session.whopUserId);

  const [row] = await db
    .select({ stack: engagements.stack })
    .from(engagements)
    .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session.whopUserId), eq(engagements.workspaceId, activeWorkspace.workspaceId)))
    .limit(1);
  if (!row) {
    return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
  }

  const stack = (row.stack as EngagementStack | null) ?? ({} as EngagementStack);
  return NextResponse.json({
    destinationUrl: stack.whop_bridge_destination_url ?? "",
    fieldMapping: stack.whop_bridge_field_mapping ?? {},
    // Shown so the destination can verify X-Whop-Agent-Signature; only
    // once a destination exists, so a visit alone doesn't create one.
    signingSecret: stack.whop_bridge_destination_url ? await getOrCreateBridgeSigningSecret(id) : null,
  });
}

/** Playbook 5.12's "Trigger: Manual for configuration" — a plain config
 * write, not gated (it doesn't touch Whop or the destination; it just
 * tells the agent where to route already-verified events it receives). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const activeWorkspace = await getActiveWorkspace(session.whopUserId);

  const body = await req.json().catch(() => ({}));
  if (typeof body?.destinationUrl !== "string" || !body.destinationUrl) {
    return NextResponse.json({ error: "destinationUrl is required." }, { status: 400 });
  }
  let parsedUrl: URL;
  try {
    // Public https hosts only — events are POSTed here from this server.
    parsedUrl = await assertPublicUrl(body.destinationUrl, { httpsOnly: true });
  } catch (err) {
    const reason = err instanceof UnsafeUrlError ? err.message : "Not a valid URL.";
    return NextResponse.json({ error: `destinationUrl must be a public https:// URL. ${reason}` }, { status: 400 });
  }

  const [row] = await db
    .select({ stack: engagements.stack })
    .from(engagements)
    .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session.whopUserId), eq(engagements.workspaceId, activeWorkspace.workspaceId)))
    .limit(1);
  if (!row) {
    return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
  }

  const fieldMapping = body.fieldMapping && typeof body.fieldMapping === "object" && !Array.isArray(body.fieldMapping) ? body.fieldMapping : undefined;

  await patchEngagementStack(id, { whop_bridge_destination_url: parsedUrl.toString(), whop_bridge_field_mapping: fieldMapping });

  return NextResponse.json({ ok: true });
}
