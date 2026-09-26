import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { activeShareLink, createShareLink, revokeShareLinks } from "@/features/reports/server/share-links";

export const runtime = "nodejs";
export const revalidate = 0;

async function ownedBy(engagementId: string): Promise<{ email: string | null } | null> {
  const session = await getSession();
  if (!session?.whopUserId) return null;
  const workspace = await getActiveWorkspace(session.whopUserId);
  const [row] = await db
    .select({ id: engagements.id })
    .from(engagements)
    .where(and(eq(engagements.engagementId, engagementId), eq(engagements.whopUserId, session.whopUserId), eq(engagements.workspaceId, workspace.workspaceId)))
    .limit(1);
  return row ? { email: session.email ?? null } : null;
}

const origin = (req: Request) => process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || new URL(req.url).origin;

/** Whether a link is live (the link itself is only shown when made). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await ownedBy(id))) return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
  const live = await activeShareLink(id);
  return NextResponse.json({ active: Boolean(live), createdAt: live?.createdAt ?? null, viewCount: live?.viewCount ?? 0, lastViewedAt: live?.lastViewedAt ?? null });
}

/** A new link; any older one stops working. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owner = await ownedBy(id);
  if (!owner) return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
  const { token, createdAt } = await createShareLink(id, owner.email);
  return NextResponse.json({ url: `${origin(req)}/results/${token}`, createdAt });
}

/** Turns the link off. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await ownedBy(id))) return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
  await revokeShareLinks(id);
  return NextResponse.json({ ok: true });
}
