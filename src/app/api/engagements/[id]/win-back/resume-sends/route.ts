// src/app/api/engagements/[id]/win-back/resume-sends/route.ts
//
// Phase 6 — backs the "Resume Win-Back sends" control an operator uses
// after confirming/fixing whatever triggered a bounce/complaint-rate
// auto-pause (esp-delivery-monitor.ts). Clears the pause flags only —
// does not re-enroll any prospect who was auto-paused, same honest
// non-behavior resumeWinBackSends itself documents.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { and, eq } from "drizzle-orm";
import { resumeWinBackSends } from "@/features/win-back/server/esp-delivery-monitor";

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
      .select({ engagementId: engagements.engagementId, stack: engagements.stack })
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

    const stack = tenant.stack as EngagementStack | null;
    if (!stack?.win_back_auto_paused) {
      return NextResponse.json({ error: "Win-Back isn't auto-paused for this engagement. Nothing to resume." }, { status: 409 });
    }

    await resumeWinBackSends(engagementId);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to resume Win-Back sends.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
