// src/app/api/engagements/[id]/tours/route.ts
//
// Persists interactive-tour progress into stack.tour_state (see
// src/models/schema.ts's own comment on that field, and
// tour-provider.tsx, the only caller). Called on every step the tour
// actually reaches — not on every click — so a step skipped because its
// target never appeared (product not onboarded, no client yet, whatever
// the real reason) never gets recorded as seen.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const revalidate = 0;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { tourId, status, currentStepId, completedStepIds, updatedAt } = body ?? {};
    if (typeof tourId !== "string" || typeof currentStepId !== "string" || (status !== "in_progress" && status !== "completed")) {
      return NextResponse.json({ error: "tourId, status, and currentStepId are required." }, { status: 400 });
    }

    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const [row] = await db
      .select({ engagementId: engagements.engagementId, stack: engagements.stack })
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
      return NextResponse.json({ error: "Engagement not found or access denied." }, { status: 404 });
    }

    const stack = (row.stack as EngagementStack | null) ?? ({} as EngagementStack);
    const nextStack: EngagementStack = {
      ...stack,
      tour_state: {
        ...stack.tour_state,
        [tourId]: {
          status,
          currentStepId,
          completedStepIds: Array.isArray(completedStepIds) ? completedStepIds : [],
          updatedAt: typeof updatedAt === "string" ? updatedAt : new Date().toISOString(),
        },
      },
    };

    await db.update(engagements).set({ stack: nextStack, updatedAt: new Date() }).where(eq(engagements.engagementId, id));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[engagements/[id]/tours PATCH]", err);
    return NextResponse.json({ error: "Failed to save tour progress." }, { status: 500 });
  }
}
