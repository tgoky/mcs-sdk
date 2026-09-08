import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { isAdminEmail, isAuthorizedForEngagement } from "@/lib/whop-access";
import { db } from "@/lib/db";
import { engagements, repIncidents } from "@/models/schema";
import { and, eq, ne } from "drizzle-orm";

/**
 * The missing dashboard action repIncidents.status's own column comment
 * calls out: "acknowledged"/"resolved" were reachable states with nothing
 * that ever wrote them, so a declared incident sat at "open" forever. This
 * is the real close-out action — also what makes the reputation-crisis
 * send gate (worker-blocking-conditions.ts) mean something: it only
 * checks status === "open", so resolving here is what lets an operator
 * actually clear it and resume normal outbound activity.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; incidentId: string }> }
) {
  const session = await getSession();
  if (!session.whopUserId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id: engagementId, incidentId } = await params;

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

  if (incident.status === "resolved") {
    return NextResponse.json({ ok: true, alreadyResolved: true });
  }

  await db
    .update(repIncidents)
    .set({ status: "resolved", resolvedAt: new Date(), resolvedBy: session.email })
    .where(and(eq(repIncidents.id, incidentId), ne(repIncidents.status, "resolved")));

  return NextResponse.json({ ok: true });
}
