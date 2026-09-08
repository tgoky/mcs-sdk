import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { isAdminEmail, isAuthorizedForEngagement } from "@/lib/whop-access";
import { db } from "@/lib/db";
import { engagements, repIncidents } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { logAuditEvent } from "@/features/reputation-manager/server/audit-log";

/**
 * Tier 4 (external_escalation) close-out — thresholds.yml.template's own
 * description: "you route outside the system, system logs the handoff and
 * waits for you to bring the outcome back." This is that: the operator
 * reports what actually happened with counsel/the platform, it's logged as
 * an outcome audit event (chained to nothing specific — the escalation's
 * own external_action/ai_engine_notice event has no id captured client-side
 * to chain off, same reasoning logAuditEventsBatch gives for unchained
 * batch writes), and the incident is resolved.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; incidentId: string }> }) {
  const session = await getSession();
  if (!session.whopUserId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id: engagementId, incidentId } = await params;

  let body: { outcomeDetail?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const outcomeDetail = body.outcomeDetail?.trim();
  if (!outcomeDetail) {
    return NextResponse.json({ error: "outcomeDetail is required — describe what happened." }, { status: 400 });
  }

  const [incident] = await db
    .select({ id: repIncidents.id, engagementId: repIncidents.engagementId, status: repIncidents.status })
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

  if (incident.status !== "external_escalation_pending") {
    return NextResponse.json({ error: "This incident isn't awaiting an external escalation outcome." }, { status: 409 });
  }

  await logAuditEvent(engagementId, { eventType: "outcome", payload: { outcomeType: "external_escalation_resolved", outcomeDetail } });

  await db
    .update(repIncidents)
    .set({ status: "resolved", resolvedAt: new Date(), resolvedBy: session.email })
    .where(eq(repIncidents.id, incidentId));

  return NextResponse.json({ ok: true });
}
