import { ReactNode } from "react";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { engagements, skillRuns } from "@/models/schema";
import { eq, desc } from "drizzle-orm";
import { MobileNav } from "./mobile-nav";

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

  // Derive real skill statuses from the most recent run per skill
  // across the user's engagements — drives the module directory badges.
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
    // Get most recent run per skill across all engagements
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

  const displayName =
    session.email?.split("@")[0] ??
    session.whopUserId?.substring(0, 8) ??
    "user";

  const badgeStyles: Record<SkillStatus, string> = {
    live: "text-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.7)] bg-emerald-500",
    failed: "text-rose-400 bg-rose-500",
    not_run: "text-zinc-700 bg-zinc-700",
  };

  const labelStyles: Record<SkillStatus, string> = {
    live: "text-zinc-600",
    failed: "text-rose-500",
    not_run: "text-zinc-700",
  };

  const labelText: Record<SkillStatus, string> = {
    live: "LIVE",
    failed: "ERR",
    not_run: "IDLE",
  };

  const navLinks = [
    { href: "/dashboard", label: "Telemetry Hub" },
    { href: "/dashboard/engagements", label: "Active Engagements" },
    { href: "/dashboard/credentials", label: "Credentials Vault" },
  ];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground font-sans">
      {/* Desktop sidebar */}
      <aside className="w-64 border-r border-border bg-sidebar flex-col justify-between hidden md:flex">
        <div className="flex flex-col flex-1 py-6 px-4 space-y-8">
          {/* Logo */}
          <div className="flex items-center space-x-2 px-2">
            <div className="h-6 w-6 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold text-xs">
              M
            </div>
            <span className="font-semibold tracking-tight text-sm text-sidebar-foreground">
              Mudd Interface
            </span>
          </div>

          {/* Nav */}
          <nav className="space-y-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="flex items-center space-x-3 px-3 py-2 text-sm font-medium rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
              >
                <span>{link.label}</span>
              </a>
            ))}
          </nav>

          {/* Module directory — real status from DB */}
          <div className="space-y-2">
            <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider px-2">
              Module Directory
            </p>
            <div className="space-y-1">
              {SKILLS.map((skill) => {
                const status = skillStatuses[skill];
                return (
                  <div
                    key={skill}
                    className="flex items-center justify-between px-2 py-1.5 rounded border border-zinc-900 bg-zinc-950"
                  >
                    <span className="font-mono text-[11px] text-zinc-400">
                      {skill}
                    </span>
                    <div className="flex items-center space-x-1.5">
                      <span
                        className={`text-[9px] font-mono ${labelStyles[status]}`}
                      >
                        {labelText[status]}
                      </span>
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${badgeStyles[status]}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* User footer */}
        <div className="p-4 border-t border-sidebar-border bg-sidebar-accent/30 flex items-center justify-between">
          <div className="flex flex-col truncate pr-2">
            <span className="text-xs font-semibold text-sidebar-foreground truncate">
              {displayName}
            </span>
            <span className="text-[10px] uppercase font-mono text-muted-foreground tracking-wider">
              {session.subscriptionStatus ?? "active"}
            </span>
          </div>
          <a
            href="/api/auth/logout"
            className="text-xs font-medium text-destructive hover:underline shrink-0"
          >
            Logout
          </a>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-y-auto min-w-0">
        {/* Top header with mobile nav */}
        <header className="h-14 border-b border-border bg-background flex items-center justify-between px-4 md:px-8 shrink-0">
          {/* Mobile nav toggle — hidden on desktop */}
          <MobileNav links={navLinks} />

          <div className="flex items-center space-x-4 ml-auto">
            <span className="text-xs font-mono text-muted-foreground bg-muted px-2.5 py-1 rounded-md border border-border">
              UID: {(session.whopUserId ?? "").substring(0, 8)}...
            </span>
          </div>
        </header>

        <main className="flex-1 bg-zinc-50/50 dark:bg-zinc-950/20 p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
