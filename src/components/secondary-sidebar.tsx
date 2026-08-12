"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, KeyRound, CalendarSync } from "lucide-react";
import { cn } from "@/lib/utils";

interface SecondarySidebarProps {
  work?: ReactNode;
  engagements?: ReactNode;
  analytics?: ReactNode;
  meetings?: ReactNode;
}

type SectionKey = "engagements" | "analytics" | "meetings" | "work";

const SECTION_PREFIXES: Array<{ key: SectionKey; prefix: string }> = [
  { key: "engagements", prefix: "/dashboard/engagements" },
  { key: "analytics", prefix: "/dashboard/analytics" },
  { key: "meetings", prefix: "/dashboard/meetings" },
];

const SECTION_LABELS: Record<SectionKey, string> = {
  work: "Work",
  engagements: "Engagements",
  analytics: "Analytics",
  meetings: "Meetings",
};

const SETTINGS_NAV_ITEMS = [
  {
    title: "Profile",
    href: "/dashboard/settings/profile",
    icon: User,
  },
  {
    title: "Connections",
    href: "/dashboard/settings/connections",
    icon: KeyRound,
  },
  {
    title: "Booking Sync",
    href: "/dashboard/settings/booking-sync",
    icon: CalendarSync,
  },
];

function activeSection(pathname: string): SectionKey {
  const match = SECTION_PREFIXES.filter(
    (s) => pathname === s.prefix || pathname.startsWith(`${s.prefix}/`)
  ).sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return match?.key ?? "work";
}

export function SecondarySidebar({
  work,
  engagements,
  analytics,
  meetings,
}: SecondarySidebarProps) {
  const pathname = usePathname();

  // Observation 4: Library is a single-page destination with no secondary sidebar.
  if (pathname.startsWith("/dashboard/library")) {
    return null;
  }

  // Observation 1: Dedicated Settings section sidebar sharing identical container layout
  if (pathname.startsWith("/dashboard/settings")) {
    return (
      <aside className="w-60 bg-sidebar border-r border-sidebar-border flex flex-col shrink-0 select-none py-3 px-2 overflow-y-auto font-sans antialiased text-zinc-300">
        <div className="px-3 pt-1 pb-2 text-[14px] font-bold text-zinc-100 tracking-tight">
          Settings
        </div>
        <nav className="flex-1 space-y-0.5 pt-1">
          {SETTINGS_NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href === "/dashboard/settings/profile" && pathname === "/dashboard/settings");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-zinc-800 text-zinc-100 font-semibold"
                    : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
                )}
              >
                <Icon className="h-4 w-4 shrink-0 text-zinc-400" />
                <span>{item.title}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    );
  }

  const section = activeSection(pathname);
  const content: Record<SectionKey, ReactNode> = {
    work,
    engagements,
    analytics,
    meetings,
  };

  return (
    <aside className="w-60 bg-sidebar border-r border-sidebar-border flex flex-col shrink-0 select-none py-3 px-2 overflow-y-auto font-sans antialiased text-zinc-300">
      <div className="px-3 pt-1 pb-2 text-[14px] font-bold text-zinc-100 tracking-tight">
        {SECTION_LABELS[section]}
      </div>
      <div className="flex-1">
        {content[section]}
      </div>
    </aside>
  );
}