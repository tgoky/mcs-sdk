import { Activity, Building2, ListTodo } from "lucide-react";
import { REP_SKILL_IDS, REP_SKILL_MANIFEST } from "@/lib/rep-skill-manifest";
import { RepSkillBadge } from "@/components/rep-skill-badge";
import { SidebarNavLinks, type NavLinkItem } from "./sidebar-nav-links";

/**
 * Reputation Manager deliberately has no meetings or sales-only links.
 * /dashboard/reputation-manager itself is the dashboard (reached via the
 * product's own primary-rail badge). Incidents and Analytics are NOT
 * relisted here — once RM is the active context, the primary rail
 * already shows them as their own icons (PRODUCT_RAIL_CHILDREN in
 * primary-nav.ts) — so this sidebar only needs Clients (adding one
 * happens from that page's own "Add Client" button, not a second entry)
 * plus this product's queue/activity, grouped the same way Work's own
 * sidebar groups Home+Reports apart from Queue+Executions.
 */
export function ReputationManagerSidebar() {
  const group1: NavLinkItem[] = [
    { href: "/dashboard/engagements?product=reputation-manager", label: "Clients", icon: <Building2 className="w-4 h-4" /> },
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
      {/* Not links: unlike Showtime's SkillsNavList, none of these five
          have a per-capability hub page yet — that's real, un-built
          territory, not something worth faking a destination for. */}
      <div className="flex flex-col gap-0.5">
        {REP_SKILL_IDS.map((skillId) => (
          <div key={skillId} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">
            <RepSkillBadge skill={skillId} size={20} />
            <span>{REP_SKILL_MANIFEST[skillId].name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
