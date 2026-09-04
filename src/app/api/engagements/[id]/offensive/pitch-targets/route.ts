import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { listPitchTargets, createPitchTarget } from "@/features/reputation-manager/server/offensive/pitch-package";

export const runtime = "nodejs";
export const revalidate = 0;

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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireOwnedEngagement(id);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

  const targets = await listPitchTargets(id);
  return NextResponse.json({ targets });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const access = await requireOwnedEngagement(id);
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

    const body = await req.json().catch(() => ({}));
    const target = await createPitchTarget(id, {
      target: typeof body.target === "string" ? body.target : "",
      beat: typeof body.beat === "string" ? body.beat : null,
      contact: typeof body.contact === "string" ? body.contact : null,
      channel: typeof body.channel === "string" ? body.channel : null,
      fitNotes: typeof body.fitNotes === "string" ? body.fitNotes : null,
    });

    return NextResponse.json({ target });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
