"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  LayoutGrid, 
  Bot, 
  Workflow, 
  FolderKanban, 
  LogOut, 
  User, 
  Settings, 
  Home, 
  Check 
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

interface PrimaryRailProps {
  displayName: string;
  userEmail: string;
}

export function PrimaryRail({ displayName, userEmail }: PrimaryRailProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <aside className="w-14 bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-900 flex flex-col items-center justify-between py-3 shrink-0 select-none z-20 transition-colors duration-200">
      {/* Top Section: Gold Brand Mark + Rail Category Icons */}
      <div className="flex flex-col items-center gap-3.5">
        <Link
          href="/dashboard"
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold text-[13px] font-black text-gold-foreground shadow-sm hover:scale-105 transition-all"
        >
          S
        </Link>

        <div className="w-8 h-px bg-zinc-200 dark:bg-zinc-900 my-0.5" />

        <Link 
          href="/dashboard" 
          title="Work" 
          className="p-2 text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg transition-colors"
        >
          <LayoutGrid className="w-4 h-4" />
        </Link>
        <Link 
          href="/dashboard/runs" 
          title="Executions" 
          className="p-2 text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg transition-colors"
        >
          <Bot className="w-4 h-4" />
        </Link>
        <Link 
          href="/dashboard/queue" 
          title="Queue" 
          className="p-2 text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg transition-colors"
        >
          <Workflow className="w-4 h-4" />
        </Link>
        <Link 
          href="/dashboard/engagements" 
          title="Engagements" 
          className="p-2 text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg transition-colors"
        >
          <FolderKanban className="w-4 h-4" />
        </Link>
      </div>

      {/* Bottom Section: Back to Home & Profile Avatar Popover */}
      <div className="flex flex-col items-center gap-3 relative">
        <a
          href="/home"
          title="Back to account"
          className="p-2 text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg transition-colors"
        >
          <Home className="w-4 h-4" />
        </a>

        {/* User Profile Avatar Trigger */}
        <button
          type="button"
          onClick={() => setPopoverOpen((prev) => !prev)}
          className="w-8 h-8 rounded-full bg-gradient-to-br from-gold to-gold-hover text-[11px] font-bold text-gold-foreground font-mono flex items-center justify-center hover:ring-2 hover:ring-gold/40 transition-all cursor-pointer"
        >
          {initials}
        </button>

        {/* Asana Dual-Pane Profile Popover */}
        {popoverOpen && (
          <>
            {/* Backdrop for outside clicks */}
            <div className="fixed inset-0 z-40" onClick={() => setPopoverOpen(false)} />

            {/* Floating Popover: Positioned cleanly to the right of the rail */}
            <div className="absolute left-14 bottom-1 z-50 w-[420px] bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xl dark:shadow-2xl rounded-2xl overflow-hidden font-sans antialiased animate-in fade-in zoom-in-95 duration-100">
              <div className="flex min-h-[300px] divide-x divide-zinc-200/80 dark:divide-zinc-800">
                
                {/* LEFT PANE: Account switcher & Logout */}
                <div className="w-48 p-4 bg-zinc-50 dark:bg-zinc-950/70 flex flex-col justify-between">
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      Account
                    </h3>
                    
                    {/* Active Account Box */}
                    <div className="flex items-center gap-2 p-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs">
                      <div className="w-6 h-6 rounded-full bg-gold text-gold-foreground font-bold text-[10px] flex items-center justify-center shrink-0 font-mono">
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate">
                          {displayName}
                        </p>
                      </div>
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    </div>
                  </div>

                  {/* Bottom Controls */}
                  <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800/80 space-y-2.5">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Theme</span>
                      <ThemeToggle />
                    </div>

                    <form action="/api/auth/logout" method="POST">
                      <button
                        type="submit"
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-900 rounded-lg transition-colors cursor-pointer bg-transparent border-none"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Log out</span>
                      </button>
                    </form>
                  </div>
                </div>

                {/* RIGHT PANE: User details & Settings navigation */}
                <div className="flex-1 p-4 flex flex-col justify-between bg-white dark:bg-zinc-900">
                  <div>
                    {/* Large User Info Header */}
                    <div className="flex items-center gap-3 pb-3 border-b border-zinc-100 dark:border-zinc-800">
                      <div className="w-10 h-10 rounded-full bg-gold text-gold-foreground font-bold text-sm flex items-center justify-center shrink-0 font-mono shadow-sm">
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                          {displayName}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                          {userEmail}
                        </p>
                      </div>
                    </div>

                    {/* Navigation Options */}
                    <div className="py-2 space-y-0.5">
                      <Link
                        href="/dashboard/settings"
                        onClick={() => setPopoverOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/80 rounded-xl transition-colors"
                      >
                        <User className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
                        <span>Profile</span>
                      </Link>
                      <Link
                        href="/dashboard/settings"
                        onClick={() => setPopoverOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/80 rounded-xl transition-colors"
                      >
                        <Settings className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
                        <span>Workspace Settings</span>
                      </Link>
                    </div>
                  </div>

                  {/* Switch Product Footer */}
                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <a
                      href="/home"
                      className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg transition-colors"
                    >
                      <Home className="w-3.5 h-3.5" />
                      <span>Switch Product / Home</span>
                    </a>
                  </div>
                </div>

              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}