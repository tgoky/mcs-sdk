import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listWorkspaces, getPrimaryEngagementIdsForWorkspaces } from "@/lib/workspace";
import { getEnabledWorkerIdsForEngagement } from "@/lib/engagement-skills";

export const runtime = "nodejs";

export interface WorkspaceSummary {
  workspaceId: string;
  skillCount: number;
}

/**
 * Per-workspace "N skills enabled" counts for the primary rail's client
 * switcher — deliberately its own lazy-loaded endpoint rather than
 * something layout.tsx fetches on every request. Every /dashboard
 * navigation re-renders the layout, and getEnabledWorkerIdsForEngagement
 * is a real 4-query lookup per engagement (see its own doc) — eagerly
 * running that for every workspace in the account on every page load
 * would scale badly for an account with many clients, for data the
 * switcher only needs the moment it's actually opened.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceList = await listWorkspaces(session.whopUserId);
  const engagementIdByWorkspace = await getPrimaryEngagementIdsForWorkspaces(workspaceList.map((w) => w.workspaceId));

  const summaries: WorkspaceSummary[] = await Promise.all(
    workspaceList.map(async (w) => {
      const engagementId = engagementIdByWorkspace.get(w.workspaceId);
      if (!engagementId) return { workspaceId: w.workspaceId, skillCount: 0 };
      const enabled = await getEnabledWorkerIdsForEngagement(engagementId);
      return { workspaceId: w.workspaceId, skillCount: enabled.length };
    })
  );

  return NextResponse.json({ summaries });
}
