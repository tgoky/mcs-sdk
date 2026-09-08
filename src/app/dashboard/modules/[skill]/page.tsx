// src/app/dashboard/modules/[skill]/page.tsx
//
// Since-audit fix: this used to render ModuleClientRoster — a roster of
// every client with this skill enabled, plus (for 5 Showtime skills) an
// "Activity" tab showing a run-execution log with cancel/retry/dismiss
// actions. One workspace = one client now, so the roster was always a
// list of exactly one — and the run-execution log it hid behind a tab
// click is the exact same thing the engagement page's own Run History
// section already provides for that one client (same cancel/retry/
// dismiss actions, via run-row-actions.tsx), just always visible instead
// of needing a second page to reach it.
//
// Redirects straight to that: the one client's engagement page, run
// history pre-filtered to this skill via the same `?skill=` param its
// own filter chips use, scrolled to the right section. worker-registry's
// workerPrimaryHref is the single source of truth for this — Capabilities
// links straight there now and never routes through this page at all,
// but this route stays as a redirect (not deleted) for anything still
// bookmarked or linked to it.

import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { getActiveWorkspace, getPrimaryEngagementIdForWorkspace } from "@/lib/workspace";
import { isWorkerId, workerPrimaryHref } from "@/lib/worker-registry";

export default async function ModulePage({ params }: { params: Promise<{ skill: string }> }) {
  const { skill } = await params;
  if (!isWorkerId(skill)) notFound();

  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const activeWorkspace = await getActiveWorkspace(whopUserId);
  const engagementId = await getPrimaryEngagementIdForWorkspace(activeWorkspace.workspaceId);

  redirect(engagementId ? workerPrimaryHref(skill, engagementId) : "/dashboard");
}
