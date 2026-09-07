// src/app/api/engagements/[id]/win-back-pipeline/manual-enroll/route.ts
//
// Dashboard UI counterpart to Teammates chat's enroll_in_winback tool —
// same underlying functions (previewManualWinBackEnrollment,
// enrollProspectInWinBack in chat-winback.ts), so behavior can't drift
// between the two surfaces. Mirrors
// pile-on-pipeline/manual-enroll/route.ts's shape exactly (GET = preview,
// POST = the real enrollment) for the same reason that split exists there.
//
// No `force` field, unlike Pile-On's route — see
// previewManualWinBackEnrollment's own comment for why an existing active
// enrollment is a hard stop here, not an overridable warning.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { previewManualWinBackEnrollment, enrollProspectInWinBack } from "@/lib/chat-winback";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: engagementId } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const { searchParams } = new URL(req.url);
    const prospectEmail = searchParams.get("prospectEmail")?.trim() ?? "";
    if (!prospectEmail) {
      return NextResponse.json({ error: "prospectEmail is required" }, { status: 400 });
    }

    const result = await previewManualWinBackEnrollment({ engagementId, workspaceId: activeWorkspace.workspaceId, prospectEmail });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ actions: result.actions });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: engagementId } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const body = await req.json().catch(() => ({}));
    const prospectEmail = typeof body?.prospectEmail === "string" ? body.prospectEmail.trim() : "";
    const prospectName = typeof body?.prospectName === "string" ? body.prospectName.trim() || undefined : undefined;

    if (!prospectEmail) {
      return NextResponse.json({ error: "prospectEmail is required" }, { status: 400 });
    }

    const result = await enrollProspectInWinBack({ engagementId, workspaceId: activeWorkspace.workspaceId, prospectEmail, prospectName });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ success: true, enrollmentId: result.enrollmentId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
