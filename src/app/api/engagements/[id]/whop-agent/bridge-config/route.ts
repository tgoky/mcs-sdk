import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";

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
    parsedUrl = new URL(body.destinationUrl);
    if (parsedUrl.protocol !== "https:") throw new Error("must be https");
  } catch {
    return NextResponse.json({ error: "destinationUrl must be a valid https:// URL." }, { status: 400 });
  }

  const [row] = await db
    .select({ stack: engagements.stack })
    .from(engagements)
    .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session.whopUserId), eq(engagements.workspaceId, activeWorkspace.workspaceId)))
    .limit(1);
  if (!row) {
    return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
  }

  const stack = (row.stack as EngagementStack | null) ?? ({} as EngagementStack);
  const fieldMapping = body.fieldMapping && typeof body.fieldMapping === "object" ? body.fieldMapping : undefined;

  await db
    .update(engagements)
    .set({ stack: { ...stack, whop_bridge_destination_url: parsedUrl.toString(), whop_bridge_field_mapping: fieldMapping }, updatedAt: new Date() })
    .where(eq(engagements.engagementId, id));

  return NextResponse.json({ ok: true });
}
