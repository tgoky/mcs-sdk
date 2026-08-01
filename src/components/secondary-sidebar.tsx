"use client";

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
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ClientItem {
  engagementId: string;
  buyer: string;
}

interface SecondarySidebarProps {
  clients?: ClientItem[];
  unreadInboxCount?: number;
  queueCount?: number;
}

export function SecondarySidebar({
  clients = [],
  unreadInboxCount = 35,
  queueCount = 3,
}: SecondarySidebarProps) {
  const pathname = usePathname();

  // Primary top navigation items grouped together
  const mainNavItems = [
    {
      href: "/dashboard",
      label: "Home",
      icon: Home,
      exact: true,
    },
    {
      href: "/dashboard/inbox",
      label: "Inbox",
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
      icon: Activity, // Replaced Zap / Thunder with clean Activity icon
    },
    {
      href: "/dashboard/projects",
      label: "Projects",
      icon: FolderKanban, // Grouped together in main list
    },
  ];

  return (
    <aside className="w-60 bg-[#1e1f21] dark:bg-[#1e1f21] border-r border-zinc-800 flex flex-col h-full shrink-0 select-none py-3 px-2 overflow-y-auto font-sans antialiased text-zinc-300">
      {/* ----------------------------------------------------------------- */}
      {/* SECTION HEADER: WORK                                              */}
      {/* ----------------------------------------------------------------- */}
      <div className="px-3 pt-1 pb-2 text-[14px] font-bold text-zinc-100 tracking-tight">
        Work
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* MAIN NAVIGATION GROUP (Home, Inbox, Queue, Executions, Projects)  */}
      {/* ----------------------------------------------------------------- */}
      <nav className="space-y-0.5 mb-4">
        {mainNavItems.map((item) => {
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
                  ? "bg-[#3f3f42] text-white font-semibold shadow-xs" // Screenshot matching charcoal pill highlight
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

      {/* ----------------------------------------------------------------- */}
      {/* CLIENTS SECTION WITH PLUS ICON & TEAL SQUIRCLE ICONS              */}
      {/* ----------------------------------------------------------------- */}
      <div className="space-y-1">
        {/* Header row with dropdown caret + title + Plus icon button */}
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

        {/* Client Items rendering exact Teal Squircle Icon from 3rd screenshot */}
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
                {/* Screenshot 3 Teal Squircle Icon */}
                <div className="w-6 h-6 rounded-[7px] bg-[#7fe3d4] text-zinc-950 flex items-center justify-center shrink-0 shadow-xs">
                  <List className="w-3.5 h-3.5 stroke-[2.5]" />
                </div>

                <span className="truncate">{client.buyer}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </aside>
  );
} 