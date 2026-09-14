import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { isSkillId, SKILL_MANIFEST } from "@/lib/skill-manifest";
import { setSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { isProductOnboarded } from "@/lib/product-onboarding";
import { PRODUCT_ONBOARDING_WORKER_ID, WORKER_REGISTRY } from "@/lib/worker-registry";

export const runtime = "nodejs";
export const revalidate = 0;

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

    // runOnSetup skills (Pin-Down) can be turned OFF via plain bookkeeping,
    // but enabling them requires going through their dedicated setup workflow.
    if (SKILL_MANIFEST[skillId].runOnSetup && body.enabled) {
      return NextResponse.json(
        { error: "Pin-Down runs once during setup and must be configured from its bridge panel.", bridgeHref: `/dashboard/engagements/${id}/bridges/${skillId}` },
        { status: 422 }
      );
    }

    // Same product-onboarding gate enable/route.ts enforces (see
    // src/lib/product-onboarding.ts's header) — every non-onboarding
    // Showtime skill needs pin-down to have actually run first, not just
    // its own runOnSetup flag against itself.
    if (body.enabled && !SKILL_MANIFEST[skillId].runOnSetup && !(await isProductOnboarded("showtime", id))) {
      const onboardingWorkerId = PRODUCT_ONBOARDING_WORKER_ID.showtime;
      const onboardingWorker = WORKER_REGISTRY[onboardingWorkerId];
      return NextResponse.json(
        {
          error: `${onboardingWorker.name} needs to run for this client before ${SKILL_MANIFEST[skillId].name} means anything.`,
          bridgeHref: `/dashboard/engagements/${id}/bridges/${onboardingWorkerId}`,
          productId: "showtime",
          onboardingWorkerName: onboardingWorker.name,
        },
        { status: 422 }
      );
    }

    await setSkillEnabledForEngagement(id, skillId, body.enabled);

    return NextResponse.json({ ok: true, skillId, enabled: body.enabled, name: SKILL_MANIFEST[skillId].name });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[skills/[skillId] POST]", message);
    return NextResponse.json({ error: "Failed to update skill." }, { status: 500 });
  }
}