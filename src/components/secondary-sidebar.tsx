"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";

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

export function SecondarySidebar({
  work,
  engagements,
  analytics,
  strategy,
  skills,
  meetings,
}: SecondarySidebarProps) {
  const pathname = usePathname();
  const section = activeSection(pathname);

  const content: Record<SectionKey, ReactNode> = {
    work,
    engagements,
    analytics,
    strategy,
    skills,
    meetings,
  };

  return (
    <aside className="w-60 bg-sidebar border-r border-sidebar-border flex flex-col shrink-0 select-none py-3 px-2 overflow-y-auto font-sans antialiased text-zinc-300">
      {/* SECTION HEADER */}
      <div className="px-3 pt-1 pb-2 text-[14px] font-bold text-zinc-100 tracking-tight">
        {SECTION_LABELS[section]}
      </div>

      {/* ACTIVE SECTION SLOT (Renders WorkSidebar with Home, Inbox, Queue, Executions, Projects & Clients with Teal Icons) */}
      <div className="flex-1">
        {content[section]}
      </div>

      {/* SKILLS SLOT (Rendered directly underneath Clients) */}
      {section !== "skills" && (
        <div className="mt-4 pt-3 border-t border-sidebar-border">
          {skills}
        </div>
      )}
    </aside>
  );
}