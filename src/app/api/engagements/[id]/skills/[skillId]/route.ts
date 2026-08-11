import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { isSkillId, SKILL_MANIFEST } from "@/lib/skill-manifest";
import { setSkillEnabledForEngagement } from "@/lib/engagement-skills";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Per-engagement, per-skill enable/disable — see src/lib/skill-registry.ts
 * and src/lib/engagement-skills.ts. Every real entry point for a skill
 * (the generic dispatcher, the booking webhook, the booking poller, and
 * the approval-gate's own re-run-on-approve executor) already checks this
 * before doing anything, so flipping the toggle here has an immediate,
 * real effect — it isn't cosmetic.
 *
 * pin-down is deliberately not toggleable through this route: it's a
 * one-time setup-time skill (see getSkillsRunOnSetup in skill-registry.ts)
 * dispatched once by /api/pin-down/launch, not an ongoing automation a
 * client turns on or off after the fact. Disabling it here would have no
 * effect on an already-onboarded engagement and could only cause
 * confusion, not a useful outcome.
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

    if (!isSkillId(skillId)) {
      return NextResponse.json({ error: `Unknown skill: ${skillId}` }, { status: 400 });
    }
    if (skillId === "pin-down") {
      return NextResponse.json(
        { error: "Pin-Down runs once during setup and isn't toggled after the fact." },
        { status: 422 }
      );
    }

    const body = await req.json().catch(() => ({}));

    if (typeof body?.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be a boolean." }, { status: 400 });
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