import { db } from "@/lib/db";
import { engagements, credentialsRefs, skillRuns } from "@/models/schema";
import { getQueueActionableCount } from "@/lib/queue";
import { getActiveWorkspace } from "@/lib/workspace";
import { eq, and, sql } from "drizzle-orm";
import { SidebarNavLinks, type NavLinkItem } from "./sidebar-nav-links";

const DASHBOARD_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 8H5L7 4L9 12L11 8H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const ENGAGEMENTS_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M10 7C10 4.79086 8.20914 3 6 3C3.79086 3 2 4.79086 2 7V13H10V7Z" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M10 10H14V7C14 5.34315 12.6569 4 11 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx="11.5" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
  </svg>
);

const SETTINGS_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8" cy="8" r="2.25" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M8 1.5V3M8 13V14.5M14.5 8H13M3 8H1.5M12.36 3.64L11.3 4.7M4.7 11.3L3.64 12.36M12.36 12.36L11.3 11.3M4.7 4.7L3.64 3.64" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const ANALYTICS_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 14V2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M2 14H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <rect x="4.5" y="8.5" width="2" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.5"/>
    <rect x="8" y="5.5" width="2" height="7" rx="0.5" stroke="currentColor" strokeWidth="1.5"/>
    <rect x="11.5" y="3" width="2" height="9.5" rx="0.5" stroke="currentColor" strokeWidth="1.5"/>
  </svg>
);

const LIBRARY_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 3C2 2.44772 2.44772 2 3 2H6.5C7.32843 2 8 2.67157 8 3.5V14C8 13.4477 7.55228 13 7 13H2V3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    <path d="M14 3C14 2.44772 13.5523 2 13 2H9.5C8.67157 2 8 2.67157 8 3.5V14C8 13.4477 8.44772 13 9 13H14V3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
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

export async function SidebarNav({ whopUserId }: { whopUserId: string }) {
  const activeWorkspace = await getActiveWorkspace(whopUserId);

  const [engagementRows, credentialRows, queueCount, runningCountResult] = await Promise.all([
    db
      .select({ engagementId: engagements.engagementId })
      .from(engagements)
      .where(
        and(
          eq(engagements.whopUserId, whopUserId),
          eq(engagements.workspaceId, activeWorkspace.workspaceId)
        )
      ),

    db
      .select({ id: credentialsRefs.id })
      .from(credentialsRefs)
      .innerJoin(engagements, eq(credentialsRefs.engagementId, engagements.engagementId))
      .where(
        and(
          eq(engagements.whopUserId, whopUserId),
          eq(engagements.workspaceId, activeWorkspace.workspaceId)
        )
      ),

    getQueueActionableCount(whopUserId, activeWorkspace.workspaceId),

    db
      .select({ count: sql<number>`count(*)` })
      .from(skillRuns)
      .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
      .where(
        and(
          eq(engagements.whopUserId, whopUserId),
          eq(engagements.workspaceId, activeWorkspace.workspaceId),
          eq(skillRuns.status, "running")
        )
      ),
  ]);

  const runningCount = Number(runningCountResult[0]?.count ?? 0);

  const links: NavLinkItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: DASHBOARD_ICON },
    { href: "/dashboard/engagements", label: "Engagements", icon: ENGAGEMENTS_ICON, count: engagementRows.length },
    { href: "/dashboard/queue", label: "Queue", icon: QUEUE_ICON, count: queueCount },
    { href: "/dashboard/runs", label: "Executions", icon: EXECUTIONS_ICON, count: runningCount },
    { href: "/dashboard/analytics", label: "Analytics", icon: ANALYTICS_ICON },
    { href: "/dashboard/library", label: "Library", icon: LIBRARY_ICON },
    { href: "/dashboard/settings", label: "Settings", icon: SETTINGS_ICON, count: credentialRows.length },
  ];

  return <SidebarNavLinks links={links} />;
}

export function SidebarNavSkeleton() {
  const links = [
    { label: "Dashboard", icon: DASHBOARD_ICON },
    { label: "Engagements", icon: ENGAGEMENTS_ICON },
    { label: "Queue", icon: QUEUE_ICON },
    { label: "Executions", icon: EXECUTIONS_ICON },
    { label: "Analytics", icon: ANALYTICS_ICON },
    { label: "Library", icon: LIBRARY_ICON },
    { label: "Settings", icon: SETTINGS_ICON },
  ];
  return (
    <nav className="flex flex-col gap-0.5">
      {links.map((link) => (
        <div key={link.label} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium">
          <span className="text-zinc-400 dark:text-zinc-500">{link.icon}</span>
          <span className="text-zinc-600 dark:text-zinc-400">{link.label}</span>
        </div>
      ))}
    </nav>
  );
}