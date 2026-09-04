import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, repIdentityGraphs, repPitchTargets } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { draftPitch, type PitchArchetype } from "@/features/reputation-manager/server/offensive/pitch-package";

export const runtime = "nodejs";
export const revalidate = 0;

const VALID_ARCHETYPES: PitchArchetype[] = ["systems", "contrarian", "data"];

/**
 * Drafts pitch copy for one target. Returns the draft for the operator to
 * review, personalize, and send themselves from their own email client —
 * this endpoint never sends anything (see pitch-package.ts's file
 * comment for why).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; targetId: string }> }) {
  try {
    const { id, targetId } = await params;
    const session = await getSession();
    if (!session?.whopUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const activeWorkspace = await getActiveWorkspace(session.whopUserId);
    const [engagementRow] = await db
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

    if (!engagementRow) return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const archetype: PitchArchetype = VALID_ARCHETYPES.includes(body?.archetype) ? body.archetype : "systems";

    const [target] = await db
      .select()
      .from(repPitchTargets)
      .where(and(eq(repPitchTargets.id, targetId), eq(repPitchTargets.engagementId, id)))
      .limit(1);
    if (!target) return NextResponse.json({ error: "Pitch target not found." }, { status: 404 });

    const [graph] = await db.select().from(repIdentityGraphs).where(eq(repIdentityGraphs.engagementId, id)).limit(1);
    if (!graph) {
      return NextResponse.json(
        { error: "No identity graph found for this client yet — complete Reputation Manager's identity setup first." },
        { status: 404 }
      );
    }

    const primaryEntity = graph.entities.find((e) => e.highPriority) ?? graph.entities[0] ?? null;

    const draft = await draftPitch({
      operatorName: graph.operatorName,
      entityName: primaryEntity?.name ?? null,
      target: target.target,
      beat: target.beat,
      fitNotes: target.fitNotes,
      archetype,
    });

    return NextResponse.json({ draft });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
