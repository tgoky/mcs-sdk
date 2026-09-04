import { BarChart3, Building2, CalendarClock, FileText, ListTodo, Plus } from "lucide-react";
import { SkillsNavList } from "@/components/skills-nav-list";
import { SidebarNavLinks, type NavLinkItem } from "./sidebar-nav-links";

/** Showtime-specific navigation. Work owns the combined queue and activity
 * overview; this area contains only sales-execution routes. */
export function ShowtimeSidebar() {
  const links: NavLinkItem[] = [
    { href: "/dashboard/engagements", label: "Clients", icon: <Building2 className="w-4 h-4" /> },
    { href: "/dashboard/engagements/new", label: "New client", icon: <Plus className="w-4 h-4" /> },
    { href: "/dashboard/analytics", label: "Analytics", icon: <BarChart3 className="w-4 h-4" /> },
    { href: "/dashboard/meetings", label: "Meetings", icon: <CalendarClock className="w-4 h-4" /> },
    { href: "/dashboard/reports", label: "Reports", icon: <FileText className="w-4 h-4" /> },
    { href: "/dashboard/queue?product=showtime", label: "Queue", icon: <ListTodo className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col gap-3">
      <SidebarNavLinks links={links} />
      <div className="h-px bg-zinc-200/80 dark:bg-zinc-800/80 mx-1" />
      <div className="px-2 py-1 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 font-mono tracking-wider uppercase">
        Installed skills
      </div>
      <SkillsNavList productIds={["showtime"]} />
    </div>
  );
}
