// src/app/api/engagements/[id]/workers/[workerId]/run-analysis/route.ts
//
// On-demand trigger for the Library's "Run analysis" menu item — a real
// LLM call scoped to one skill, same "only fires when asked" discipline
// as skill-compare/account-review's own routes. See
// skill-run-analysis.ts for what it's grounded in.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { generateSkillRunAnalysis } from "@/features/reports/server/skill-run-analysis";
import { isWorkerId } from "@/lib/worker-registry";

export const runtime = "nodejs";
export const revalidate = 0;

export async function POST(req: Request, { params }: { params: Promise<{ id: string; workerId: string }> }) {
  try {
    const { id, workerId } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isWorkerId(workerId)) {
      return NextResponse.json({ error: `Unknown worker: ${workerId}` }, { status: 400 });
    }

    const activeWorkspace = await getActiveWorkspace(session.whopUserId);
    const [row] = await db
      .select({ engagementId: engagements.engagementId })
      .from(engagements)
      .where(
        and(
          eq(engagements.engagementId, id),
          eq(engagements.whopUserId, session.whopUserId),
          eq(engagements.workspaceId, activeWorkspace.workspaceId)
        )
      )
      .limit(1);
    if (!row) {
      return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
    }

    const analysis = await generateSkillRunAnalysis(id, workerId);
    if (!analysis) {
      return NextResponse.json({ error: "Nothing to analyze yet — this skill has no runs and no tracked outcome." }, { status: 422 });
    }

    return NextResponse.json({ analysis });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[run-analysis POST]", message);
    return NextResponse.json({ error: "Failed to generate analysis." }, { status: 500 });
  }
}
