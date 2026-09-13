import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, whopAgentConnections } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { connectWhopAccount, markWhopDisconnected } from "@/features/whop-agent/server/connect-service";

export const runtime = "nodejs";
export const revalidate = 0;

async function loadOwnedEngagement(engagementId: string, whopUserId: string, workspaceId: string) {
  const [row] = await db
    .select({ engagementId: engagements.engagementId })
    .from(engagements)
    .where(and(eq(engagements.engagementId, engagementId), eq(engagements.whopUserId, whopUserId), eq(engagements.workspaceId, workspaceId)))
    .limit(1);
  return row;
}

/** Connect state for the Whop Agent hinges panel — what's connected, what
 * unlocked, whether a pin is validated. Never returns the key itself
 * (credentials.ts has no "read back the plaintext" path at all). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const activeWorkspace = await getActiveWorkspace(session.whopUserId);

  const engagement = await loadOwnedEngagement(id, session.whopUserId, activeWorkspace.workspaceId);
  if (!engagement) {
    return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
  }

  const [connection] = await db.select().from(whopAgentConnections).where(eq(whopAgentConnections.engagementId, id)).limit(1);

  if (!connection) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: !connection.disconnectedAt,
    credentialType: connection.credentialType,
    whopAccountId: connection.whopAccountId,
    scopeProbeResults: connection.scopeProbeResults,
    lastScopeProbeAt: connection.lastScopeProbeAt,
    pinnedVersionDate: connection.pinnedVersionDate,
    circuitBreakerState: connection.circuitBreakerState,
    circuitBreakerReason: connection.circuitBreakerReason,
  });
}

/** Runs the connect flow (Section 2.3-2.6) against a freshly-pasted key. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);
    const engagement = await loadOwnedEngagement(id, session.whopUserId, activeWorkspace.workspaceId);
    if (!engagement) {
      return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    if (typeof body?.apiKey !== "string" || !body.apiKey.trim()) {
      return NextResponse.json({ error: "apiKey is required." }, { status: 400 });
    }

    const result = await connectWhopAccount(id, body.apiKey);
    if (!result.ok) {
      return NextResponse.json({ error: result.error, runId: result.runId, probe: result.probe }, { status: 422 });
    }
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to connect Whop account.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Section 2.7 disconnect — credential + connection-state teardown. Webhook
 * subscription teardown (agent-created only) runs separately in the
 * webhook subsystem, triggered from the same handler once it exists. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const activeWorkspace = await getActiveWorkspace(session.whopUserId);
  const engagement = await loadOwnedEngagement(id, session.whopUserId, activeWorkspace.workspaceId);
  if (!engagement) {
    return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
  }

  await markWhopDisconnected(id);
  return NextResponse.json({ disconnected: true });
}
