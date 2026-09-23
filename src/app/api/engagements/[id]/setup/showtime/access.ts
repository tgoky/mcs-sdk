// Shared access check for the Showtime setup routes: signed in, the client
// is theirs and in their active workspace, and Showtime is installed there.

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace, isPackageInstalledInWorkspace } from "@/lib/workspace";

export type SetupAccess =
  | { ok: true; workspaceId: string; whopUserId: string; buyer: string }
  | { ok: false; response: NextResponse };

export async function authorizeShowtimeSetup(engagementId: string, opts: { requireInstalled?: boolean } = {}): Promise<SetupAccess> {
  const session = await getSession();
  if (!session?.whopUserId) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const workspace = await getActiveWorkspace(session.whopUserId);
  const [row] = await db
    .select({ buyer: engagements.buyer })
    .from(engagements)
    .where(
      and(
        eq(engagements.engagementId, engagementId),
        eq(engagements.whopUserId, session.whopUserId),
        eq(engagements.workspaceId, workspace.workspaceId)
      )
    )
    .limit(1);
  if (!row) {
    return { ok: false, response: NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 }) };
  }
  if (opts.requireInstalled && !(await isPackageInstalledInWorkspace(workspace.workspaceId, "showtime"))) {
    return { ok: false, response: NextResponse.json({ error: "Install Showtime before setting it up for a client." }, { status: 403 }) };
  }
  return { ok: true, workspaceId: workspace.workspaceId, whopUserId: session.whopUserId, buyer: row.buyer };
}
