// src/app/api/engagements/[id]/win-back/generate-cadence/route.ts
//
// Standalone "Generate cadence now" action for the Recovery Cadence card.
// generateRecoveryCadence (recovery-service.ts) is pure content generation
// from voice/offer/window-size — it doesn't need a real booking event at
// all. The only wiring this button had before was
// POST /api/skill-runs/trigger with skillName="win-back", which
// unconditionally rejects both "pile-on" and "win-back" ("This module
// fires automatically on bookings...", see skill-trigger.ts) — the button
// could never succeed no matter what. This calls the same generation
// function the real booking-triggered pipeline uses, directly.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { and, eq } from "drizzle-orm";
import { startRun } from "@/lib/run-log";
import { generateRecoveryCadence } from "@/features/win-back/server/recovery-service";
import crypto from "crypto";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: engagementId } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const [tenant] = await db
      .select()
      .from(engagements)
      .where(
        and(
          eq(engagements.engagementId, engagementId),
          eq(engagements.whopUserId, session.whopUserId),
          eq(engagements.workspaceId, activeWorkspace.workspaceId)
        )
      )
      .limit(1);

    if (!tenant) {
      return NextResponse.json({ error: "Engagement not found or access denied." }, { status: 404 });
    }
    if (tenant.deletedAt) {
      return NextResponse.json({ error: "Can't generate a cadence for a deleted engagement." }, { status: 409 });
    }

    const runId = crypto.randomUUID();
    await startRun({
      id: runId,
      engagementId,
      skillName: "win-back",
      phase: "cadence_generation",
      label: "Manually triggered from the Recovery Cadence card",
    });

    // generateRecoveryCadence owns its own finishRun/failRun lifecycle
    // (recovery-service.ts) — it re-throws on failure after recording it,
    // so this route's catch below only needs to turn that into an HTTP
    // error, not call failRun itself.
    await generateRecoveryCadence(tenant, runId);

    return NextResponse.json({ runId, message: "Recovery cadence generated." });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to generate cadence.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
