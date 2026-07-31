"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Menu, Search, Building2, Zap, KeyRound, UserPlus } from "lucide-react";
import { MobileNav } from "@/app/dashboard/mobile-nav";
import { NotificationBell } from "@/app/dashboard/notification-bell";
import { Breadcrumbs } from "@/components/breadcrumbs/breadcrumbs";

interface TopNavProps {
  onToggleSidebar: () => void;
  displayName: string;
}

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/engagements", label: "Engagements" },
  { href: "/dashboard/queue", label: "Queue" },
  { href: "/dashboard/runs", label: "Executions" },
  { href: "/dashboard/analytics", label: "Analytics" },
  { href: "/dashboard/library", label: "Library" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function TopNav({ onToggleSidebar, displayName }: TopNavProps) {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <header className="h-12 w-full bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800/80 px-3 flex items-center justify-between shrink-0 select-none z-30 gap-3 transition-colors duration-200">
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
        <div className="relative">
          <button
            type="button"
            onClick={() => setCreateOpen((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white rounded-full transition-all shadow-sm active:scale-95 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Create</span>
          </button>

          {createOpen && (
            <>
              {/* Outside Click Backdrop */}
              <div className="fixed inset-0 z-40" onClick={() => setCreateOpen(false)} />

              {/* Asana-Style Clean Dropdown Card */}
              <div className="absolute left-0 mt-2 w-60 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl shadow-xl dark:shadow-2xl shadow-zinc-200/60 dark:shadow-black/80 z-50 p-1.5 text-zinc-900 dark:text-zinc-100 animate-in fade-in zoom-in-95 duration-100 font-sans antialiased">
                <p className="px-3 py-1.5 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
                  Quick actions
                </p>

                <div className="space-y-0.5">
                  <Link
                    href="/dashboard/engagements/new"
                    onClick={() => setCreateOpen(false)}
                    className="group flex items-center gap-3 px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/80 rounded-xl transition-colors"
                  >
                    <Building2 className="w-4 h-4 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors" />
                    <span>New Client Engagement</span>
                  </Link>

                  <Link
                    href="/dashboard/runs"
                    onClick={() => setCreateOpen(false)}
                    className="group flex items-center gap-3 px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/80 rounded-xl transition-colors"
                  >
                    <Zap className="w-4 h-4 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors" />
                    <span>Trigger Skill Run</span>
                  </Link>

                  <Link
                    href="/dashboard/settings"
                    onClick={() => setCreateOpen(false)}
                    className="group flex items-center gap-3 px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/80 rounded-xl transition-colors"
                  >
                    <KeyRound className="w-4 h-4 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors" />
                    <span>Manage Credentials</span>
                  </Link>
                </div>

                <div className="h-px bg-zinc-100 dark:bg-zinc-800/80 my-1.5" />

                <div className="space-y-0.5">
                  <Link
                    href="/dashboard/settings"
                    onClick={() => setCreateOpen(false)}
                    className="group flex items-center gap-3 px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/80 rounded-xl transition-colors"
                  >
                    <UserPlus className="w-4 h-4 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors" />
                    <span>Invite Teammate</span>
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Middle: Breadcrumbs */}
      <div className="hidden md:flex min-w-0 flex-1">
        <Breadcrumbs />
      </div>

      {/* Right: Search & Real Notification Bell */}
      <div className="flex items-center gap-2 ml-auto shrink-0">
        <button
          type="button"
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200/70 dark:hover:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-800 rounded-md transition-colors w-40 md:w-52 cursor-pointer"
        >
          <Search className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
          <span className="flex-1 text-left truncate">Search...</span>
          <kbd className="text-[10px] font-mono bg-white dark:bg-zinc-950 px-1 rounded border border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500">⌘K</kbd>
        </button>

        <NotificationBell />
      </div>
    </header>
  );
}