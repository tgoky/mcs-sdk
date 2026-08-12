"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";

interface SecondarySidebarProps {
  work: ReactNode;
  engagements: ReactNode;
  analytics: ReactNode;
  meetings: ReactNode;
}

type SectionKey = "engagements" | "analytics" | "meetings" | "work";

// Obs 2 Decision D / Obs 8 Part B fix (2026-08-05/07 handoff): removed the
// "strategy" and "skills" section keys. Strategy's primary-rail entry was
// already commented out (dead, unreachable). Skills' secondary sidebar was
// the SKILL STATUS panel — deleted per Observation 8's own decision (it
// doesn't scale past a handful of agents; Library, the client engagement
// page, the Needs Action queue, and Analytics now split that job between
// them instead of one aggregate widget). /dashboard/skills and
// /dashboard/strategy's own pages are unaffected by this — this only
// removes their now-unused secondary-sidebar slots.
const SECTION_PREFIXES: Array<{ key: SectionKey; prefix: string }> = [
  { key: "engagements", prefix: "/dashboard/engagements" },
  { key: "analytics", prefix: "/dashboard/analytics" },
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
  meetings: "Meetings",
};

export function SecondarySidebar({ work, engagements, analytics, meetings }: SecondarySidebarProps) {
  const pathname = usePathname();
  const section = activeSection(pathname);

  const content: Record<SectionKey, ReactNode> = {
    work,
    engagements,
    analytics,
    meetings,
  };

  return (
    <aside className="w-60 bg-sidebar border-r border-sidebar-border flex flex-col shrink-0 select-none py-3 px-2 overflow-y-auto font-sans antialiased text-zinc-300">
      {/* SECTION HEADER */}
      <div className="px-3 pt-1 pb-2 text-[14px] font-bold text-zinc-100 tracking-tight">
        {SECTION_LABELS[section]}
      </div>

      {/* ACTIVE SECTION SLOT */}
      <div className="flex-1">{content[section]}</div>
    </aside>
  );
}
