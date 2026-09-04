import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { deletePitchTarget, logPitchEvent, type PitchHistoryEntry } from "@/features/reputation-manager/server/offensive/pitch-package";

export const runtime = "nodejs";
export const revalidate = 0;

const VALID_EVENT_TYPES: PitchHistoryEntry["type"][] = ["sent", "follow_up", "reply", "placement", "declined"];

async function requireOwnedEngagement(engagementId: string) {
  const session = await getSession();
  if (!session?.whopUserId) return { error: "Unauthorized", status: 401 } as const;

  const activeWorkspace = await getActiveWorkspace(session.whopUserId);
  const [row] = await db
    .select({ engagementId: engagements.engagementId })
    .from(engagements)
    .where(
      and(
        eq(engagements.engagementId, engagementId),
        eq(engagements.whopUserId, session.whopUserId),
        eq(engagements.workspaceId, activeWorkspace.workspaceId)
      )
    )
    .limit(1);

  if (!row) return { error: "Engagement not found or access denied", status: 404 } as const;
  return { ok: true } as const;
}

/** Logs an outreach event against this target (sent/follow_up/reply/placement/declined). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; targetId: string }> }) {
  try {
    const { id, targetId } = await params;
    const access = await requireOwnedEngagement(id);
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

    const body = await req.json().catch(() => ({}));
    if (!VALID_EVENT_TYPES.includes(body?.type)) {
      return NextResponse.json({ error: `type must be one of: ${VALID_EVENT_TYPES.join(", ")}` }, { status: 400 });
    }

    const target = await logPitchEvent(id, targetId, { type: body.type, note: typeof body.note === "string" ? body.note : null });
    return NextResponse.json({ target });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; targetId: string }> }) {
  const { id, targetId } = await params;
  const access = await requireOwnedEngagement(id);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

  await deletePitchTarget(id, targetId);
  return NextResponse.json({ ok: true });
}
