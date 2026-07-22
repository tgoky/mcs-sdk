import { db } from "@/lib/db";
import { engagements, credentialsRefs } from "@/models/schema";
import { getQueueActionableCount } from "@/lib/queue";
import { eq } from "drizzle-orm";
import Link from "next/link";

interface NavLinkDef {
  href: string;
  label: string;
  icon: React.ReactNode;
}

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

const CREDENTIALS_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 6V4.5C3 2.01472 5.01472 0 7.5 0C9.98528 0 12 2.01472 12 4.5V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <rect x="1" y="6" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.5"/>
    <circle cx="8" cy="10.5" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M8 10.5V13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const QUEUE_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="3" width="12" height="2.5" rx="0.75" stroke="currentColor" strokeWidth="1.5"/>
    <rect x="2" y="7" width="12" height="2.5" rx="0.75" stroke="currentColor" strokeWidth="1.5"/>
    <rect x="2" y="11" width="7" height="2.5" rx="0.75" stroke="currentColor" strokeWidth="1.5"/>
  </svg>
);

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto shrink-0 min-w-[18px] text-center px-1.5 py-[1px] rounded-full text-[10px] font-mono font-bold bg-gold/15 text-gold-hover dark:text-gold">
      {count}
    </span>
  );
}

/**
 * The sidebar's primary nav. Pulled out of DashboardLayout (same reasoning
 * as SidebarSkills below it): the counts each need a DB round trip, and
 * this is a shared ancestor for every /dashboard/* route, so those queries
 * shouldn't block the logo/sign-out/theme-toggle shell from painting.
 *
 * Queue previously had a full page (/dashboard/queue) and a badge-count
 * helper (getQueueActionableCount) with nothing in the sidebar linking to
 * either — this is the missing nav entry.
 */
export async function SidebarNav({ whopUserId }: { whopUserId: string }) {
  const [engagementRows, credentialRows, queueCount] = await Promise.all([
    db
      .select({ engagementId: engagements.engagementId })
      .from(engagements)
      .where(eq(engagements.whopUserId, whopUserId)),

    db
      .select({ id: credentialsRefs.id })
      .from(credentialsRefs)
      .innerJoin(engagements, eq(credentialsRefs.engagementId, engagements.engagementId))
      .where(eq(engagements.whopUserId, whopUserId)),

    getQueueActionableCount(whopUserId),
  ]);

  const links: (NavLinkDef & { count?: number })[] = [
    { href: "/dashboard", label: "Dashboard", icon: DASHBOARD_ICON },
    { href: "/dashboard/engagements", label: "Engagements", icon: ENGAGEMENTS_ICON, count: engagementRows.length },
    { href: "/dashboard/credentials", label: "Credentials", icon: CREDENTIALS_ICON, count: credentialRows.length },
    { href: "/dashboard/queue", label: "Queue", icon: QUEUE_ICON, count: queueCount },
  ];

  return (
    <nav className="flex flex-col space-y-0.5">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="flex items-center gap-2.5 px-2 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/40 dark:hover:bg-zinc-900/30 transition-all rounded group font-medium"
        >
          <span className="text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors">
            {link.icon}
          </span>
          <span>{link.label}</span>
          {link.count !== undefined && <CountBadge count={link.count} />}
        </Link>
      ))}
    </nav>
  );
}

/** Static placeholder shown while SidebarNav resolves its counts. */
export function SidebarNavSkeleton() {
  const links = [
    { label: "Dashboard", icon: DASHBOARD_ICON },
    { label: "Engagements", icon: ENGAGEMENTS_ICON },
    { label: "Credentials", icon: CREDENTIALS_ICON },
    { label: "Queue", icon: QUEUE_ICON },
  ];
  return (
    <nav className="flex flex-col space-y-0.5">
      {links.map((link) => (
        <div key={link.label} className="flex items-center gap-2.5 px-2 py-2 text-sm font-medium">
          <span className="text-zinc-400 dark:text-zinc-500">{link.icon}</span>
          <span className="text-zinc-600 dark:text-zinc-400">{link.label}</span>
        </div>
      ))}
    </nav>
  );
}
