"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Zap, ChevronRight } from "lucide-react";
import { SKILL_IDS, SKILL_MANIFEST } from "@/lib/skill-manifest";
import { cn } from "@/lib/utils";

interface SecondarySidebarProps {
  work: ReactNode;
  engagements: ReactNode;
  analytics: ReactNode;
  strategy: ReactNode;
  skills: ReactNode;
  meetings: ReactNode;
}

type SectionKey = "engagements" | "analytics" | "strategy" | "skills" | "meetings" | "work";

const SECTION_PREFIXES: Array<{ key: SectionKey; prefix: string }> = [
  { key: "engagements", prefix: "/dashboard/engagements" },
  { key: "analytics", prefix: "/dashboard/analytics" },
  { key: "strategy", prefix: "/dashboard/strategy" },
  { key: "skills", prefix: "/dashboard/skills" },
  { key: "meetings", prefix: "/dashboard/meetings" },
];

function activeSection(pathname: string): SectionKey {
  const match = SECTION_PREFIXES.filter(
    (s) => pathname === s.prefix || pathname.startsWith(`${s.prefix}/`)
  ).sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return match?.key ?? "work";
}

const SECTION_LABELS: Record<SectionKey, string> = {
  work: "Work",
  engagements: "Engagements",
  analytics: "Analytics",
  strategy: "Strategy",
  skills: "Skills",
  meetings: "Meetings",
};

export function SecondarySidebar({ work, engagements, analytics, strategy, skills, meetings }: SecondarySidebarProps) {
  const pathname = usePathname();
  const section = activeSection(pathname);

  const content: Record<SectionKey, ReactNode> = { work, engagements, analytics, strategy, skills, meetings };

  return (
    <aside className="w-60 bg-sidebar border-r border-sidebar-border flex flex-col shrink-0 select-none py-4 px-3 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      {/* Section Title Header */}
      <div className="px-2 pb-2 text-[11px] font-semibold text-zinc-500 font-mono tracking-wider uppercase">
        {SECTION_LABELS[section]}
      </div>

      {/* Main Section Content (e.g. Clients list inside 'work') */}
      <div className="flex-1">
        {content[section]}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* SKILLS & MODULES SECTION (Appears underneath active section content) */}
      {/* ----------------------------------------------------------------- */}
      <div className="mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-800/80 space-y-1">
        <div className="flex items-center justify-between px-2 mb-2">
          <h3 className="text-[11px] font-sans font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-amber-500" />
            Skills & Modules
          </h3>
          <Link
            href="/dashboard/skills"
            className="text-[11px] font-sans text-zinc-500 hover:text-amber-500 transition-colors"
          >
            All
          </Link>
        </div>

        <nav className="space-y-0.5">
          {SKILL_IDS.map((skillId) => {
            const manifest = SKILL_MANIFEST[skillId];
            const moduleHref = `/dashboard/modules/${skillId}`;
            const isModuleActive = pathname === moduleHref || pathname.startsWith(`${moduleHref}/`);

            return (
              <Link
                key={skillId}
                href={moduleHref}
                className={cn(
                  "group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150",
                  isModuleActive
                    ? "bg-zinc-200/80 dark:bg-zinc-800 text-zinc-900 dark:text-white font-semibold"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900/80 hover:text-zinc-900 dark:hover:text-zinc-200"
                )}
              >
                <span className="truncate">{manifest.name}</span>
                <ChevronRight className={cn(
                  "w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400",
                  isModuleActive && "opacity-100 text-amber-500"
                )} />
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}