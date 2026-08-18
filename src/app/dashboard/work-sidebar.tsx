import { db } from "@/lib/db";
import { engagements, notifications, skillRuns } from "@/models/schema";
import { getQueueActionableCount } from "@/lib/queue";
import { getUnseenCompletedExecutionCount } from "@/lib/run-log";
import { eq, and, sql } from "drizzle-orm";
import {
  Home,
  Inbox,
  ListTodo,
  Activity,
  ChevronDown,
} from "lucide-react";
import { SidebarNavLinks, type NavLinkItem } from "./sidebar-nav-links";
import { SkillsNavList } from "@/components/skills-nav-list";

export async function WorkSidebar({ whopUserId, workspaceId }: { whopUserId: string; workspaceId: string }) {
  const [queueCount, unreadInboxCount, runningCountResult, unseenCompletedCount] = await Promise.all([
    getQueueActionableCount(whopUserId, workspaceId),

    db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.whopUserId, whopUserId), eq(notifications.read, false))),

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
  ]).catch((err) => {
    console.error("[WorkSidebar] query failed:", err);
    return [0, [{ count: 0 }], [{ count: 0 }], 0] as const;
  });

  const group1Links: NavLinkItem[] = [
    { href: "/dashboard", label: "Home", icon: <Home className="w-4 h-4" /> },
    { href: "/dashboard/inbox", label: "Notification", icon: <Inbox className="w-4 h-4" />, count: Number(unreadInboxCount[0]?.count ?? 0) },
  ];

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
      {/* SECTION HEADER TITLE */}
      <div className="px-2 pt-1 text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
        Work
      </div>

      {/* GROUP 1: HOME & INBOX */}
      <SidebarNavLinks links={group1Links} />

      <div className="h-px bg-zinc-200/80 dark:bg-zinc-800/80 my-1 mx-1" />

      {/* GROUP 2: QUEUE & EXECUTIONS */}
      <SidebarNavLinks links={group2Links} />

      <div className="h-px bg-zinc-200/80 dark:bg-zinc-800/80 my-1 mx-1" />

      {/* SKILLS SECTION */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 px-2 py-1.5 text-[13px] font-bold text-zinc-700 dark:text-zinc-300 tracking-tight">
          <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
          <span>Installed Skills</span>
        </div>

        <SkillsNavList />
      </div>
    </div>
  );
}

export function WorkSidebarSkeleton() {
  return (
    <div className="flex flex-col gap-1 animate-pulse">
      {["Home", "Inbox", "Queue", "Executions"].map((label) => (
        <div key={label} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium">
          <div className="w-4 h-4 rounded bg-zinc-200 dark:bg-zinc-800 shrink-0" />
          <span className="text-zinc-400 dark:text-zinc-600">{label}</span>
        </div>
      ))}
    </div>
  );
}