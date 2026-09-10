"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";

interface SecondarySidebarProps {
  work: ReactNode;
  settings: ReactNode;
}

type SectionKey = "settings" | "work";

/**
 * Two slots, not the six this used to have (work/settings/reputationManager/
 * showtime/reportsReputationManager/reportsShowtime). Those extra four
 * existed to swap in an entirely different sidebar depending on which
 * product's "context" a route belonged to — the exact "different menu for
 * the same client" problem the whole worker-registry restructure set out
 * to remove, still standing here untouched through every phase of it.
 * WorkSidebar already covers every worker across both products via its own
 * Capabilities grid, so once nothing routes into a product-specific
 * variant anymore, there's nothing left for those four slots to hold.
 */
function activeSection(pathname: string): SectionKey {
  return pathname.startsWith("/dashboard/settings") ? "settings" : "work";
}

const SECTION_LABELS: Record<SectionKey, string> = {
  work: "Work",
  settings: "Settings",
};

export function SecondarySidebar({ work, settings }: SecondarySidebarProps) {
  const pathname = usePathname();

  // Library is intentionally a single-page marketplace. Teammates is
  // intentionally a self-contained two-pane layout of its own (thread
  // rail + chat, see teammates-workspace.tsx). Analytics is one
  // self-contained overview page with nothing to navigate between within
  // it (its own AnalyticsSidebar went unused for exactly that reason —
  // see that file's header). The generic Work sidebar (Home/Reports/
  // Queue/Executions/Capabilities) was showing up to the left of all
  // three for no reason, wasting width and duplicating a "list of
  // things" role each page either doesn't need or already has its own
  // version of. Hiding this column for all three lets their own content
  // use the full width instead.
  if (
    pathname === "/dashboard/library" ||
    pathname.startsWith("/dashboard/library/") ||
    pathname === "/dashboard/teammates" ||
    pathname.startsWith("/dashboard/teammates/") ||
    pathname === "/dashboard/analytics" ||
    pathname.startsWith("/dashboard/analytics/")
  ) {
    return null;
  }

  const section = activeSection(pathname);
  const content: Record<SectionKey, ReactNode> = { work, settings };

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
