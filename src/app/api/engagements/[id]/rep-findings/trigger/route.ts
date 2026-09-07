// src/app/api/engagements/[id]/rep-findings/trigger/route.ts
//
// Dashboard UI counterpart to Teammates chat's 6 adhoc RM actions — same
// trigger functions chat-skill-trigger.ts already exports and chat
// already calls, so behavior can't drift between the two surfaces. One
// route with an `action` discriminant rather than 6 separate route files,
// matching pin-down/run-piece/route.ts's own precedent for the same
// reason (a handful of thin, single-purpose dispatches to already-proven
// functions, not enough distinct logic per action to earn its own file).

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import {
  triggerEngineAdhocCheckForEngagement,
  triggerCrisisStressTestForEngagement,
  triggerDraftResponseForEngagement,
  triggerTwitterDeepScanForEngagement,
  triggerTrustpilotDeepScanForEngagement,
  triggerRedditDeepScanForEngagement,
} from "@/lib/chat-skill-trigger";

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
    const action = body?.action;
    const str = (v: unknown) => (typeof v === "string" ? v : undefined);

    const result = await (async () => {
      switch (action) {
        case "check_ai_engines":
          return triggerEngineAdhocCheckForEngagement(session.whopUserId, activeWorkspace.workspaceId, engagementId, str(body?.subject), str(body?.question));
        case "check_crisis_threshold": {
          const text = str(body?.hypotheticalFindingText);
          if (!text) return { ok: false as const, error: "hypotheticalFindingText is required" };
          return triggerCrisisStressTestForEngagement(session.whopUserId, activeWorkspace.workspaceId, engagementId, text, str(body?.hypotheticalFindingSource));
        }
        case "draft_response": {
          const text = str(body?.findingText);
          if (!text) return { ok: false as const, error: "findingText is required" };
          return triggerDraftResponseForEngagement(session.whopUserId, activeWorkspace.workspaceId, engagementId, text, str(body?.findingPlatform));
        }
        case "twitter_deep_scan": {
          const date = str(body?.deepScanSinceDate);
          if (!date) return { ok: false as const, error: "deepScanSinceDate is required" };
          return triggerTwitterDeepScanForEngagement(session.whopUserId, activeWorkspace.workspaceId, engagementId, date);
        }
        case "trustpilot_deep_scan": {
          const date = str(body?.deepScanSinceDate);
          if (!date) return { ok: false as const, error: "deepScanSinceDate is required" };
          return triggerTrustpilotDeepScanForEngagement(session.whopUserId, activeWorkspace.workspaceId, engagementId, date);
        }
        case "reddit_deep_scan": {
          const timeframe = str(body?.deepScanTimeframe);
          if (!timeframe) return { ok: false as const, error: "deepScanTimeframe is required" };
          return triggerRedditDeepScanForEngagement(session.whopUserId, activeWorkspace.workspaceId, engagementId, timeframe);
        }
        default:
          return { ok: false as const, error: `Unknown action: ${action}` };
      }
    })();

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ runId: result.runId, message: result.message });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
