import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Launches a client. This is deliberately product-agnostic: it means
 * "the client account is configured and ready to have bridges (skills /
 * agents) enabled on it," not "run a specific bridge." No SKILL_REGISTRY
 * entry, no Inngest dispatch, nothing product-specific happens here.
 *
 * This replaced /api/pin-down/launch as the wizard's "go" button. That
 * route used to loop getSkillsRunOnSetup() and fire every runOnSetup
 * bridge the moment a client was launched — fine while Pin-Down/Showtime
 * was the only thing on the platform, but wrong once a client might be
 * here for a different bridge, several bridges, or none yet. Bridge
 * selection now happens as its own step, after this one, via
 * POST /api/engagements/[id]/skills/[skillId] — which is also where a
 * runOnSetup bridge like Pin-Down actually fires, at the moment it's
 * turned on, not implicitly at launch.
 *
 * Idempotent: launching an already-launched client just confirms the
 * existing launchedAt rather than erroring or overwriting it.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const [row] = await db
      .select({ engagementId: engagements.engagementId, launchedAt: engagements.launchedAt })
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

    let launchedAt = row.launchedAt;
    if (!launchedAt) {
      launchedAt = new Date();
      await db
        .update(engagements)
        .set({ launchedAt })
        .where(and(eq(engagements.engagementId, id), isNull(engagements.launchedAt)));
    }

    return NextResponse.json({ ok: true, engagementId: id, launchedAt: launchedAt.toISOString() });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[engagements/[id]/launch]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}