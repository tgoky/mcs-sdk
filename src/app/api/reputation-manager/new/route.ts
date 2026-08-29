import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { generateEngagementId } from "@/lib/engagement-id";
import { setSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { dispatchSkillRun } from "@/lib/skill-dispatch";
import { saveRepIdentityGraphIntake, type RepIntakeInput } from "@/features/reputation-manager/server/onboarding-service";
import crypto from "crypto";

export const runtime = "nodejs";

/**
 * Reputation Manager's own "new client" entry point — the counterpart to
 * /api/engagements/setup, for when someone starts fresh from
 * Reputation Manager's own space instead of adding it to a client that
 * already exists via Showtime (that path goes through
 * bridges/rep-onboarding/route.ts against an id that's already real).
 *
 * Creates the engagements row and the identity graph in one request,
 * same "each product is fully self-sufficient, no generic pre-step"
 * shape Showtime's wizard already has — this is what replaced the old
 * quick-add flow's job for this product specifically.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    if (typeof body.operatorName !== "string" || body.operatorName.trim().length === 0) {
      return NextResponse.json({ error: "Operator name is required." }, { status: 400 });
    }

    const buyerName = body.operatorName.trim();
    const engagementId = generateEngagementId(buyerName);

    await db.insert(engagements).values({
      id: crypto.randomUUID(),
      engagementId,
      whopUserId: session.whopUserId,
      workspaceId: activeWorkspace.workspaceId,
      buyer: buyerName,
      schemaVersion: "1.0",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const input: RepIntakeInput = {
      operatorName: buyerName,
      operatorAliases: Array.isArray(body.operatorAliases) ? body.operatorAliases : [],
      operatorHandles: typeof body.operatorHandles === "object" && body.operatorHandles !== null ? body.operatorHandles : {},
      operatorDomains: Array.isArray(body.operatorDomains) ? body.operatorDomains : [],
      operatorEmailContacts: Array.isArray(body.operatorEmailContacts) ? body.operatorEmailContacts : [],
      entities: Array.isArray(body.entities) ? body.entities : [],
      offerings: Array.isArray(body.offerings) ? body.offerings : [],
      competitors: Array.isArray(body.competitors) ? body.competitors : [],
      collisions: Array.isArray(body.collisions) ? body.collisions : [],
      trustedSources: Array.isArray(body.trustedSources) ? body.trustedSources : [],
      seedPanelPrompts: Array.isArray(body.seedPanelPrompts) ? body.seedPanelPrompts : [],
      soleAuthorityName: typeof body.soleAuthorityName === "string" ? body.soleAuthorityName : "",
      crisisThresholdOverride: typeof body.crisisThresholdOverride === "number" ? body.crisisThresholdOverride : null,
    };

    const result = await saveRepIdentityGraphIntake(engagementId, input);
    if ("error" in result) {
      // The row already exists at this point (created above) — a
      // validation failure here means an incomplete-but-real client, not
      // an orphan. That's fine: it's reachable again at
      // /dashboard/engagements/[id]/bridges/rep-onboarding to finish, the
      // same as any other engagement whose setup didn't finish in one
      // sitting.
      return NextResponse.json({ error: result.error, engagementId }, { status: 400 });
    }

    await setSkillEnabledForEngagement(engagementId, "rep-onboarding", true);
    const runId = await dispatchSkillRun(engagementId, "rep-onboarding", buyerName);

    return NextResponse.json({ engagementId, runId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[POST /api/reputation-manager/new]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
