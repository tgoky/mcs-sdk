import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdminEmail } from "@/lib/whop-access";
import { exportWinBackToSkillPack, markWinBackExported } from "@/features/win-back/server/export-to-skill-pack";

/**
 * Tier 4 #29 / Win-Back recovery gap 1 option 2 — export path.
 *
 * GET returns the export bundle (read-only, safe to call repeatedly —
 * preview it before committing). POST confirms the export and flips
 * runtime_ownership_model, which stops this app's own SMS dispatch and
 * hybrid personalization for the engagement — see export-to-skill-pack.ts
 * for exactly what does and doesn't stop running.
 */
export async function GET(req: Request, { params }: { params: Promise<{ engagementId: string }> }) {
  const session = await getSession();
  if (!session.whopUserId || !isAdminEmail(session.email)) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { engagementId } = await params;

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

  try {
    const bundle = await exportWinBackToSkillPack(engagementId);
    await markWinBackExported(engagementId, bundle.platform);
    return NextResponse.json({ success: true, exportedAt: bundle.exportedAt, platform: bundle.platform });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
