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

  // SOPHISTICATED MONOCHROME CONFIGURATION: Complete elimination of neon red/green indicators
  const statusLabels: Record<SkillStatus, string> = {
    live: "online",
    failed: "degraded",
    not_run: "standby",
  };

  const statusStyles: Record<SkillStatus, string> = {
    live: "text-zinc-300 font-medium",
    failed: "text-zinc-500 line-through tracking-normal opacity-60",
    not_run: "text-zinc-600 font-light",
  };

  const navLinks = [
    { href: "/dashboard", label: "Telemetry Hub" },
    { href: "/dashboard/engagements", label: "Active Engagements" },
    { href: "/dashboard/credentials", label: "Credentials Vault" },
  ];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-zinc-950 text-zinc-400 font-sans selection:bg-zinc-800 antialiased">
      {/* Pristine, Structural Left Sidebar */}
      <aside className="w-60 border-r border-zinc-900 bg-zinc-950 flex flex-col justify-between hidden md:flex shrink-0 select-none">
        <div className="flex flex-col flex-1 py-8 px-6 space-y-9">
          
          {/* Flat Minimalist Technical Identifier Header */}
          <div className="flex items-center space-x-2 px-1 text-zinc-200">
            <span className="font-mono text-xs font-semibold tracking-widest text-zinc-100">
              SHOWTIME
            </span>
            <span className="text-[10px] font-mono font-light text-zinc-500 tracking-wider">
              PANEL_v1.0
            </span>
          </div>

          {/* Core Text-Only Navigation Links */}
          <nav className="flex flex-col space-y-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="flex items-center px-1 py-1.5 text-xs font-normal text-zinc-500 hover:text-zinc-100 transition-colors duration-150 tracking-tight"
              >
                <span>{link.label}</span>
              </a>
            ))}
          </nav>

          {/* Typographic Core Infrastructure Directory Inventory */}
          <div className="space-y-3.5 pt-3 border-t border-zinc-900/60">
            <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest px-1">
              Engine Modules
            </p>
            <div className="flex flex-col space-y-2 px-1">
              {SKILLS.map((skill) => {
                const status = skillStatuses[skill];
                return (
                  <div
                    key={skill}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="font-mono text-zinc-400 text-[11px] tracking-tight">
                      {skill}
                    </span>
                    <span className={`text-[10px] font-mono tracking-wider uppercase ${statusStyles[status]}`}>
                      [{statusLabels[status]}]
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Clean, Non-Container Operator Frame Footer */}
        <div className="p-6 mx-2 mb-2 border-t border-zinc-900/40 flex items-center justify-between text-xs font-sans">
          <div className="flex flex-col truncate pr-2">
            <span className="text-zinc-400 font-medium truncate">
              {displayName}
            </span>
            <span className="text-[9px] uppercase font-mono text-zinc-600 tracking-widest mt-0.5">
              AUTH_NODE // {session.subscriptionStatus ?? "active"}
            </span>
          </div>
          <a
            href="/api/auth/logout"
            className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 hover:text-zinc-300 transition-colors shrink-0"
          >
            [ Exit ]
          </a>
        </div>
      </aside>

      {/* Main Content Delivery Workspace */}
      <div className="flex flex-col flex-1 overflow-y-auto min-w-0 bg-zinc-950">
        <header className="h-14 border-b border-zinc-900/80 bg-zinc-950/20 flex items-center justify-between px-6 md:px-8 shrink-0">
          <MobileNav links={navLinks} />

          <div className="flex items-center space-x-4 ml-auto">
            <span className="text-[10px] font-mono text-zinc-600 tracking-wider bg-zinc-900/10 px-2 py-0.5 rounded border border-zinc-900/40">
              SYS_UID // {(session.whopUserId ?? "").substring(4, 11).toUpperCase()}
            </span>
          </div>
        </header>

        <main className="flex-1 p-6 md:p-8 max-w-5xl w-full">
          {children}
        </main>
      </div>
    </div>
  );
}