// src/app/api/engagements/[id]/skills/[skillId]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { isSkillId, SKILL_MANIFEST } from "@/lib/skill-manifest";
import { setSkillEnabledForEngagement } from "@/lib/engagement-skills";

export const runtime = "nodejs";
export const revalidate = 0;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; skillId: string }> }
) {
  const { id, skillId } = await params;
  const session = await getSession();

  // ═══════════════════════════════════════════════════════════
  // TEMPORARY DIAGNOSTIC — REMOVE AFTER FIX
  // ═══════════════════════════════════════════════════════════
  console.log("╔══════ SKILLS ROUTE ══════");
  console.log("║ engagementId:", JSON.stringify(id));
  console.log("║ skillId:", skillId);
  console.log("║ session.whopUserId:", session?.whopUserId);
  console.log("║ session.email:", session?.email);
  
  // Check if the row exists AT ALL (ignoring user ID for this diagnostic)
  const [diagRow] = await db
    .select({ 
      engagementId: engagements.engagementId, 
      whopUserId: engagements.whopUserId 
    })
    .from(engagements)
    .where(eq(engagements.engagementId, id))
    .limit(1);
    
  console.log("║ row found:", !!diagRow);
  if (diagRow) {
    console.log("║ row.engagementId:", JSON.stringify(diagRow.engagementId));
    console.log("║ row.whopUserId:", diagRow.whopUserId);
    console.log("║ userId match:", diagRow.whopUserId === session?.whopUserId);
  } else {
    console.log("║ ⚠️ ROW DOES NOT EXIST IN DATABASE");
  }
  console.log("╚════════════════════════");
  // ═══════════════════════════════════════════════════════════

  try {
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isSkillId(skillId)) {
      return NextResponse.json({ error: `Unknown skill: ${skillId}` }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));

    if (typeof body?.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be a boolean." }, { status: 400 });
    }

    // runOnSetup skills (Pin-Down) can be turned OFF via plain bookkeeping,
    // but enabling them requires going through their dedicated setup workflow.
    if (SKILL_MANIFEST[skillId].runOnSetup && body.enabled) {
      return NextResponse.json(
        { error: "Pin-Down runs once during setup and must be configured from its bridge panel." },
        { status: 422 }
      );
    }

    const [row] = await db
      .select({ engagementId: engagements.engagementId })
      .from(engagements)
      .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session.whopUserId)))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
    }

    await setSkillEnabledForEngagement(id, skillId, body.enabled);

    return NextResponse.json({ ok: true, skillId, enabled: body.enabled, name: SKILL_MANIFEST[skillId].name });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[skills/[skillId] POST]", message);
    return NextResponse.json({ error: "Failed to update skill." }, { status: 500 });
  }
}