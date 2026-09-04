import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { computeKarmaGateStatus } from "@/features/reputation-manager/server/offensive/reddit-ramp";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * A pure calculation over operator-reported numbers (this app doesn't hold
 * Reddit credentials for the operator's personal account — see
 * reddit-ramp.ts's file comment) — a GET endpoint rather than a client-side
 * import so the UI doesn't need to pull a db-touching server module into
 * its bundle just for one pure function.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.whopUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const activeWorkspace = await getActiveWorkspace(session.whopUserId);
  const [row] = await db
    .select({ engagementId: engagements.engagementId })
    .from(engagements)
    .where(
      and(
        eq(engagements.engagementId, id),
        eq(engagements.whopUserId, session.whopUserId),
        eq(engagements.workspaceId, activeWorkspace.workspaceId)
      )
    )
    .limit(1);
  if (!row) return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });

  const url = new URL(req.url);
  const karma = Number(url.searchParams.get("karma"));
  const accountAgeDays = Number(url.searchParams.get("accountAgeDays"));
  if (!Number.isFinite(karma) || !Number.isFinite(accountAgeDays)) {
    return NextResponse.json({ error: "karma and accountAgeDays query params must be numbers." }, { status: 400 });
  }

  return NextResponse.json({ status: computeKarmaGateStatus(karma, accountAgeDays) });
}
