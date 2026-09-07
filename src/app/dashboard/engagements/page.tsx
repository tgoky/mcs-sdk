// src/app/dashboard/engagements/page.tsx
//
// Since-audit fix: this used to be a roster — every client in the
// workspace, one row per client, with an "Add Client" button. One
// workspace = one client now (enforced from creation, see
// POST /api/workspaces), so a roster of "every client in the workspace"
// only ever has one row — the multi-client-per-workspace UI shell
// (the list, the empty state, "Add your first client") is exactly the
// leftover the rest of this restructure exists to remove, still
// standing here through every phase of it until now.
//
// Redirects straight to that one client's own detail page instead —
// the real destination this route's only remaining job ever was.

import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getActiveWorkspace, getPrimaryEngagementIdForWorkspace } from "@/lib/workspace";

export const revalidate = 0;

export default async function EngagementsPage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const activeWorkspace = await getActiveWorkspace(whopUserId);
  const engagementId = await getPrimaryEngagementIdForWorkspace(activeWorkspace.workspaceId);

  // Shouldn't happen under the current creation flow (a workspace is
  // never born without its one client), but an older workspace that
  // predates that guarantee, or one whose client was deleted, has
  // nothing to redirect into — Work is the safe fallback rather than a
  // dead end for a route people may still have bookmarked.
  redirect(engagementId ? `/dashboard/engagements/${engagementId}` : "/dashboard");
}
