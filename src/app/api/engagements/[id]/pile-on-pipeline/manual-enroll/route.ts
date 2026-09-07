// src/app/api/engagements/[id]/pile-on-pipeline/manual-enroll/route.ts
//
// Dashboard UI counterpart to the chat-only preview_pile_on_enrollment /
// enroll_in_pile_on tools (src/app/api/teammates/chat/route.ts,
// src/lib/chat-pile-on.ts) — same underlying functions, so the two stay
// in lock-step by construction rather than by two implementations kept in
// sync by hand. Nested under pile-on-pipeline/ (not a new top-level route)
// because this is one more thing an operator does from the same page that
// already shows this client's Pile-On pipeline, not a separate feature.
//
// GET = preview (read-only, query param). POST = the real enrollment.
// Same split as the chat tools, for the same reason: a client component
// can't tell the difference between "this failed" and "this refused
// on purpose because you didn't preview first" unless they're genuinely
// separate calls.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { previewManualPileOnEnrollment, enrollProspectInPileOn } from "@/lib/chat-pile-on";

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

    const result = await previewManualPileOnEnrollment({ engagementId, workspaceId: activeWorkspace.workspaceId, prospectEmail });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ actions: result.actions, warnings: result.warnings });
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
    const force = body?.force === true;

    if (!prospectEmail) {
      return NextResponse.json({ error: "prospectEmail is required" }, { status: 400 });
    }

    const result = await enrollProspectInPileOn({ engagementId, workspaceId: activeWorkspace.workspaceId, prospectEmail, prospectName, force });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ success: true, rebookedFromWinBack: result.rebookedFromWinBack });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
