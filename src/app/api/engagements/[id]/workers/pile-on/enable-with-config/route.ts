// src/app/api/engagements/[id]/workers/pile-on/enable-with-config/route.ts
//
// EnablePileOnModal's "Quick setup" tab posts here instead of the two-step
// PATCH-then-enable dance — one call, backed by the same
// enablePileOnForEngagement function Teammates chat's enable_pile_on tool
// calls, so the two surfaces can't produce different results.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { enablePileOnForEngagement } from "@/lib/enable-pile-on";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: engagementId } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const body = await req.json().catch(() => ({}));
    const smsPlatform = typeof body?.smsPlatform === "string" ? body.smsPlatform : undefined;
    const adDataPlatform = typeof body?.adDataPlatform === "string" ? body.adDataPlatform : undefined;

    const result = await enablePileOnForEngagement(session.whopUserId, activeWorkspace.workspaceId, engagementId, { smsPlatform, adDataPlatform });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
