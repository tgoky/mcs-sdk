// src/app/api/engagements/[id]/account-review/route.ts
//
// On-demand trigger for the Account Advisor (Phase 4 of the reports/
// analytics rework) — a real LLM call, so it only fires when the user
// actually asks for one, never automatically on page load. See
// account-advisor.ts for what it's actually grounded in.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { generateAccountReview } from "@/features/reports/server/account-advisor";

export const runtime = "nodejs";
export const revalidate = 0;

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

    const review = await generateAccountReview(id);
    if (!review) {
      return NextResponse.json({ error: "Nothing to review yet — no enabled skill has reported data." }, { status: 422 });
    }

    return NextResponse.json({ review });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[account-review POST]", message);
    return NextResponse.json({ error: "Failed to generate account review." }, { status: 500 });
  }
}
