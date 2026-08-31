"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";

interface SecondarySidebarProps {
  work: ReactNode;
  engagements: ReactNode;
  meetings: ReactNode;
  settings: ReactNode;
  reports: ReactNode;
  analytics?: ReactNode;
}

type SectionKey = "engagements" | "meetings" | "settings" | "reports" | "work";

const SECTION_PREFIXES: Array<{ key: SectionKey; prefix: string }> = [
  { key: "engagements", prefix: "/dashboard/engagements" },
  { key: "meetings", prefix: "/dashboard/meetings" },
  { key: "settings", prefix: "/dashboard/settings" },
  // Reports used to fall through to the generic "work" section (Home/
  // Reports link/Queue/Executions + Installed Skills) even while you were
  // actually on the Reports page — the sidebar had no idea a client was
  // selected. Its own prefix, checked before the "work" fallback, same as
  // every other real section.
  { key: "reports", prefix: "/dashboard/reports" },
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
  meetings: "Meetings",
  settings: "Settings",
  reports: "Reports",
};

export function SecondarySidebar({
  work,
  engagements,
  meetings,
  settings,
  reports,
}: SecondarySidebarProps) {
  const pathname = usePathname();

  // Library and Analytics both get no secondary sidebar (single-page destinations)
  if (
    pathname === "/dashboard/library" ||
    pathname.startsWith("/dashboard/library/") ||
    pathname === "/dashboard/analytics" ||
    pathname.startsWith("/dashboard/analytics/")
  ) {
    return null;
  }

  const section = activeSection(pathname);

  const content: Record<SectionKey, ReactNode> = {
    work,
    engagements,
    meetings,
    settings,
    reports,
  };

  return (
    <aside className="w-60 bg-[#f8f7fa] dark:bg-sidebar border-r border-zinc-200/80 dark:border-sidebar-border flex flex-col shrink-0 select-none py-3 px-2 overflow-y-auto font-sans antialiased text-zinc-700 dark:text-zinc-300">
      {/* Dynamic Section Header Title with theme support */}
      <div className="px-3 pt-1 pb-2 text-[14px] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
        {SECTION_LABELS[section]}
      </div>
      <div className="flex-1">{content[section]}</div>
    </aside>
  );
}