import { db } from "@/lib/db";
import { engagements, notifications, skillRuns, projects as projectsTable } from "@/models/schema";
import { getQueueActionableCount } from "@/lib/queue";
import { getUnseenCompletedExecutionCount } from "@/lib/run-log";
import { eq, and, sql, isNull, desc } from "drizzle-orm";
import Link from "next/link";
import {
  Home,
  Inbox,
  ListTodo,
  Activity,
  FolderKanban,
  ChevronDown,
  Plus,
} from "lucide-react";
import { SidebarNavLinks, type NavLinkItem } from "./sidebar-nav-links";
import { ClientSidebarList } from "./client-sidebar-list";

export async function WorkSidebar({ whopUserId }: { whopUserId: string }) {
  const [queueCount, unreadInboxCount, runningCountResult, unseenCompletedCount, clientRows] = await Promise.all([
    getQueueActionableCount(whopUserId),

    db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.whopUserId, whopUserId), eq(notifications.read, false))),

    db
      .select({ count: sql<number>`count(*)` })
      .from(skillRuns)
      .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
      .where(and(eq(engagements.whopUserId, whopUserId), eq(skillRuns.status, "running"))),

    getUnseenCompletedExecutionCount(whopUserId),

    db
      .select({ engagementId: engagements.engagementId, buyer: engagements.buyer, tagColor: engagements.tagColor })
      .from(engagements)
      .where(and(eq(engagements.whopUserId, whopUserId), isNull(engagements.deletedAt)))
      .orderBy(desc(engagements.createdAt))
      .limit(10),
  ]).catch((err) => {
    console.error("[WorkSidebar] query failed:", err);
    return [0, [{ count: 0 }], [{ count: 0 }], 0, []] as const;
  });

  // Group 1: Home & Inbox
  const group1Links: NavLinkItem[] = [
    { href: "/dashboard", label: "Home", icon: <Home className="w-4 h-4" /> },
    { href: "/dashboard/inbox", label: "Inbox", icon: <Inbox className="w-4 h-4" />, count: Number(unreadInboxCount[0]?.count ?? 0) },
  ];

  // Group 2: Queue, Executions, Projects
  const group2Links: NavLinkItem[] = [
    { href: "/dashboard/queue", label: "Queue", icon: <ListTodo className="w-4 h-4" />, count: queueCount },
    {
      href: "/dashboard/runs",
      label: "Executions",
      icon: <Activity className="w-4 h-4" />,
      count: Number(runningCountResult[0]?.count ?? 0),
      live: true,
      // See LiveCountBadge's unseenCompleted doc — a run finishing between
      // glances used to leave this badge back at 0 with no trace anything
      // happened. This is the initial value only; the badge keeps polling
      // both numbers from there.
      unseenCount: unseenCompletedCount,
    },
    { href: "/dashboard/projects", label: "Projects", icon: <FolderKanban className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col space-y-3 font-sans antialiased text-zinc-300">
      {/* GROUP 1: HOME & INBOX */}
      <SidebarNavLinks links={group1Links} />

      <div className="h-px bg-zinc-800/80 my-1 mx-1" />

      {/* GROUP 2: QUEUE, EXECUTIONS, PROJECTS */}
      <SidebarNavLinks links={group2Links} />

      <div className="h-px bg-zinc-800/80 my-1 mx-1" />

      {/* CLIENTS SECTION */}
      <div className="space-y-1">
        <div className="flex items-center justify-between px-2 py-1.5 group">
          <div className="flex items-center gap-1.5 text-[13px] font-bold text-zinc-300 tracking-tight">
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
            <span>Clients</span>
          </div>

          <Link
            href="/dashboard/engagements/new"
            title="Add client"
            className="p-1 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
          </Link>
        </div>

        {/* CLIENTS LIST — inline rename + tag-color picker, see client-sidebar-list.tsx */}
        <ClientSidebarList clients={clientRows} />
      </div>
    </div>
  );
}

/** Static placeholder shown while WorkSidebar resolves its counts/lists. */
export function WorkSidebarSkeleton() {
  return (
    <div className="flex flex-col gap-1 animate-pulse">
      {["Home", "Inbox", "Queue", "Executions", "Projects"].map((label) => (
        <div key={label} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium">
          <div className="w-4 h-4 rounded bg-zinc-800 shrink-0" />
          <span className="text-zinc-600">{label}</span>
        </div>
      ))}
    </div>
  );
}