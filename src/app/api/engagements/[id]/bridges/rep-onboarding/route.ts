import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, repIdentityGraphs } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { setSkillEnabledForEngagement, isSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { dispatchSkillRun } from "@/lib/skill-dispatch";
import { saveRepIdentityGraphIntake, type RepIntakeInput } from "@/features/reputation-manager/server/onboarding-service";
import { REP_ENGINE_IDS } from "@/features/reputation-manager/engine-models";
import type { RepEngineId } from "@/models/schema";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * rep-onboarding's own hinges — mirrors bridges/pin-down/route.ts's shape
 * exactly (GET to prefill, POST to save + enable + dispatch), adapted for
 * Reputation Manager's identity-graph fields instead of Pin-Down's brand-
 * voice/confirmation-page ones. Unlike Pin-Down, there's no credential
 * storage happening here — dispatchSkillRun is called with no
 * completedSteps for that reason (see that function's own comment).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const activeWorkspace = await getActiveWorkspace(session.whopUserId);

  const [engagementRow] = await db
    .select({ buyer: engagements.buyer })
    .from(engagements)
    .where(
      and(
        eq(engagements.engagementId, id),
        eq(engagements.whopUserId, session.whopUserId),
        eq(engagements.workspaceId, activeWorkspace.workspaceId)
      )
    )
    .limit(1);

  if (!engagementRow) {
    return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
  }

  const [graph] = await db.select().from(repIdentityGraphs).where(eq(repIdentityGraphs.engagementId, id)).limit(1);
  const enabled = await isSkillEnabledForEngagement(id, "rep-onboarding");

  return NextResponse.json({
    buyer: engagementRow.buyer,
    enabled,
    graph: graph
      ? {
          operatorName: graph.operatorName,
          operatorAliases: graph.operatorAliases,
          operatorHandles: graph.operatorHandles,
          operatorDomains: graph.operatorDomains,
          operatorEmailContacts: graph.operatorEmailContacts,
          entities: graph.entities,
          offerings: graph.offerings,
          competitors: graph.competitors,
          collisions: graph.collisions,
          trustedSources: graph.trustedSources,
          seedPanelPrompts: graph.seedPanelPrompts,
          soleAuthorityName: graph.soleAuthorityName,
          crisisThresholdOverride: graph.crisisThresholdOverride,
          activeEngines: graph.activeEngines,
        }
      : null,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const [engagementRow] = await db
      .select({ engagementId: engagements.engagementId, buyer: engagements.buyer })
      .from(engagements)
      .where(
        and(
          eq(engagements.engagementId, id),
          eq(engagements.whopUserId, session.whopUserId),
          eq(engagements.workspaceId, activeWorkspace.workspaceId)
        )
      )
      .limit(1);

    if (!engagementRow) {
      return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const input: RepIntakeInput = {
      operatorName: typeof body.operatorName === "string" ? body.operatorName : "",
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
      crisisThresholdOverride:
        typeof body.crisisThresholdOverride === "number" ? body.crisisThresholdOverride : null,
      // null (anything other than a real array, including "not sent at
      // all") means no restriction — matches toIntakePayload's own
      // null-means-all-engines convention on the form side.
      activeEngines: Array.isArray(body.activeEngines)
        ? body.activeEngines.filter((v: unknown): v is RepEngineId => typeof v === "string" && REP_ENGINE_IDS.includes(v as RepEngineId))
        : null,
    };

    // saveRepIdentityGraphIntake owns every actual validation rule (see
    // that function) — this route's job is auth/ownership + coercing the
    // untyped JSON body into RepIntakeInput's shape, not re-implementing
    // field-level checks that already live in one place.
    const result = await saveRepIdentityGraphIntake(id, input);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    await setSkillEnabledForEngagement(id, "rep-onboarding", true);
    // No completedSteps: unlike Pin-Down, nothing credential-related
    // happens before this dispatch — the identity graph itself IS the
    // setup, not a prerequisite to it.
    const runId = await dispatchSkillRun(id, "rep-onboarding", engagementRow.buyer);

    return NextResponse.json({ ok: true, runId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[engagements/[id]/bridges/rep-onboarding]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
