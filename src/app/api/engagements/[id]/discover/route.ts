import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { seedPrimaryDomainFromUrl } from "@/lib/client-profile";
import { discoverClient } from "@/lib/discover-client";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const activeWorkspace = await getActiveWorkspace(session.whopUserId);

  // Tenant/Workspace Ownership Scope
  const [engagementRow] = await db
    .select({ id: engagements.engagementId })
    .from(engagements)
    .where(
      and(
        eq(engagements.engagementId, id),
        eq(engagements.whopUserId, session.whopUserId),
        eq(engagements.workspaceId, activeWorkspace.workspaceId)
      )
    )
    .limit(1);

  if (!engagementRow) {
    return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  if (body.domain && typeof body.domain === "string" && body.domain.trim()) {
    await seedPrimaryDomainFromUrl(id, body.domain.trim());
  }

  const result = await discoverClient(id);
  return NextResponse.json(result);
}