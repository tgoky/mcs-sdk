// src/app/api/engagements/[id]/skill-compare/route.ts
//
// On-demand trigger for the Library's "Compare" flyout — a real LLM
// call, same "only fires when asked" discipline as account-review's own
// route. See skill-compare.ts for what it's grounded in.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { llmActionLimitReached, LLM_ACTIONS_PER_HOUR } from "@/lib/llm-request-limit";
import { generateSkillComparison } from "@/features/reports/server/skill-compare";
import { isWorkerId, type WorkerId } from "@/lib/worker-registry";

export const runtime = "nodejs";
export const revalidate = 0;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const workerIdsRaw: unknown = body.workerIds;
    if (!Array.isArray(workerIdsRaw) || workerIdsRaw.length < 2 || !workerIdsRaw.every((w) => typeof w === "string" && isWorkerId(w))) {
      return NextResponse.json({ error: "Pick at least 2 skills to compare." }, { status: 400 });
    }
    const workerIds = workerIdsRaw as WorkerId[];

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

    if (await llmActionLimitReached(id, "compare")) {
      return NextResponse.json(
        { error: `That's ${LLM_ACTIONS_PER_HOUR} in the last hour for this client. Try again later.` },
        { status: 429, headers: { "Retry-After": "600" } }
      );
    }

    const comparison = await generateSkillComparison(id, workerIds);
    if (!comparison) {
      return NextResponse.json({ error: "Couldn't generate a comparison. Try again." }, { status: 422 });
    }

    return NextResponse.json({ comparison });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[skill-compare POST]", message);
    return NextResponse.json({ error: "Failed to generate comparison." }, { status: 500 });
  }
}
