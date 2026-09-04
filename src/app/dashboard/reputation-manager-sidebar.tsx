import Link from "next/link";
import { Activity, Building2, ListTodo, Plus } from "lucide-react";
import { REP_SKILL_IDS, REP_SKILL_MANIFEST } from "@/lib/rep-skill-manifest";
import { SidebarNavLinks, type NavLinkItem } from "./sidebar-nav-links";

/** Reputation Manager deliberately has no meetings or sales-only links. */
export function ReputationManagerSidebar() {
  const links: NavLinkItem[] = [
    { href: "/dashboard/reputation-manager", label: "Clients", icon: <Building2 className="w-4 h-4" /> },
    { href: "/dashboard/reputation-manager/new", label: "New client", icon: <Plus className="w-4 h-4" /> },
    { href: "/dashboard/queue?product=reputation-manager", label: "Queue", icon: <ListTodo className="w-4 h-4" /> },
    { href: "/dashboard/runs?product=reputation-manager", label: "Executions", icon: <Activity className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col gap-3">
      <SidebarNavLinks links={links} />
      <div className="h-px bg-zinc-200/80 dark:bg-zinc-800/80 mx-1" />
      <div className="px-2 py-1 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 font-mono tracking-wider uppercase">
        Installed skills
      </div>
      <nav className="flex flex-col gap-0.5">
        {REP_SKILL_IDS.map((skillId) => (
          <Link
            key={skillId}
            href={`/dashboard/reputation-manager?skill=${encodeURIComponent(skillId)}`}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/40 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 dark:bg-indigo-500 shrink-0" />
            <span>{REP_SKILL_MANIFEST[skillId].name}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
