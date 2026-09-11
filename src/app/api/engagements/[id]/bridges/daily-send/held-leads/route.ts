import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { listHeldLeads, releaseHeldLead } from "@/features/cold-open/server/held-leads";

export const runtime = "nodejs";
export const revalidate = 0;

async function requireEngagement(id: string) {
  const session = await getSession();
  if (!session?.whopUserId) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const activeWorkspace = await getActiveWorkspace(session.whopUserId);

  const [row] = await db
    .select({ engagementId: engagements.engagementId })
    .from(engagements)
    .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session.whopUserId), eq(engagements.workspaceId, activeWorkspace.workspaceId)))
    .limit(1);

  if (!row) return { error: NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 }) };
  return { error: null };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireEngagement(id);
  if (error) return error;

  const leads = await listHeldLeads(id);
  return NextResponse.json({ leads });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { error } = await requireEngagement(id);
    if (error) return error;

    const body = await req.json().catch(() => null);
    const leadId = typeof body?.leadId === "string" ? body.leadId : null;
    const action = body?.action === "approve" || body?.action === "discard" ? body.action : null;
    if (!leadId || !action) {
      return NextResponse.json({ error: "leadId and action ('approve' | 'discard') are required." }, { status: 400 });
    }

    const result = await releaseHeldLead(id, leadId, action);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[engagements/[id]/bridges/daily-send/held-leads]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
