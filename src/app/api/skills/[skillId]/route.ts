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
 * Per-engagement, per-bridge (skill/agent) enable/disable — bookkeeping
 * only. The single entry point for turning any bridge on or off for a
 * client, whether that's during the wizard's post-launch selection
 * screen or later from the engagement detail page. Every real trigger
 * path for a bridge (the generic dispatcher, the booking webhook, the
 * booking poller, and the approval-gate's own re-run-on-approve
 * executor) already checks isSkillEnabledForEngagement before doing
 * anything, so flipping the toggle here has an immediate, real effect —
 * it isn't cosmetic.
 *
 * pin-down is a bridge like any other here — see the "bridges are freely
 * selectable, none privileged" decision in the client-launch rework. The
 * one thing that still makes it different: its manifest entry has
 * runOnSetup: true, meaning it has its own hinges (config inputs) it
 * needs before it can mean anything to "turn it on" — there's no webhook
 * or cron for it to just wait on. So *enabling* a runOnSetup bridge is
 * rejected here and routed to its own bridge-specific endpoint instead
 * (today: POST /api/engagements/[id]/bridges/pin-down, which saves those
 * inputs and dispatches the run together). Disabling one is still plain
 * bookkeeping, same as any other bridge. This is driven by the manifest
 * flag, not a hardcoded "pin-down" check, so a future runOnSetup bridge
 * gets the same protection for free.
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

    const body = await req.json().catch(() => ({}));
    if (typeof body?.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be a boolean." }, { status: 400 });
    }

    if (body.enabled && SKILL_MANIFEST[skillId].runOnSetup) {
      return NextResponse.json(
        {
          error: `${SKILL_MANIFEST[skillId].name} has its own setup screen — enable it from there.`,
          configureAt: `/api/engagements/${id}/bridges/${skillId}`,
        },
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
    console.error("[engagements/[id]/skills/[skillId] POST]", message);
    return NextResponse.json({ error: "Failed to update skill." }, { status: 500 });
  }
}
