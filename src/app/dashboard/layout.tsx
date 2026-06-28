import { ReactNode } from "react";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { engagements, skillRuns } from "@/models/schema";
import { eq, desc } from "drizzle-orm";
import { MobileNav } from "./mobile-nav";
import Link from "next/link";

const SKILLS = [
  "pin-down",
  "pile-on",
  "pre-call-read",
  "win-back",
  "leak-map",
] as const;

type SkillName = (typeof SKILLS)[number];
type SkillStatus = "live" | "failed" | "not_run";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getSession();
  if (!session.whopUserId) {
    redirect("/api/auth/login");
  }

  const userEngagements = await db
    .select({ engagementId: engagements.engagementId })
    .from(engagements)
    .where(eq(engagements.whopUserId, session.whopUserId));

  const skillStatuses: Record<SkillName, SkillStatus> = {
    "pin-down": "not_run",
    "pile-on": "not_run",
    "pre-call-read": "not_run",
    "win-back": "not_run",
    "leak-map": "not_run",
  };

  if (userEngagements.length > 0) {
    const recentRuns = await db
      .select({
        skillName: skillRuns.skillName,
        status: skillRuns.status,
      })
      .from(skillRuns)
      .orderBy(desc(skillRuns.startedAt))
      .limit(50);

    for (const run of recentRuns) {
      const skill = run.skillName as SkillName;
      if (SKILLS.includes(skill) && skillStatuses[skill] === "not_run") {
        skillStatuses[skill] = run.status === "success" ? "live" : "failed";
      }
    }
  }

  const displayName = session.email?.split("@")[0] ?? "operator";

  const statusIcons: Record<SkillStatus, ReactNode> = {
    live: (
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M1 5L4 8L9 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    failed: (
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    not_run: (
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="5" cy="5" r="1" fill="currentColor"/>
        <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1"/>
      </svg>
    ),
  };

  const statusTooltips: Record<SkillStatus, string> = {
    live: "Operational",
    failed: "Degraded",
    not_run: "Standby",
  };

  const navLinks = [
    { 
      href: "/dashboard", 
      label: "Telemetry Hub",
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      )
    },
    { 
      href: "/dashboard/engagements", 
      label: "Engagements",
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="6" cy="5" r="2" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M2 14C2 11.2386 4.23858 9 7 9H9C9.55228 9 10 9.44772 10 10V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="11" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M11 6V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M9 10H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )
    },
    { 
      href: "/dashboard/credentials", 
      label: "Credentials",
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2.5" y="6" width="11" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M5.5 6V4.5C5.5 3.11929 6.61929 2 8 2C9.38071 2 10.5 3.11929 10.5 4.5V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="8" cy="10" r="1" fill="currentColor"/>
        </svg>
      )
    },
  ];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-zinc-950 text-zinc-400 font-sans antialiased">
      
      <aside className="w-56 border-r border-zinc-900 bg-zinc-950 flex flex-col justify-between hidden md:flex shrink-0">
        <div className="flex flex-col flex-1 py-8 px-5 space-y-8">
          
          <div className="px-1">
            <span className="font-mono text-sm font-semibold tracking-wider text-zinc-100">
              SHOWTIME
            </span>
          </div>

          <nav className="flex flex-col space-y-0.5">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center space-x-2.5 px-1 py-2 text-sm text-zinc-400 hover:text-zinc-100 transition-colors rounded group"
              >
                <span className="text-zinc-500 group-hover:text-zinc-300 transition-colors">
                  {link.icon}
                </span>
                <span>{link.label}</span>
              </Link>
            ))}
          </nav>

          <div className="space-y-4 pt-4 border-t border-zinc-900">
            <p className="text-xs font-mono text-zinc-500 uppercase tracking-wider px-1">
              Modules
            </p>
            <div className="flex flex-col space-y-0.5">
              {SKILLS.map((skill) => {
                const status = skillStatuses[skill];
                return (
                  <div 
                    key={skill} 
                    className="flex items-center justify-between px-1 py-1.5 rounded hover:bg-zinc-900/30 transition-colors group"
                    title={statusTooltips[status]}
                  >
                    <span className="font-mono text-xs text-zinc-400">
                      {skill}
                    </span>
                    <span className="text-zinc-600 group-hover:text-zinc-500 transition-colors">
                      {statusIcons[status]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-zinc-900 flex items-center justify-between">
          <span className="text-sm text-zinc-300 font-medium">
            {displayName}
          </span>
          <Link
            href="/api/auth/logout"
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Sign out
          </Link>
        </div>
      </aside>

      <div className="flex flex-col flex-1 overflow-y-auto min-w-0 bg-zinc-950">
        <header className="h-14 border-b border-zinc-900 bg-zinc-950 flex items-center px-6 shrink-0">
          <MobileNav links={navLinks} />
        </header>

        <main className="flex-1 p-6 md:p-8 w-full">
          {children}
        </main>
      </div>
    </div>
  );
}