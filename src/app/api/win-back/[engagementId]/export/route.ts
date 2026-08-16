import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { isAdminEmail } from "@/lib/whop-access";
import { and, eq } from "drizzle-orm";
import { exportWinBackToSkillPack, markWinBackExported } from "@/features/win-back/server/export-to-skill-pack";

/**
 * Tier 4 #29 / Win-Back recovery gap 1 option 2 — export path.
 */
export async function GET(req: Request, { params }: { params: Promise<{ engagementId: string }> }) {
  const session = await getSession();
  if (!session.whopUserId || !isAdminEmail(session.email)) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { engagementId } = await params;
  const activeWorkspace = await getActiveWorkspace(session.whopUserId);

  const [engagement] = await db
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

  if (!engagement) {
    return NextResponse.json({ error: "Engagement not found or access denied." }, { status: 404 });
  }

  try {
    const bundle = await exportWinBackToSkillPack(engagementId);
    return NextResponse.json({ bundle });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ engagementId: string }> }) {
  const session = await getSession();
  if (!session.whopUserId || !isAdminEmail(session.email)) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { engagementId } = await params;
  const activeWorkspace = await getActiveWorkspace(session.whopUserId);

  const [engagement] = await db
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

  if (!engagement) {
    return NextResponse.json({ error: "Engagement not found or access denied." }, { status: 404 });
  }

  try {
    const bundle = await exportWinBackToSkillPack(engagementId);
    await markWinBackExported(engagementId, bundle.platform);
    return NextResponse.json({ success: true, exportedAt: bundle.exportedAt, platform: bundle.platform });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}