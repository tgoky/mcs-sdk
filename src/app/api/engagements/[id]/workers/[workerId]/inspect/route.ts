// src/app/api/engagements/[id]/workers/[workerId]/inspect/route.ts
//
// The Library's "Inspect performance" menu item — deliberately NOT an
// LLM feature (see skill-inspect.ts's header). Same auth/ownership
// pattern as run-analysis and skill-compare's own routes, but a plain GET
// since nothing is generated or persisted here — just the real numbers.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { getSkillInspectData } from "@/features/reports/server/skill-inspect";
import { isWorkerId, WORKER_REGISTRY } from "@/lib/worker-registry";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; workerId: string }> }) {
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

    const data = await getSkillInspectData(id, workerId);
    return NextResponse.json({ ...data, workerName: WORKER_REGISTRY[workerId].name });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[inspect GET]", message);
    return NextResponse.json({ error: "Failed to load performance data." }, { status: 500 });
  }
}
