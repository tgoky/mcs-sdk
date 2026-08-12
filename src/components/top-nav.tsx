"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  Plus, 
  Menu, 
  Building2, 
  Play, 
  CheckCircle2, 
  BarChart3, 
  KeyRound, 
  UserPlus 
} from "lucide-react";
import { MobileNav } from "@/app/dashboard/mobile-nav";
import { NotificationBell } from "@/app/dashboard/notification-bell";
import { Breadcrumbs } from "@/components/breadcrumbs/breadcrumbs";
import { GlobalSearch } from "@/components/global-search";

interface TopNavProps {
  onToggleSidebar: () => void;
  displayName: string;
}

const NAV_LINKS = [
  { href: "/dashboard", label: "Work" },
  { href: "/dashboard/inbox", label: "Inbox" },
  { href: "/dashboard/queue", label: "Queue" },
  { href: "/dashboard/runs", label: "Executions" },
  { href: "/dashboard/projects", label: "Projects" },
  { href: "/dashboard/engagements", label: "Engagements" },
  { href: "/dashboard/analytics", label: "Analytics" },
  { href: "/dashboard/strategy", label: "Strategy" },
  { href: "/dashboard/skills", label: "Skills" },
  { href: "/dashboard/meetings", label: "Meetings" },
  { href: "/dashboard/library", label: "Library" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function TopNav({ onToggleSidebar, displayName }: TopNavProps) {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <header className="relative h-12 w-full bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800/80 px-3 flex items-center justify-between shrink-0 select-none z-30 gap-3 transition-colors duration-200">
      {/* Left: Sidebar Toggle + Mobile Nav + Global + Create Button */}
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="hidden md:flex p-1.5 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-md transition-colors cursor-pointer"
          title="Toggle Navigation"
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* Mobile Navigation */}
        <div className="md:hidden">
          <MobileNav links={NAV_LINKS} displayName={displayName} />
        </div>

        {/* Global + Create Omni Dropdown Button */}
        <div className="relative flex items-center">
          <button
            type="button"
            onClick={() => setCreateOpen((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#f15153] hover:bg-[#e0484a] text-white rounded-full transition-all shadow-sm active:scale-95 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Create</span>
          </button>

          {createOpen && (
            <>
              {/* Outside Click Backdrop */}
              <div className="fixed inset-0 z-40" onClick={() => setCreateOpen(false)} />

              {/* Asana-Style Sharp Rectangular Dropdown Card - Positioned RIGHT on the same line */}
              <div className="absolute left-full top-0 ml-2 w-44 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-sm shadow-xl z-50 py-1 text-zinc-900 dark:text-zinc-100 font-sans antialiased animate-in fade-in zoom-in-95 duration-100">
                <div className="space-y-0.5">
                  <Link
                    href="/dashboard/engagements/new"
                    onClick={() => setCreateOpen(false)}
                    className="group flex items-center gap-2.5 px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <Building2 className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors shrink-0" />
                    <span className="truncate">Client Engagement</span>
                  </Link>

                  <Link
                    href="/dashboard/runs"
                    onClick={() => setCreateOpen(false)}
                    className="group flex items-center gap-2.5 px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <Play className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors shrink-0" />
                    <span className="truncate">Trigger Skill Run</span>
                  </Link>

                  <Link
                    href="/dashboard/queue"
                    onClick={() => setCreateOpen(false)}
                    className="group flex items-center gap-2.5 px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors shrink-0" />
                    <span className="truncate">Queue Task</span>
                  </Link>

                  <Link
                    href="/dashboard/modules/leak-map"
                    onClick={() => setCreateOpen(false)}
                    className="group flex items-center gap-2.5 px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <BarChart3 className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors shrink-0" />
                    <span className="truncate">Run Funnel Audit</span>
                  </Link>

                  <Link
                    href="/dashboard/settings"
                    onClick={() => setCreateOpen(false)}
                    className="group flex items-center gap-2.5 px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors shrink-0" />
                    <span className="truncate">API Credential</span>
                  </Link>
                </div>

                <div className="h-px bg-zinc-200 dark:bg-zinc-800 my-1" />

                <div className="space-y-0.5">
                  <Link
                    href="/dashboard/settings"
                    onClick={() => setCreateOpen(false)}
                    className="group flex items-center gap-2.5 px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors shrink-0" />
                    <span className="truncate">Invite Teammate</span>
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Middle-left: Breadcrumbs. Capped instead of flex-1 so a long
          engagement/project name truncates rather than running underneath
          the now-centered search bar. */}
      <div className="hidden md:flex min-w-0 flex-1 max-w-[38%]">
        <Breadcrumbs />
      </div>

      {/* True center: Search — pulled out of the right-hand group and
          absolutely centered on the header so it reads as its own element
          instead of sitting flush against the notification bell. */}
      <div className="hidden sm:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <GlobalSearch />
      </div>

      {/* Right: Notification bell, now on its own */}
      <div className="flex items-center gap-2 ml-auto shrink-0">
        <NotificationBell />
      </div>
    </header>
  );
}