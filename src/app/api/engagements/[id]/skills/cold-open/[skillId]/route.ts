import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { isColdOpenSkillId, COLD_OPEN_SKILL_MANIFEST } from "@/lib/cold-open-skill-manifest";
import { setSkillEnabledForEngagement } from "@/lib/engagement-skills";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Cold Open's counterpart to /api/engagements/[id]/skills/[skillId]/route.ts
 * and .../skills/rep/[skillId]/route.ts — same contract, same table
 * (engagementSkills.skillId is free-text, shared across products), kept as
 * its own route for the same isolation reason those two are separate from
 * each other: gating on isColdOpenSkillId() means a Cold Open request can
 * never accidentally toggle a Showtime or Reputation Manager row through
 * the wrong id namespace.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; skillId: string }> }
) {
  try {
    const { id, skillId } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isColdOpenSkillId(skillId)) {
      return NextResponse.json({ error: `Unknown Cold Open skill: ${skillId}` }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));

    if (typeof body?.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be a boolean." }, { status: 400 });
    }

    // icp-lock (runOnSetup) can be turned OFF via plain bookkeeping, but
    // turning it on requires its own bridge — every other Cold Open skill
    // reads coldOpenConfig, so there's nothing for this row to mean until
    // the bridge has actually run once. Same defense-in-depth reasoning
    // rep-onboarding's own toggle route documents — the panel already
    // redirects here instead of calling this endpoint.
    if (COLD_OPEN_SKILL_MANIFEST[skillId].runOnSetup && body.enabled) {
      return NextResponse.json(
        {
          error: "ICP Lock runs once during setup and must be configured from its bridge panel.",
          bridgeUrl: `/dashboard/engagements/${id}/bridges/${skillId}`,
        },
        { status: 422 }
      );
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

    await setSkillEnabledForEngagement(id, skillId, body.enabled);

    return NextResponse.json({ ok: true, skillId, enabled: body.enabled, name: COLD_OPEN_SKILL_MANIFEST[skillId].name });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[skills/cold-open/[skillId] POST]", message);
    return NextResponse.json({ error: "Failed to update skill." }, { status: 500 });
  }
}
