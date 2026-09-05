import { Home, Building2, FileText, ListTodo, Activity } from "lucide-react";
import { SkillsNavList } from "@/components/skills-nav-list";
import { SidebarNavLinks, type NavLinkItem } from "./sidebar-nav-links";

/**
 * Showtime-specific navigation. Adding a client happens from the Clients
 * page itself (its own "Add Client" button), not a second sidebar entry —
 * same reasoning as Work never having a "New X" link next to "Home".
 * Analytics and Meetings are deliberately NOT relisted here: once
 * Showtime is the active context, the primary rail already shows them as
 * their own icons (see PRODUCT_RAIL_CHILDREN in primary-nav.ts) — this
 * sidebar only needs the destinations that DON'T have a rail icon of
 * their own (Reports) plus this product's queue/activity, grouped the
 * same way Work's own sidebar groups Home+Reports apart from Queue+Executions.
 *
 * Bug fix: this sidebar never linked to /dashboard/showtime (Showtime's
 * own dashboard page) at all — there was no way back to it from within
 * Showtime's own secondary sidebar. Added to match
 * reputation-manager-sidebar.tsx's own Home entry.
 */
export function ShowtimeSidebar() {
  const group1: NavLinkItem[] = [
    { href: "/dashboard/showtime", label: "Home", icon: <Home className="w-4 h-4" /> },
    { href: "/dashboard/engagements?product=showtime", label: "Clients", icon: <Building2 className="w-4 h-4" /> },
    { href: "/dashboard/reports", label: "Reports", icon: <FileText className="w-4 h-4" /> },
  ];
  const group2: NavLinkItem[] = [
    { href: "/dashboard/queue?product=showtime", label: "Queue", icon: <ListTodo className="w-4 h-4" /> },
    { href: "/dashboard/runs?product=showtime", label: "Executions", icon: <Activity className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col gap-3">
      <SidebarNavLinks links={group1} />
      <div className="h-px bg-zinc-200/80 dark:bg-zinc-800/80 mx-1" />
      <SidebarNavLinks links={group2} />
      <div className="h-px bg-zinc-200/80 dark:bg-zinc-800/80 mx-1" />
      <div className="px-2 py-1 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 font-mono tracking-wider uppercase">
        Capabilities
      </div>
      <SkillsNavList productIds={["showtime"]} />
    </div>
  );
}
