import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { isWhopAgentSkillId, WHOP_AGENT_SKILL_MANIFEST } from "@/lib/whop-agent-skill-manifest";
import { setSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { isProductOnboarded } from "@/lib/product-onboarding";
import { PRODUCT_ONBOARDING_WORKER_ID, WORKER_REGISTRY } from "@/lib/worker-registry";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Whop Agent's counterpart to /api/engagements/[id]/skills/[skillId]/route.ts
 * and .../skills/rep/[skillId]/route.ts — same contract, same shared
 * engagementSkills table, kept as its own route for the same reason the
 * Reputation Manager one is: gating on isWhopAgentSkillId() specifically so
 * a request can't toggle a row through the wrong id namespace.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; skillId: string }> }) {
  try {
    const { id, skillId } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isWhopAgentSkillId(skillId)) {
      return NextResponse.json({ error: `Unknown Whop Agent skill: ${skillId}` }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    if (typeof body?.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be a boolean." }, { status: 400 });
    }

    if (!WHOP_AGENT_SKILL_MANIFEST[skillId].implemented && body.enabled) {
      return NextResponse.json({ error: `${WHOP_AGENT_SKILL_MANIFEST[skillId].name} isn't built yet.` }, { status: 422 });
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

    // whop-connect (runOnSetup) can be turned off via plain bookkeeping,
    // but turning it on requires actually pasting a key and running the
    // scope probe — every other Whop Agent skill depends on that
    // connection existing, so there's nothing for this row to mean until
    // the bridge has run once.
    if (WHOP_AGENT_SKILL_MANIFEST[skillId].runOnSetup && body.enabled) {
      return NextResponse.json(
        {
          error: "Connect Whop Account runs from its own setup screen, not a plain toggle.",
          bridgeHref: `/dashboard/engagements/${id}/bridges/${skillId}`,
        },
        { status: 422 }
      );
    }

    // Same product-onboarding gate enable/route.ts enforces (see
    // src/lib/product-onboarding.ts's header) — every other Whop Agent
    // skill needs the Whop connection to actually exist first, not just
    // its own runOnSetup flag against itself.
    if (body.enabled && !WHOP_AGENT_SKILL_MANIFEST[skillId].runOnSetup && !(await isProductOnboarded("whop-agent", id))) {
      const onboardingWorkerId = PRODUCT_ONBOARDING_WORKER_ID["whop-agent"];
      const onboardingWorker = WORKER_REGISTRY[onboardingWorkerId];
      return NextResponse.json(
        {
          error: `${onboardingWorker.name} needs to run for this client before ${WHOP_AGENT_SKILL_MANIFEST[skillId].name} means anything.`,
          bridgeHref: `/dashboard/engagements/${id}/bridges/${onboardingWorkerId}`,
          productId: "whop-agent",
          onboardingWorkerName: onboardingWorker.name,
        },
        { status: 422 }
      );
    }

    await setSkillEnabledForEngagement(id, skillId, body.enabled);

    return NextResponse.json({ ok: true, skillId, enabled: body.enabled, name: WHOP_AGENT_SKILL_MANIFEST[skillId].name });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[skills/whop-agent/[skillId] POST]", message);
    return NextResponse.json({ error: "Failed to update skill." }, { status: 500 });
  }
}
