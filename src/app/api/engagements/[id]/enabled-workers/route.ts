// src/app/api/engagements/[id]/enabled-workers/route.ts
//
// Backs the Library's "Compare" flyout picker — every skill actually
// enabled for this engagement, across every product, so a comparison
// can span Showtime against Reputation Manager against Cold Open the
// same way it can span two skills inside one product. Fetched on open
// rather than prop-drilled through worker-card.tsx's two different
// parent pages (the Library grid and a product's own page), which would
// otherwise both need to compute and pass the same list.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { getEnabledWorkerIdsForEngagement } from "@/lib/engagement-skills";
import { WORKER_REGISTRY } from "@/lib/worker-registry";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const enabledIds = await getEnabledWorkerIdsForEngagement(id);
    const workers = enabledIds.map((workerId) => ({
      workerId,
      name: WORKER_REGISTRY[workerId].name,
      productId: WORKER_REGISTRY[workerId].productId,
    }));

    return NextResponse.json({ workers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[enabled-workers GET]", message);
    return NextResponse.json({ error: "Failed to load enabled skills." }, { status: 500 });
  }
}
