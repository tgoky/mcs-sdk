import { db } from "@/lib/db";
import { engagements, notifications, skillRuns, projects as projectsTable } from "@/models/schema";
import { getQueueActionableCount } from "@/lib/queue";
import { eq, and, sql, isNull, desc } from "drizzle-orm";
import Link from "next/link";
import { Plus } from "lucide-react";
import { SidebarNavLinks, type NavLinkItem } from "./sidebar-nav-links";

const OVERVIEW_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 8H5L7 4L9 12L11 8H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const INBOX_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 9.5L4.2 3.6C4.4 3.1 4.9 2.75 5.45 2.75H10.55C11.1 2.75 11.6 3.1 11.8 3.6L14 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    <path d="M2 9.5H5.5L6.5 11H9.5L10.5 9.5H14V12.25C14 12.94 13.44 13.5 12.75 13.5H3.25C2.56 13.5 2 12.94 2 12.25V9.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
  </svg>
);

const QUEUE_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="3" width="12" height="2.5" rx="0.75" stroke="currentColor" strokeWidth="1.5"/>
    <rect x="2" y="7" width="12" height="2.5" rx="0.75" stroke="currentColor" strokeWidth="1.5"/>
    <rect x="2" y="11" width="7" height="2.5" rx="0.75" stroke="currentColor" strokeWidth="1.5"/>
  </svg>
);

const EXECUTIONS_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 2L4 9H7.5L6.5 14L12 7H8.5L9 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/**
 * The "Work" section's secondary sidebar. Replaces the old flat SidebarNav
 * (Dashboard/Engagements/Queue/Executions/Analytics/Library/Settings all in
 * one list) — Engagements, Analytics, Skills, and Meetings now live one
 * level up as their own primary-rail sections with their own sidebars (see
 * engagements-sidebar.tsx, analytics-sidebar.tsx, skills-sidebar.tsx,
 * meetings-sidebar.tsx). What's left here is genuinely Work-scoped: the
 * landing overview, the new cross-client Inbox, and the two feeds that
 * used to have primary-rail icons of their own (Queue, Executions).
 *
 * Library and Settings intentionally aren't reproduced here yet — neither
 * fit any of the six new sections cleanly, and guessing at where Anthony
 * wants them relocated risks getting it wrong. They still work at their
 * existing URLs (/dashboard/library, /dashboard/settings); they're just not
 * linked from this sidebar until he says where they should live.
 */
export async function WorkSidebar({ whopUserId }: { whopUserId: string }) {
  const [queueCount, unreadInboxCount, runningCountResult, clientRows, projectRows] = await Promise.all([
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

    db
      .select({ engagementId: engagements.engagementId, buyer: engagements.buyer })
      .from(engagements)
      .where(and(eq(engagements.whopUserId, whopUserId), isNull(engagements.deletedAt)))
      .orderBy(desc(engagements.createdAt))
      .limit(5),

    db
      .select({ id: projectsTable.id, name: projectsTable.name })
      .from(projectsTable)
      .where(and(eq(projectsTable.whopUserId, whopUserId), isNull(projectsTable.deletedAt)))
      .orderBy(desc(projectsTable.createdAt))
      .limit(5),
  ]).catch((err) => {
    // projects table may not exist yet in a DB that hasn't run the new
    // migration (drizzle/migrations/0000_add_projects.sql) — degrade to an
    // empty project list rather than 500ing the whole sidebar on it.
    console.error("[WorkSidebar] query failed, likely missing projects migration:", err);
    return [0, [{ count: 0 }], [{ count: 0 }], [], []] as const;
  });

  const links: NavLinkItem[] = [
    { href: "/dashboard", label: "Overview", icon: OVERVIEW_ICON },
    { href: "/dashboard/inbox", label: "Inbox", icon: INBOX_ICON, count: Number(unreadInboxCount[0]?.count ?? 0) },
  ];

  const executionLinks: NavLinkItem[] = [
    { href: "/dashboard/queue", label: "Queue", icon: QUEUE_ICON, count: queueCount },
    { href: "/dashboard/runs", label: "Executions", icon: EXECUTIONS_ICON, count: Number(runningCountResult[0]?.count ?? 0) },
  ];

  return (
    <div className="flex flex-col gap-1">
      <SidebarNavLinks links={links} />

      <div className="my-2 border-t border-sidebar-border" />

      <SidebarNavLinks links={executionLinks} />

      <div className="my-2 border-t border-sidebar-border" />

      <div className="flex items-center justify-between px-2.5 py-1">
        <Link
          href="/dashboard/projects"
          className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-500 font-mono tracking-wider uppercase hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
        >
          Projects
        </Link>
        <Link
          href="/dashboard/projects/new"
          title="Create project"
          className="p-0.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </Link>
      </div>

      {projectRows.length > 0 ? (
        <nav className="flex flex-col gap-0.5">
          {projectRows.map((project) => (
            <Link
              key={project.id}
              href={`/dashboard/projects/${project.id}`}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/40 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all"
            >
              <span className="w-4 h-4 shrink-0 rounded-[5px] bg-teal-500/90 flex items-center justify-center">
                <svg width="9" height="9" viewBox="0 0 16 16" fill="none">
                  <path d="M2 9L6 13L14 3" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
              <span className="truncate">{project.name}</span>
            </Link>
          ))}
        </nav>
      ) : (
        <p className="px-2.5 py-1 text-xs text-zinc-400 dark:text-zinc-600">
          No projects yet — group clients together to run a custom skill set for them.
        </p>
      )}

      <div className="my-2 border-t border-sidebar-border" />

      <div className="px-2.5 py-1 text-[11px] font-semibold text-zinc-500 dark:text-zinc-500 font-mono tracking-wider uppercase">
        Clients
      </div>
      {clientRows.length > 0 ? (
        <nav className="flex flex-col gap-0.5">
          {clientRows.map((client) => (
            <Link
              key={client.engagementId}
              href={`/dashboard/engagements/${client.engagementId}`}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/40 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all"
            >
              <span className="w-4 h-4 shrink-0 rounded-[5px] bg-teal-500/90 flex items-center justify-center text-[8px] font-bold text-white">
                {client.buyer.slice(0, 1).toUpperCase()}
              </span>
              <span className="truncate">{client.buyer}</span>
            </Link>
          ))}
        </nav>
      ) : (
        <p className="px-2.5 py-1 text-xs text-zinc-400 dark:text-zinc-600">No clients yet.</p>
      )}
    </div>
  );
}

/** Static placeholder shown while WorkSidebar resolves its counts/lists. */
export function WorkSidebarSkeleton() {
  return (
    <div className="flex flex-col gap-1 animate-pulse">
      {["Overview", "Inbox", "Queue", "Executions"].map((label) => (
        <div key={label} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium">
          <div className="w-4 h-4 rounded bg-zinc-200 dark:bg-zinc-800 shrink-0" />
          <span className="text-zinc-300 dark:text-zinc-700">{label}</span>
        </div>
      ))}
    </div>
  );
}
