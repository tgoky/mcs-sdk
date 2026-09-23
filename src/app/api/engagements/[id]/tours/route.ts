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
import { engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { and, eq } from "drizzle-orm";
import { TOURS } from "@/lib/tours/tour-definitions";
import { setEngagementStackEntry } from "@/lib/engagement-stack";

// The real tours, plus the reserved id the first-visit nudge saves its
// dismissal under (tour-provider.tsx's dismissWelcome).
const KNOWN_TOUR_IDS = new Set<string>([...TOURS.map((t) => t.id), "welcome-nudge"]);

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
    if (!KNOWN_TOUR_IDS.has(tourId)) {
      return NextResponse.json({ error: "Unknown tour." }, { status: 400 });
    }
    if (currentStepId.length > 100) {
      return NextResponse.json({ error: "currentStepId is too long." }, { status: 400 });
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
      return NextResponse.json({ error: "Engagement not found or access denied." }, { status: 404 });
    }

    // Only this tour's entry is written, in one UPDATE — a whole-stack
    // write here used to be able to undo a config save that landed while a
    // tour step was saving.
    await setEngagementStackEntry(id, "tour_state", tourId, {
      status,
      currentStepId,
      completedStepIds: Array.isArray(completedStepIds)
        ? completedStepIds.filter((v: unknown): v is string => typeof v === "string" && v.length <= 100).slice(0, 100)
        : [],
      updatedAt: typeof updatedAt === "string" && !Number.isNaN(Date.parse(updatedAt)) ? updatedAt : new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[engagements/[id]/tours PATCH]", err);
    return NextResponse.json({ error: "Failed to save tour progress." }, { status: 500 });
  }
}
