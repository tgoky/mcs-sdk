import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { hasCredential } from "@/lib/credentials";
import { createEspAdapter } from "@/features/cold-open/server/esp/factory";
import { coldOpenCredentialProvider } from "@/features/cold-open/server/source-connect";
import type { ColdOpenSendPlatformId } from "@/models/schema";

export const runtime = "nodejs";
export const revalidate = 0;

const PLATFORMS: ColdOpenSendPlatformId[] = ["instantly", "smartlead", "lemlist", "reply_io"];

// Live campaign list for the platform already connected on Send Connect's
// first step — every ESPAdapter already implements listCampaigns() (used
// today only after the fact, by runSendConnect's verifyCampaigns check).
// This exposes the same call before save, so the ICP->campaign map is a
// picker instead of a field where a mistyped id fails silently until the
// next scheduled run.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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

    const body = await req.json().catch(() => null);
    const platform = body?.platform;
    if (!platform || !PLATFORMS.includes(platform)) {
      return NextResponse.json({ error: `platform must be one of: ${PLATFORMS.join(", ")}` }, { status: 400 });
    }
    const baseUrl = typeof body?.baseUrl === "string" ? body.baseUrl : undefined;

    if (!(await hasCredential(id, coldOpenCredentialProvider(platform)))) {
      return NextResponse.json({ error: `No ${platform} credential saved for this engagement yet — connect it first.` }, { status: 400 });
    }

    const adapter = createEspAdapter(id, platform, { baseUrl });
    const campaigns = await adapter.listCampaigns();

    return NextResponse.json({ success: true, campaigns });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[engagements/[id]/bridges/send-connect/campaigns]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
