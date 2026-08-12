"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";

interface SecondarySidebarProps {
  work: ReactNode;
  engagements: ReactNode;
  analytics: ReactNode;
  meetings: ReactNode;
  settings: ReactNode;
}

type SectionKey = "engagements" | "analytics" | "meetings" | "settings" | "work";

const SECTION_PREFIXES: Array<{ key: SectionKey; prefix: string }> = [
  { key: "engagements", prefix: "/dashboard/engagements" },
  { key: "analytics", prefix: "/dashboard/analytics" },
  { key: "meetings", prefix: "/dashboard/meetings" },
  { key: "settings", prefix: "/dashboard/settings" },
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
  meetings: "Meetings",
  settings: "Settings",
};

export function SecondarySidebar({
  work,
  engagements,
  analytics,
  meetings,
  settings,
}: SecondarySidebarProps) {
  const pathname = usePathname();

  // Observation 4: Library gets no secondary sidebar (single-page destination)
  if (pathname === "/dashboard/library" || pathname.startsWith("/dashboard/library/")) {
    return null;
  }

  const section = activeSection(pathname);

  const content: Record<SectionKey, ReactNode> = {
    work,
    engagements,
    analytics,
    meetings,
    settings,
  };

  return (
    <aside className="w-60 bg-sidebar border-r border-sidebar-border flex flex-col shrink-0 select-none py-3 px-2 overflow-y-auto font-sans antialiased text-zinc-300">
      <div className="px-3 pt-1 pb-2 text-[14px] font-bold text-zinc-100 tracking-tight">
        {SECTION_LABELS[section]}
      </div>
      <div className="flex-1">{content[section]}</div>
    </aside>
  );
}