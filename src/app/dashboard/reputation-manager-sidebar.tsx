import { Home, Activity, Building2, FileText, ListTodo } from "lucide-react";
import { SidebarNavLinks, type NavLinkItem } from "./sidebar-nav-links";
import { SkillsNavList } from "@/components/skills-nav-list";

/**
 * Reputation Manager deliberately has no meetings or sales-only links.
 * Incidents and Analytics are NOT relisted here — once RM is the active
 * context, the primary rail already shows them as their own icons
 * (PRODUCT_RAIL_CHILDREN in primary-nav.ts). Structured the same way
 * WorkSidebar and ShowtimeSidebar group Home+Clients+Reports apart from
 * Queue+Executions — this used to skip Home/Reports entirely on the
 * (correct but confusing) reasoning that the primary rail already gets
 * you to /dashboard/reputation-manager; every other product's secondary
 * sidebar still repeats its own Home link for the same reason Showtime's
 * does, so this one shouldn't be the odd one out.
 */
export function ReputationManagerSidebar() {
  const group1: NavLinkItem[] = [
    { href: "/dashboard/reputation-manager", label: "Home", icon: <Home className="w-4 h-4" /> },
    { href: "/dashboard/engagements?product=reputation-manager", label: "Clients", icon: <Building2 className="w-4 h-4" /> },
    { href: "/dashboard/reports?product=reputation-manager", label: "Reports", icon: <FileText className="w-4 h-4" /> },
  ];
  const group2: NavLinkItem[] = [
    { href: "/dashboard/queue?product=reputation-manager", label: "Queue", icon: <ListTodo className="w-4 h-4" /> },
    { href: "/dashboard/runs?product=reputation-manager", label: "Executions", icon: <Activity className="w-4 h-4" /> },
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
      <SkillsNavList productIds={["reputation-manager"]} />
    </div>
  );
}
