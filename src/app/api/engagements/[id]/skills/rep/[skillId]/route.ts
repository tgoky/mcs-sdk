import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { isRepSkillId, REP_SKILL_MANIFEST } from "@/lib/rep-skill-manifest";
import { setSkillEnabledForEngagement } from "@/lib/engagement-skills";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Reputation Manager's counterpart to
 * /api/engagements/[id]/skills/[skillId]/route.ts — same contract, same
 * table (engagementSkills.skillId is free-text, shared across products),
 * kept as its own route rather than widening the Showtime one because
 * that route gates on isSkillId() specifically so a Showtime request
 * can never accidentally toggle a Reputation Manager row (or vice
 * versa) through the wrong id namespace.
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

    if (!isRepSkillId(skillId)) {
      return NextResponse.json({ error: `Unknown Reputation Manager skill: ${skillId}` }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));

    if (typeof body?.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be a boolean." }, { status: 400 });
    }

    // rep-onboarding (runOnSetup) can be turned OFF via plain bookkeeping,
    // but turning it on requires the identity-graph bridge — every other
    // Reputation Manager skill reads that graph, so there's nothing for
    // this row to mean until the bridge has actually run once.
    if (REP_SKILL_MANIFEST[skillId].runOnSetup && body.enabled) {
      return NextResponse.json(
        { error: "Identity Setup runs once during onboarding and must be configured from its bridge panel." },
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

    return NextResponse.json({ ok: true, skillId, enabled: body.enabled, name: REP_SKILL_MANIFEST[skillId].name });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[skills/rep/[skillId] POST]", message);
    return NextResponse.json({ error: "Failed to update skill." }, { status: 500 });
  }
}
