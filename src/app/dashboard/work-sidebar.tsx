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
  ChevronDown,
} from "lucide-react";
import { SidebarNavLinks, type NavLinkItem } from "./sidebar-nav-links";
import { SkillsNavList } from "@/components/skills-nav-list";
import { getInstalledPackagesByWorkspace } from "@/lib/workspace";
import type { ProductId } from "@/lib/product-catalog";

export async function WorkSidebar({ whopUserId, workspaceId }: { whopUserId: string; workspaceId: string }) {
  const [queueCount, runningCountResult, unseenCompletedCount, installedPackageMap] = await Promise.all([
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
  ]).catch((err) => {
    console.error("[WorkSidebar] query failed:", err);
    return [0, [{ count: 0 }], 0, new Map<string, string[]>()] as const;
  });
  const installedProductIds = (installedPackageMap.get(workspaceId) ?? []).filter(
    (id): id is ProductId => id === "showtime" || id === "reputation-manager"
  );

  // Fix (2026-08-25): was "Notification" → /dashboard/inbox with an
  // unread-count badge. Replaced per direct request with Reports — the
  // per-client quality-breakdown page (report-service.ts + report-notes.ts).
  // /dashboard/inbox itself is untouched and still reachable directly;
  // FYI/alert items also still surface in Queue below via getQueueItems'
  // notification source, so nothing that used to only live in the inbox
  // becomes unreachable.
  const group1Links: NavLinkItem[] = [
    { href: "/dashboard", label: "Home", icon: <Home className="w-4 h-4" /> },
    // Every client in the workspace, regardless of which product(s) it's
    // enrolled in — the combined view Showtime's and Reputation Manager's
    // own (product-scoped) Clients links don't show. Same route as
    // theirs, just without a `product` param — see engagements/page.tsx.
    { href: "/dashboard/engagements", label: "Clients", icon: <Building2 className="w-4 h-4" /> },
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

      {/* SKILLS SECTION */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 px-2 py-1.5 text-[13px] font-bold text-zinc-600 dark:text-zinc-300 tracking-tight">
          <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
          <span>Installed Skills</span>
        </div>

        <SkillsNavList productIds={installedProductIds} />
      </div>
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
