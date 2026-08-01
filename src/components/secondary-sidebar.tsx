"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Inbox,
  ListTodo,
  Activity,
  FolderKanban,
  Plus,
  ChevronDown,
  List,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ClientItem {
  engagementId: string;
  buyer: string;
}

interface SecondarySidebarProps {
  work: ReactNode;
  engagements: ReactNode;
  analytics: ReactNode;
  strategy: ReactNode;
  skills: ReactNode;
  meetings: ReactNode;
  clients?: ClientItem[];
  unreadInboxCount?: number;
  queueCount?: number;
}

type SectionKey = "engagements" | "analytics" | "strategy" | "skills" | "meetings" | "work";

const SECTION_PREFIXES: Array<{ key: SectionKey; prefix: string }> = [
  { key: "engagements", prefix: "/dashboard/engagements" },
  { key: "analytics", prefix: "/dashboard/analytics" },
  { key: "strategy", prefix: "/dashboard/strategy" },
  { key: "skills", prefix: "/dashboard/skills" },
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
  strategy: "Strategy",
  skills: "Skills",
  meetings: "Meetings",
};

interface WorkNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: number;
}

export function SecondarySidebar({
  work,
  engagements,
  analytics,
  strategy,
  skills,
  meetings,
  clients = [],
  unreadInboxCount = 35,
  queueCount = 3,
}: SecondarySidebarProps) {
  const pathname = usePathname();
  const section = activeSection(pathname);

  const content: Record<SectionKey, ReactNode> = {
    work,
    engagements,
    analytics,
    strategy,
    skills,
    meetings,
  };

  // Explicitly typed items ensuring every item has a valid LucideIcon
  const workNavItems: WorkNavItem[] = [
    {
      href: "/dashboard",
      label: "Home",
      icon: Home,
      exact: true,
    },
    {
      href: "/dashboard/inbox",
      label: "Inbox",
      icon: Inbox, // Added missing icon
      badge: unreadInboxCount,
    },
    {
      href: "/dashboard/queue",
      label: "Queue",
      icon: ListTodo,
      badge: queueCount,
    },
    {
      href: "/dashboard/executions",
      label: "Executions",
      icon: Activity,
    },
    {
      href: "/dashboard/projects",
      label: "Projects",
      icon: FolderKanban,
    },
  ];

  return (
    <aside className="w-60 bg-sidebar border-r border-sidebar-border flex flex-col shrink-0 select-none py-3 px-2 overflow-y-auto font-sans antialiased text-zinc-300">
      {/* SECTION HEADER */}
      <div className="px-3 pt-1 pb-2 text-[14px] font-bold text-zinc-100 tracking-tight">
        {SECTION_LABELS[section]}
      </div>

      {/* WORK SECTION CONTENT */}
      {section === "work" ? (
        <div className="flex-1 space-y-4">
          {/* MAIN NAVIGATION GROUP */}
          <nav className="space-y-0.5">
            {workNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group flex items-center justify-between px-3 py-2 rounded-[10px] text-[13px] font-medium transition-colors duration-100",
                    isActive
                      ? "bg-[#3f3f42] text-white font-semibold shadow-xs"
                      : "text-zinc-300 hover:bg-zinc-800/60 hover:text-white"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className={cn("w-4 h-4 shrink-0", isActive ? "text-white" : "text-zinc-400 group-hover:text-zinc-200")} />
                    <span className="truncate">{item.label}</span>
                  </div>

                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      className={cn(
                        "text-[11px] font-mono px-1.5 py-0.2 rounded-full font-medium",
                        isActive
                          ? "bg-zinc-700 text-white"
                          : "bg-zinc-800 text-zinc-400 group-hover:text-zinc-200"
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="h-px bg-zinc-800/80 my-2 mx-1" />

          {/* CLIENTS SECTION */}
          <div className="space-y-1">
            <div className="flex items-center justify-between px-2 py-1.5 group">
              <div className="flex items-center gap-1.5 text-[13px] font-bold text-zinc-300 tracking-tight">
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                <span>Clients</span>
              </div>

              <Link
                href="/dashboard/engagements/new"
                title="Add client"
                className="p-1 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
              >
                <Plus className="w-4 h-4" />
              </Link>
            </div>

            {/* Client items with Teal Squircle icon */}
            <div className="space-y-0.5">
              {clients.map((client) => {
                const clientHref = `/dashboard/engagements/${client.engagementId}`;
                const isClientActive = pathname.startsWith(clientHref);

                return (
                  <Link
                    key={client.engagementId}
                    href={clientHref}
                    className={cn(
                      "flex items-center gap-3 px-2.5 py-2 rounded-[10px] text-[13px] font-medium transition-colors duration-100",
                      isClientActive
                        ? "bg-[#3f3f42] text-white font-semibold"
                        : "text-zinc-300 hover:bg-zinc-800/60 hover:text-white"
                    )}
                  >
                    <div className="w-6 h-6 rounded-[7px] bg-[#7fe3d4] text-zinc-950 flex items-center justify-center shrink-0 shadow-xs">
                      <List className="w-3.5 h-3.5 stroke-[2.5]" />
                    </div>
                    <span className="truncate">{client.buyer}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* OTHER SECTION SLOTS */
        <div className="flex-1">
          {content[section]}
        </div>
      )}

      {/* SKILLS SLOT (Rendered directly underneath Clients) */}
      {section !== "skills" && (
        <div className="mt-4 pt-3 border-t border-sidebar-border">
          {skills}
        </div>
      )}
    </aside>
  );
}