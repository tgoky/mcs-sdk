// src/app/api/engagements/[id]/workers/[workerId]/capabilities/route.ts
//
// Phase 3's first real slice (see the "Worker Onboarding & Gating: Plan"
// doc): read-only status for the Live Capability Matrix. Mirrors the
// auth shape every sibling route under workers/[workerId]/ already uses
// (enable/route.ts) — GET only, this never writes anything.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { isWorkerId } from "@/lib/worker-registry";
import { getFilledFieldKeys, computeCapabilityStatus } from "@/lib/worker-capability-status";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; workerId: string }> }) {
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, workerId } = await params;
  if (!isWorkerId(workerId)) {
    return NextResponse.json({ error: `Unknown worker: ${workerId}` }, { status: 400 });
  }

  const activeWorkspace = await getActiveWorkspace(session.whopUserId);
  const [row] = await db
    .select({ engagementId: engagements.engagementId })
    .from(engagements)
    .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session.whopUserId), eq(engagements.workspaceId, activeWorkspace.workspaceId)))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
  }

  const filledKeys = await getFilledFieldKeys(workerId, id);
  const capabilities = computeCapabilityStatus(workerId, filledKeys);

  return NextResponse.json({ capabilities });
}
