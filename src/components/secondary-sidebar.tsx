"use client";

import { ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";

interface SecondarySidebarProps {
  work: ReactNode;
  settings: ReactNode;
  reputationManager: ReactNode;
  showtime: ReactNode;
}

type SectionKey = "reputation-manager" | "showtime" | "settings" | "work";

const SECTION_PREFIXES: Array<{ key: SectionKey; prefix: string }> = [
  { key: "reputation-manager", prefix: "/dashboard/reputation-manager" },
  { key: "showtime", prefix: "/dashboard/showtime" },
  { key: "showtime", prefix: "/dashboard/engagements" },
  { key: "showtime", prefix: "/dashboard/meetings" },
  { key: "showtime", prefix: "/dashboard/analytics" },
  { key: "showtime", prefix: "/dashboard/modules" },
  { key: "settings", prefix: "/dashboard/settings" },
  { key: "showtime", prefix: "/dashboard/reports" },
];

function activeSection(pathname: string): SectionKey {
  const match = SECTION_PREFIXES.filter(
    (s) => pathname === s.prefix || pathname.startsWith(`${s.prefix}/`)
  ).sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return match?.key ?? "work";
}

const SECTION_LABELS: Record<SectionKey, string> = {
  work: "Work",
  showtime: "Showtime",
  "reputation-manager": "Reputation Manager",
  settings: "Settings",
};

export function SecondarySidebar({
  work,
  settings,
  reputationManager,
  showtime,
}: SecondarySidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Library is intentionally a single-page marketplace.
  if (
    pathname === "/dashboard/library" ||
    pathname.startsWith("/dashboard/library/")
  ) {
    return null;
  }

  const scopedProduct = searchParams.get("product");
  const section: SectionKey =
    (pathname === "/dashboard/queue" || pathname === "/dashboard/runs") && scopedProduct === "reputation-manager"
      ? "reputation-manager"
      : (pathname === "/dashboard/queue" || pathname === "/dashboard/runs") && scopedProduct === "showtime"
        ? "showtime"
        : activeSection(pathname);

  const content: Record<SectionKey, ReactNode> = {
    work,
    showtime,
    "reputation-manager": reputationManager,
    settings,
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
