"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, KeyRound, CalendarSync } from "lucide-react";
import { cn } from "@/lib/utils";

// Surviving sidebar slots (Strategy and Skills slots deleted per Obs 8)
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

  // Obs 4: Library has earned no sidebar. Render as a single-page destination.
  if (pathname.startsWith("/dashboard/library")) {
    return null;
  }

  // Obs 1: Dedicated Settings section sidebar
  if (pathname.startsWith("/dashboard/settings")) {
    return (
      <aside className="w-56 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50 p-3 min-h-[calc(100vh-3.5rem)]">
        <div className="mb-3 px-2">
          <h2 className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Settings
          </h2>
        </div>
        <nav className="space-y-0.5">
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
                  "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-zinc-200/80 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 font-semibold"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span>{item.title}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    );
  }

  // Active section mapping for remaining dashboard pages
  const section = activeSection(pathname);
  const content: Record<SectionKey, ReactNode> = {
    work,
    engagements,
    analytics,
    meetings,
  };

  // Render active section sidebar content (SKILL STATUS panel removed per Obs 8)
  return (
    <aside className="w-60 bg-sidebar border-r border-sidebar-border flex flex-col shrink-0 select-none py-3 px-2 overflow-y-auto font-sans antialiased text-zinc-300">
      <div className="flex-1">
        {content[section]}
      </div>
    </aside>
  );
}