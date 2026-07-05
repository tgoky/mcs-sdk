import { ReactNode } from "react";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { engagements, skillRuns } from "@/models/schema";
import { eq, desc } from "drizzle-orm";
import { MobileNav } from "./mobile-nav";
import { NotificationBell } from "./notification-bell";
import { BookingToast } from "./booking-toast";
import { LiveTime } from "./live-time";
import Link from "next/link";
import { CheckCircle2, AlertCircle, Circle, Loader2 } from "lucide-react";
import {
  SKILL_INFO,
  SKILLS,
  MODULE_STATUS_LABELS,
  type SkillName,
  type ModuleStatus,
} from "@/lib/copy";

type SkillStatus = "live" | "failed" | "not_run" | "running";

export const revalidate = 0;

function getStatusTooltip(status: SkillStatus): string {
  if (status === "running") return "Executing now";
  return MODULE_STATUS_LABELS[status as ModuleStatus] ?? "Not started yet";
}

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

  const skillLastRun: Record<SkillName, Date | null> = {
    "pin-down": null,
    "pile-on": null,
    "pre-call-read": null,
    "win-back": null,
    "leak-map": null,
  };

  const skillRunCounts: Record<SkillName, number> = {
    "pin-down": 0,
    "pile-on": 0,
    "pre-call-read": 0,
    "win-back": 0,
    "leak-map": 0,
  };

  if (userEngagements.length > 0) {
    const recentRuns = await db
      .select({
        skillName: skillRuns.skillName,
        status: skillRuns.status,
        startedAt: skillRuns.startedAt,
      })
      .from(skillRuns)
      .orderBy(desc(skillRuns.startedAt))
      .limit(100);

    for (const run of recentRuns) {
      const skill = run.skillName as SkillName;
      if (SKILLS.includes(skill)) {
        skillRunCounts[skill]++;
        if (!skillLastRun[skill] && run.startedAt) {
          skillLastRun[skill] = new Date(run.startedAt);
        }
        if (skillStatuses[skill] === "not_run") {
          if (run.status === "running") {
            skillStatuses[skill] = "running";
          } else if (run.status === "success") {
            skillStatuses[skill] = "live";
          } else if (run.status === "failed" || run.status === "timed_out") {
            // A timed-out run is exactly as much a trust problem as a
            // failed one from the sidebar's point of view — the module
            // didn't do what it was supposed to. Surface it the same way.
            skillStatuses[skill] = "failed";
          }
        }
      }
    }
  }

  const displayName = session.email?.split("@")[0] ?? "Member";

  const activeCount = Object.values(skillStatuses).filter(s => s === "live" || s === "running").length;
  const failedCount = Object.values(skillStatuses).filter(s => s === "failed").length;

  const navLinks = [
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 8H5L7 4L9 12L11 8H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )
    },
    {
      href: "/dashboard/engagements",
      label: "Engagements",
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M10 7C10 4.79086 8.20914 3 6 3C3.79086 3 2 4.79086 2 7V13H10V7Z" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M10 10H14V7C14 5.34315 12.6569 4 11 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="11.5" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      )
    },
    {
      href: "/dashboard/credentials",
      label: "Credentials",
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 6V4.5C3 2.01472 5.01472 0 7.5 0C9.98528 0 12 2.01472 12 4.5V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <rect x="1" y="6" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.5"/>
          <circle cx="8" cy="10.5" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M8 10.5V13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )
    },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-400 font-sans antialiased">
      <BookingToast />
      <aside className="w-64 border-r border-zinc-900 bg-zinc-950 flex-col justify-between hidden md:flex">
        <div className="flex flex-col flex-1 pt-5 pb-16 px-5 space-y-6 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
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

          <div className="pt-4 border-t border-zinc-900">
            <div className="px-1 mb-3 space-y-1">
              <p className="text-xs font-mono text-zinc-500 uppercase tracking-wider">
                EXECUTIONS
              </p>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-zinc-500">
                  <span className="text-zinc-400">{activeCount} active</span>
                  {failedCount > 0 && <span className="text-zinc-600 mx-1">·</span>}
                  {failedCount > 0 && <span className="text-zinc-500">{failedCount} issue{failedCount !== 1 ? 's' : ''}</span>}
                </span>
              </div>
            </div>
            
            <div className="bg-zinc-900/50 border border-zinc-900 rounded-lg overflow-hidden">
              {SKILLS.map((skill, index) => {
                const status = skillStatuses[skill];
                const info = SKILL_INFO[skill];
                const lastRun = skillLastRun[skill];
                const runCount = skillRunCounts[skill];
                
                return (
                  <Link
                    key={skill}
                    href={`/dashboard/modules/${skill}`}
                    className={`
                      block px-3 py-2.5 transition-colors
                      hover:bg-zinc-800/80 cursor-pointer
                      group relative
                      ${index !== SKILLS.length - 1 ? 'border-b border-zinc-900' : ''}
                    `}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-medium text-zinc-200 group-hover:text-zinc-100 transition-colors truncate">
                          {info.name}
                        </span>
                        <svg 
                          className="w-3 h-3 opacity-0 group-hover:opacity-100 text-zinc-500 shrink-0 transition-all duration-200" 
                          fill="none" 
                          viewBox="0 0 24 24" 
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>

                      <div className="flex items-center shrink-0 relative group/icon">
                        {status === "live" && (
                          <>
                            <CheckCircle2 size={16} className="text-emerald-500" />
                            <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] text-zinc-300 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded opacity-0 group-hover/icon:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-xl z-10">
                              {getStatusTooltip(status)}
                            </span>
                          </>
                        )}
                        {status === "running" && (
                          <>
                            <Loader2 size={16} className="text-zinc-400 animate-spin" />
                            <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] text-zinc-300 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded opacity-0 group-hover/icon:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-xl z-10">
                              {getStatusTooltip(status)}
                            </span>
                          </>
                        )}
                        {status === "failed" && (
                          <>
                            <AlertCircle size={16} className="text-rose-400" />
                            <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] text-zinc-300 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded opacity-0 group-hover/icon:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-xl z-10">
                              {getStatusTooltip(status)}
                            </span>
                          </>
                        )}
                        {status === "not_run" && (
                          <>
                            <Circle size={16} className="text-zinc-700" />
                            <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] text-zinc-300 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded opacity-0 group-hover/icon:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-xl z-10">
                              {getStatusTooltip(status)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <p className="text-[11px] text-zinc-500 leading-snug mt-0.5">
                      {info.description}
                    </p>

                    <div className="flex items-center gap-3 mt-1">
                      {status === "running" ? (
                        <span className="text-[10px] text-zinc-400 tabular-nums animate-pulse">
                          Running...
                        </span>
                      ) : lastRun ? (
                        <LiveTime isoString={lastRun.toISOString()} />
                      ) : (
                        <span className="text-[10px] text-zinc-700">
                          Never run
                        </span>
                      )}
                      {runCount > 0 && (
                        <span className="text-[10px] text-zinc-700 tabular-nums">
                          {runCount} run{runCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-zinc-900 flex items-center justify-between shrink-0">
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

      <div className="flex flex-col flex-1 min-w-0 bg-zinc-950">
        <header className="h-14 border-b border-zinc-900 bg-zinc-950 flex items-center justify-between px-6 shrink-0">
          <MobileNav links={navLinks} />
          <div className="flex items-center ml-auto">
            <NotificationBell />
          </div>
        </header>

        <main className="flex-1 p-6 md:p-8 w-full overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {children}
        </main>
      </div>
    </div>
  );
}