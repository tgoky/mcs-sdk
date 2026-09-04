import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { getChecklist, setChecklistItem, type OffensiveMove } from "@/features/reputation-manager/server/offensive/checklist";

export const runtime = "nodejs";
export const revalidate = 0;

function isMove(value: string): value is OffensiveMove {
  return value === "a" || value === "b" || value === "c";
}

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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; move: string }> }) {
  const { id, move } = await params;
  if (!isMove(move)) return NextResponse.json({ error: `Unknown move: ${move}` }, { status: 400 });

  const access = await requireOwnedEngagement(id);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

  const items = await getChecklist(id, move);
  return NextResponse.json({ items });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string; move: string }> }) {
  try {
    const { id, move } = await params;
    if (!isMove(move)) return NextResponse.json({ error: `Unknown move: ${move}` }, { status: 400 });

    const access = await requireOwnedEngagement(id);
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

    const body = await req.json().catch(() => ({}));
    if (typeof body?.itemKey !== "string" || typeof body?.completed !== "boolean") {
      return NextResponse.json({ error: "itemKey (string) and completed (boolean) are required." }, { status: 400 });
    }

    await setChecklistItem(id, move, body.itemKey, body.completed);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
