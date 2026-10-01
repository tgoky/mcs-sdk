import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { and, eq } from "drizzle-orm";
import { setEngagementStackEntry } from "@/lib/engagement-stack";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Dismisses a classified run-failure queue item (src/lib/error-classification.ts
 * + queue.ts's failedRunQueueItems) for one skill on one engagement — "I
 * know about this, stop showing it, I'll deal with it later."
 *
 * Same reuse-the-jsonb-stack-column trick as
 * /api/engagements/[id]/sync-mode's dismissSetupNudge, and for the same
 * reason: this is synthesized, read-time, self-healing state (see the
 * schema.ts comment on failed_run_dismissals), not a real row that needs
 * its own table and its own migration.
 *
 * Body: { skillName: string }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const body = await req.json().catch(() => ({}));
    const skillName = typeof body?.skillName === "string" ? body.skillName : null;
    if (!skillName) {
      return NextResponse.json({ error: "skillName is required." }, { status: 400 });
    }

    const [row] = await db
      .select({ stack: engagements.stack })
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

    await setEngagementStackEntry(id, "failed_run_dismissals", skillName, new Date().toISOString());

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[engagements/[id]/dismiss-run-failure PATCH]", err);
    return NextResponse.json({ error: "Failed to dismiss." }, { status: 500 });
  }
}