import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { getRedditRamp, confirmRedditHandle, computeRampPhase } from "@/features/reputation-manager/server/offensive/reddit-ramp";

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

  const ramp = await getRedditRamp(id);
  const phase = computeRampPhase(ramp?.startedAt ?? null);

  return NextResponse.json({ ramp, phase });
}

/** Confirms/locks the Reddit handle and starts the 90-day clock (if not already running). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const access = await requireOwnedEngagement(id);
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

    const body = await req.json().catch(() => ({}));
    if (typeof body?.handle !== "string" || !body.handle.trim()) {
      return NextResponse.json({ error: "handle is required." }, { status: 400 });
    }

    const ramp = await confirmRedditHandle(id, body.handle);
    return NextResponse.json({ ramp });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
