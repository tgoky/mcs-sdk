// src/app/api/engagements/[id]/pin-down/run-piece/route.ts
//
// Dashboard UI counterpart to two of Teammates chat's standalone Show Rate
// Setup pieces — extract_brand_voice and audit_confirmation_page
// (src/app/api/teammates/chat/route.ts). Neither had ANY UI trigger before
// this route: DeliverablesPanel only ever displayed their results, and
// client-details-drawer.tsx's "Regenerate" buttons only cover scripts/ad
// briefs, and only once one already exists. This reuses the exact same
// trigger functions chat already calls (triggerVoiceExtractionForEngagement,
// triggerPageAuditForEngagement in chat-skill-trigger.ts) rather than a
// second implementation — same dispatch, same run tracking, same behavior
// regardless of which surface triggered it.
//
// Both dispatch a background run and return a runId immediately (real web
// crawling / an LLM audit — too slow for a synchronous request), same
// reasoning as the chat tools' own "dispatches and returns immediately"
// description.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { triggerVoiceExtractionForEngagement, triggerPageAuditForEngagement } from "@/lib/chat-skill-trigger";

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
    const piece = body?.piece;

    if (piece === "voice") {
      const domain = typeof body?.domain === "string" ? body.domain.trim() : "";
      if (!domain) return NextResponse.json({ error: "domain is required" }, { status: 400 });
      const result = await triggerVoiceExtractionForEngagement(session.whopUserId, activeWorkspace.workspaceId, engagementId, domain);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ runId: result.runId, message: result.message });
    }

    if (piece === "page_audit") {
      const pageUrl = typeof body?.pageUrl === "string" ? body.pageUrl.trim() : "";
      if (!pageUrl) return NextResponse.json({ error: "pageUrl is required" }, { status: 400 });
      const result = await triggerPageAuditForEngagement(session.whopUserId, activeWorkspace.workspaceId, engagementId, pageUrl);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ runId: result.runId, message: result.message });
    }

    return NextResponse.json({ error: 'piece must be "voice" or "page_audit"' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
