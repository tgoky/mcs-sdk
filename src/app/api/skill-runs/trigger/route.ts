import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { triggerSkillRunForEngagement } from "@/lib/skill-trigger";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { engagementId, skillName } = body as { engagementId?: string; skillName?: string };

    if (!engagementId || !skillName) {
      return NextResponse.json({ error: "Missing engagementId or skillName" }, { status: 400 });
    }

    const activeWorkspace = await getActiveWorkspace(session.whopUserId);
    const result = await triggerSkillRunForEngagement(session.whopUserId, activeWorkspace.workspaceId, engagementId, skillName);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, runId: result.runId, message: result.message }, { status: 202 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[skill-runs/trigger]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
