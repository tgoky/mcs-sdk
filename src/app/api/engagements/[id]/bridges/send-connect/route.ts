import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { getColdOpenConfig } from "@/features/cold-open/server/config";
import { saveSendConnect, type SendConnectInput } from "@/features/cold-open/server/send-connect";
import type { ColdOpenSendPlatformId } from "@/models/schema";

export const runtime = "nodejs";
export const revalidate = 0;

const PLATFORMS: ColdOpenSendPlatformId[] = ["instantly", "smartlead", "lemlist", "reply_io"];

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const activeWorkspace = await getActiveWorkspace(session.whopUserId);

  const [row] = await db
    .select({ buyer: engagements.buyer })
    .from(engagements)
    .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session.whopUserId), eq(engagements.workspaceId, activeWorkspace.workspaceId)))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
  }

  const config = await getColdOpenConfig(id);
  return NextResponse.json({
    buyer: row.buyer,
    sendPlatform: config?.sendPlatform ?? null,
    campaignMap: config?.campaignMap ?? {},
    autoPushIcps: config?.autoPushIcps ?? [],
    icps: config?.icps ?? [],
  });
}

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
    if (!body || !PLATFORMS.includes(body.platform)) {
      return NextResponse.json({ error: `platform must be one of: ${PLATFORMS.join(", ")}` }, { status: 400 });
    }

    const input: SendConnectInput = {
      platform: body.platform,
      baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : undefined,
      campaignMap: typeof body.campaignMap === "object" && body.campaignMap !== null ? body.campaignMap : {},
      autoPushIcps: Array.isArray(body.autoPushIcps) ? body.autoPushIcps : [],
    };

    const result = await saveSendConnect(id, input);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[engagements/[id]/bridges/send-connect]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
