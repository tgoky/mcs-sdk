"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  Plus, 
  Menu, 
  Building2, 
  FolderPlus,
  Play, 
  CheckCircle2, 
  Download
} from "lucide-react";
import { NotificationBell } from "@/app/dashboard/notification-bell";
import { Breadcrumbs } from "@/components/breadcrumbs/breadcrumbs";
import { GlobalSearch } from "@/components/global-search";

interface TopNavProps {
  onToggleSidebar: () => void;
  displayName?: string;
}

export function TopNav({ onToggleSidebar }: TopNavProps) {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <header className="relative h-12 w-full bg-background border-b border-zinc-200 dark:border-zinc-800/80 px-3 flex items-center justify-between shrink-0 select-none z-30 gap-3 transition-colors duration-200">
      {/* Left: Sidebar Toggle + Create Button */}
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="hidden md:flex p-1.5 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-md transition-colors cursor-pointer"
          title="Toggle Navigation"
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* Global + Create Omni Dropdown Button */}
        <div className="relative flex items-center">
          <button
            type="button"
            onClick={() => setCreateOpen((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#e40014] hover:bg-[#e40014]/90 dark:bg-rose-600 dark:hover:bg-rose-500 text-white rounded-full transition-all shadow-xs active:scale-95 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Create</span>
          </button>

          {createOpen && (
            <>
              {/* Outside Click Backdrop */}
              <div className="fixed inset-0 z-40" onClick={() => setCreateOpen(false)} />

              {/* Asana-Style Sharp Rectangular Dropdown Card */}
              {/* Mobile: Opens below (left-0 top-full) | Desktop: Opens to the right (md:left-full md:top-0 md:ml-2) */}
              <div className="absolute left-0 top-full mt-1.5 md:left-full md:top-0 md:mt-0 md:ml-2 w-52 bg-white dark:bg-zinc-900 border border-border rounded-sm shadow-xl z-50 py-1 text-zinc-900 dark:text-zinc-100 font-sans antialiased animate-in fade-in zoom-in-95 duration-100">
                <div className="space-y-0.5">
                  <Link
                    href="/dashboard/engagements/new"
                    onClick={() => setCreateOpen(false)}
                    className="group flex items-center gap-2.5 px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <Building2 className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors shrink-0" />
                    <span className="truncate">New Client Engagement</span>
                  </Link>

                  {/* <Link
                    href="/dashboard/projects/new"
                    onClick={() => setCreateOpen(false)}
                    className="group flex items-center gap-2.5 px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <FolderPlus className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors shrink-0" />
                    <span className="truncate">New Project</span>
                  </Link> */}

                  <Link
                    href="/dashboard/queue?action=trigger-skill"
                    onClick={() => setCreateOpen(false)}
                    className="group flex items-center gap-2.5 px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <Play className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors shrink-0" />
                    <span className="truncate">Trigger Skill Run</span>
                  </Link>

                  <Link
                    href="/dashboard/queue?action=new-task"
                    onClick={() => setCreateOpen(false)}
                    className="group flex items-center gap-2.5 px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors shrink-0" />
                    <span className="truncate">New Manual Queue Task</span>
                  </Link>

                  <Link
                    href="/dashboard/analytics?action=export"
                    onClick={() => setCreateOpen(false)}
                    className="group flex items-center gap-2.5 px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors shrink-0" />
                    <span className="truncate">Export a Report</span>
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Middle-left: Breadcrumbs */}
      <div className="hidden md:flex min-w-0 flex-1 max-w-[38%]">
        <Breadcrumbs />
      </div>

      {/* True center: Search */}
      <div className="hidden sm:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <GlobalSearch />
      </div>

      {/* Right: Notification bell */}
      <div className="flex items-center gap-2 ml-auto shrink-0">
        <NotificationBell />
      </div>
    </header>
  );
}