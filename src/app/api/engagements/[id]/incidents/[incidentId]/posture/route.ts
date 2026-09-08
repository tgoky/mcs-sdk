import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { isAdminEmail, isAuthorizedForEngagement } from "@/lib/whop-access";
import { db } from "@/lib/db";
import { engagements, repIncidents } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { RESPONSE_POSTURES, type ResponsePostureId } from "@/features/reputation-manager/rep-thresholds";
import { draftForChosenPosture } from "@/features/reputation-manager/server/response-routing";

const VALID_POSTURES = new Set<string>(RESPONSE_POSTURES.map((p) => p.id));

/**
 * Tier 3 (pause_and_instruct) posture selection — thresholds.yml.template's
 * own rationale: no draft exists until the sole authority chooses one of
 * these, because the choice itself is the load-bearing operator judgment.
 * This is that choice: it stores the posture on the incident, then
 * generates the draft to it (draftForChosenPosture) and queues it for
 * approval exactly like a tier 1/2 draft.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; incidentId: string }> }) {
  const session = await getSession();
  if (!session.whopUserId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id: engagementId, incidentId } = await params;

  let body: { posture?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.posture || !VALID_POSTURES.has(body.posture)) {
    return NextResponse.json({ error: `posture must be one of: ${[...VALID_POSTURES].join(", ")}` }, { status: 400 });
  }
  const posture = body.posture as ResponsePostureId;

  const [incident] = await db
    .select({ id: repIncidents.id, engagementId: repIncidents.engagementId, selectedPosture: repIncidents.selectedPosture })
    .from(repIncidents)
    .where(and(eq(repIncidents.id, incidentId), eq(repIncidents.engagementId, engagementId)))
    .limit(1);
  if (!incident) {
    return NextResponse.json({ error: "Incident not found." }, { status: 404 });
  }

  if (!(await isAuthorizedForEngagement(session, engagementId))) {
    return NextResponse.json({ error: "You don't have access to this engagement." }, { status: 403 });
  }

  if (!isAdminEmail(session.email)) {
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);
    const [inWorkspace] = await db
      .select({ id: engagements.id })
      .from(engagements)
      .where(and(eq(engagements.engagementId, engagementId), eq(engagements.workspaceId, activeWorkspace.workspaceId)))
      .limit(1);
    if (!inWorkspace) {
      return NextResponse.json({ error: "Engagement not found in active workspace." }, { status: 404 });
    }
  }

  if (incident.selectedPosture) {
    return NextResponse.json({ error: `A posture (${incident.selectedPosture}) has already been chosen for this incident.` }, { status: 409 });
  }

  await db.update(repIncidents).set({ selectedPosture: posture }).where(eq(repIncidents.id, incidentId));

  if (posture === "escalate_externally") {
    // The one posture that isn't "draft something" — the operator decided
    // mid-review this actually belongs at tier 4. No draft, same evidence-
    // package/handoff path a force-triggered tier 4 finding gets.
    const { buildEvidencePackage } = await import("@/features/reputation-manager/server/response-routing");
    const [full] = await db
      .select({
        summary: repIncidents.summary,
        severityScore: repIncidents.severityScore,
        signalClass: repIncidents.signalClass,
        contributingFindings: repIncidents.contributingFindings,
        declaredAt: repIncidents.declaredAt,
      })
      .from(repIncidents)
      .where(eq(repIncidents.id, incidentId))
      .limit(1);
    if (full) {
      const { repIdentityGraphs } = await import("@/models/schema");
      const [graph] = await db
        .select({ operatorName: repIdentityGraphs.operatorName, soleAuthorityName: repIdentityGraphs.soleAuthorityName })
        .from(repIdentityGraphs)
        .where(eq(repIdentityGraphs.engagementId, engagementId))
        .limit(1);
      if (graph) {
        const evidencePackage = buildEvidencePackage({
          operatorName: graph.operatorName,
          soleAuthorityName: graph.soleAuthorityName,
          incidentId,
          severityScore: full.severityScore,
          signalClass: full.signalClass,
          summary: full.summary,
          findings: full.contributingFindings as any,
          declaredAt: full.declaredAt,
        });
        await db.update(repIncidents).set({ status: "external_escalation_pending", evidencePackage }).where(eq(repIncidents.id, incidentId));
      }
    }
    return NextResponse.json({ ok: true, escalated: true });
  }

  const runId = crypto.randomUUID();
  try {
    await draftForChosenPosture({ engagementId, incidentId, posture, runId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Posture saved but drafting failed: ${message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, drafted: true });
}
