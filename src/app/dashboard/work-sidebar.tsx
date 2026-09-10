import { db } from "@/lib/db";
import { engagements, skillRuns } from "@/models/schema";
import { getQueueActionableCount } from "@/lib/queue";
import { getUnseenCompletedExecutionCount } from "@/lib/run-log";
import { eq, and, sql } from "drizzle-orm";
import {
  Home,
  FileText,
  ListTodo,
  Activity,
  Building2,
} from "lucide-react";
import { SidebarNavLinks, type NavLinkItem } from "./sidebar-nav-links";
import { SkillsNavList } from "@/components/skills-nav-list";
import { getInstalledPackagesByWorkspace, getPrimaryEngagementIdForWorkspace } from "@/lib/workspace";
import { getEnabledWorkerIdsForEngagement } from "@/lib/engagement-skills";
import { getWorkspaceWorkerOverview } from "@/lib/worker-analytics";
import { isProductId } from "@/lib/product-catalog";
import type { WorkerId } from "@/lib/worker-registry";

export async function WorkSidebar({ whopUserId, workspaceId }: { whopUserId: string; workspaceId: string }) {
  const [queueCount, runningCountResult, unseenCompletedCount, installedPackageMap, primaryEngagementId, workerOverview] = await Promise.all([
    getQueueActionableCount(whopUserId, workspaceId),

    db
      .select({ count: sql<number>`count(*)` })
      .from(skillRuns)
      .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
      .where(
        and(
          eq(engagements.whopUserId, whopUserId),
          eq(engagements.workspaceId, workspaceId),
          eq(skillRuns.status, "running")
        )
      ),

    getUnseenCompletedExecutionCount(whopUserId),

    getInstalledPackagesByWorkspace([workspaceId]),

    getPrimaryEngagementIdForWorkspace(workspaceId),

    // Since-audit merge: this used to be a separate "Active Workers" panel
    // on the dashboard home, duplicating this exact grid's job (a second
    // surface answering "what's enabled for this client," the same
    // problem this whole restructure exists to remove). Its weekly-runs/
    // needs-attention stat now folds into these same tiles instead.
    getWorkspaceWorkerOverview(whopUserId, workspaceId),
  ]).catch((err) => {
    console.error("[WorkSidebar] query failed:", err);
    return [0, [{ count: 0 }], 0, new Map<string, string[]>(), null, { totalClients: 0, workers: [], windowDays: 7 }] as const;
  });
  // Fix: this used to only recognize "showtime"/"reputation-manager" —
  // Cold Open (a real installable product, see product-catalog.ts) was
  // silently filtered out, so a Cold Open workspace's sidebar "Enabled
  // Skills" grid always rendered empty no matter what was actually on.
  const installedProductIds = (installedPackageMap.get(workspaceId) ?? []).filter(isProductId);

  // The Capabilities grid's whole job is "jump straight into something
  // already running for this client" — it should show what's enabled, not
  // the full catalog with color-coding bolted on to compensate (that's the
  // Library's job). See getEnabledWorkerIdsForEngagement's own comment for
  // how it reconciles that with engagements that predate explicit enable
  // tracking.
  const enabledWorkerIds: WorkerId[] = primaryEngagementId
    ? await getEnabledWorkerIdsForEngagement(primaryEngagementId).catch((err) => {
        console.error("[WorkSidebar] getEnabledWorkerIdsForEngagement failed:", err);
        return [];
      })
    : [];
  const needsAttentionWorkerIds = new Set(
    workerOverview.workers.filter((w) => w.needsAttention > 0).map((w) => w.workerId)
  );

  // Fix (2026-08-25): was "Notification" → /dashboard/inbox with an
  // unread-count badge. Replaced per direct request with Reports — the
  // per-client quality-breakdown page (report-service.ts + report-notes.ts).
  // /dashboard/inbox itself is untouched and still reachable directly;
  // FYI/alert items also still surface in Queue below via getQueueItems'
  // notification source, so nothing that used to only live in the inbox
  // becomes unreachable.
  //
  // Since-audit fix: this used to say "Clients" (plural) and point at
  // /dashboard/engagements, a roster — one workspace is one client now,
  // so there's nothing to list. Points straight at this workspace's one
  // client's own page instead, and only renders if that client exists
  // (should always be true post-creation, but this sidebar is fetched
  // independently of that guarantee holding for every workspace already
  // in the database).
  const group1Links: NavLinkItem[] = [
    { href: "/dashboard", label: "Home", icon: <Home className="w-4 h-4" /> },
    ...(primaryEngagementId
      ? [{ href: `/dashboard/engagements/${primaryEngagementId}`, label: "Client Profile", icon: <Building2 className="w-4 h-4" /> }]
      : []),
    { href: "/dashboard/reports", label: "Reports", icon: <FileText className="w-4 h-4" /> },
  ];

  // Group 2: Queue & Executions
  const group2Links: NavLinkItem[] = [
    { href: "/dashboard/queue", label: "Queue", icon: <ListTodo className="w-4 h-4" />, count: queueCount },
    {
      href: "/dashboard/runs",
      label: "Executions",
      icon: <Activity className="w-4 h-4" />,
      count: Number(runningCountResult[0]?.count ?? 0),
      live: true,
      unseenCount: unseenCompletedCount,
    },
  ];

  return (
    <div className="flex flex-col space-y-3 font-sans antialiased text-zinc-700 dark:text-zinc-300">
      {/* GROUP 1: HOME & REPORTS */}
      <SidebarNavLinks links={group1Links} />

      <div className="h-px bg-zinc-200/80 dark:bg-zinc-800/80 my-1 mx-1" />

      {/* GROUP 2: QUEUE & EXECUTIONS */}
      <SidebarNavLinks links={group2Links} />

      <div className="h-px bg-zinc-200/80 dark:bg-zinc-800/80 my-1 mx-1" />

      {/* INSTALLED SKILLS SECTION — owns its own header (collapse toggle +
          shortcut into the Library), see skills-nav-list.tsx */}
      <SkillsNavList
        productIds={installedProductIds}
        layout="grid"
        enabledWorkerIds={enabledWorkerIds}
        needsAttentionWorkerIds={needsAttentionWorkerIds}
        engagementId={primaryEngagementId}
      />
    </div>
  );
}

/** Static placeholder shown while WorkSidebar resolves its counts/lists. */
export function WorkSidebarSkeleton() {
  return (
    <div className="flex flex-col gap-1 animate-pulse">
      {["Home", "Reports", "Queue", "Executions"].map((label) => (
        <div key={label} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium">
          <div className="w-4 h-4 rounded bg-zinc-200 dark:bg-zinc-800 shrink-0" />
          <span className="text-zinc-400 dark:text-zinc-600">{label}</span>
        </div>
      ))}
    </div>
  );
}
