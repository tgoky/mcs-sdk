import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { getPipelineAgingPreview } from "@/features/leak-map/server/audit-engine";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Real, read-only preview for Leak-Map's setup screen (Phase 3's
 * "preview-first entry point," extended per this session's own follow-up
 * review — see getPipelineAgingPreview's own doc comment for why this is
 * a real scan, not a mockup, and why it's only meaningful for
 * hubspot/ghl clients). GET only — never writes anything, unlike every
 * other bridge route under this directory.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const activeWorkspace = await getActiveWorkspace(session.whopUserId);

  const [row] = await db
    .select({ stack: engagements.stack })
    .from(engagements)
    .where(
      and(
        eq(engagements.engagementId, id),
        eq(engagements.whopUserId, session.whopUserId),
        eq(engagements.workspaceId, activeWorkspace.workspaceId)
      )
    )
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
  }

  const stack = row.stack as EngagementStack | null;
  const result = await getPipelineAgingPreview(id, stack);
  return NextResponse.json(result);
}
