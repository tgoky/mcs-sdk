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
    <aside className="w-14 bg-zinc-950 dark:bg-black flex flex-col items-center justify-between py-3 shrink-0 select-none z-20 transition-colors duration-200">
      {/* Top Section: Gold Brand Mark + Rail Category Icons */}
      <div className="flex flex-col items-center gap-3.5">
        <Link
          href="/dashboard"
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold text-[13px] font-black text-gold-foreground shadow-sm hover:scale-105 transition-all"
        >
          S
        </Link>

        <div className="w-8 h-px bg-zinc-800/80 my-0.5" />

        <Link 
          href="/dashboard" 
          title="Work" 
          className="p-2 text-zinc-100 bg-zinc-900 border border-zinc-800 rounded-lg transition-colors"
        >
          <LayoutGrid className="w-4 h-4" />
        </Link>
        <Link 
          href="/dashboard/runs" 
          title="Executions" 
          className="p-2 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 rounded-lg transition-colors"
        >
          <Bot className="w-4 h-4" />
        </Link>
        <Link 
          href="/dashboard/queue" 
          title="Queue" 
          className="p-2 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 rounded-lg transition-colors"
        >
          <Workflow className="w-4 h-4" />
        </Link>
        <Link 
          href="/dashboard/engagements" 
          title="Engagements" 
          className="p-2 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 rounded-lg transition-colors"
        >
          <FolderKanban className="w-4 h-4" />
        </Link>
      </div>

      {/* Bottom Section: Back to Home & Profile Avatar Popover */}
      <div className="flex flex-col items-center gap-3 relative">
        <a
          href="/home"
          title="Back to account"
          className="p-2 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 rounded-lg transition-colors"
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
            <div className="fixed inset-0 z-40" onClick={() => setPopoverOpen(false)} />
            <div className="absolute left-full bottom-0 ml-3 z-50 w-[480px] sm:w-[500px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-2xl rounded-xl overflow-hidden font-sans antialiased animate-in fade-in zoom-in-95 duration-100">
              <div className="flex min-h-[290px] divide-x divide-zinc-200 dark:divide-zinc-800">
                
                {/* LEFT PANE */}
                <div className="w-44 p-3.5 bg-zinc-50 dark:bg-zinc-950/80 flex flex-col justify-between shrink-0">
                  <div className="space-y-2.5">
                    <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      Account
                    </h3>
                    
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 min-w-0">
                      <div className="w-5 h-5 rounded-full bg-gold text-gold-foreground font-bold text-[10px] flex items-center justify-center shrink-0 font-mono">
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-medium text-zinc-900 dark:text-zinc-100 truncate" title={displayName}>
                          {displayName}
                        </p>
                      </div>
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 ml-auto" />
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Theme</span>
                      <ThemeToggle />
                    </div>

                    <form action="/api/auth/logout" method="POST">
                      <button
                        type="submit"
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-900 rounded-lg transition-colors cursor-pointer bg-transparent border-none"
                      >
                        <LogOut className="w-3.5 h-3.5 shrink-0" />
                        <span>Log out</span>
                      </button>
                    </form>
                  </div>
                </div>

                {/* RIGHT PANE */}
                <div className="flex-1 p-4 flex flex-col justify-between bg-white dark:bg-zinc-900 min-w-0">
                  <div className="min-w-0 space-y-3">
                    <div className="flex items-center gap-3 pb-3 border-b border-zinc-100 dark:border-zinc-800 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-gold text-gold-foreground font-bold text-xs flex items-center justify-center shrink-0 font-mono shadow-sm">
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate" title={displayName}>
                          {displayName}
                        </p>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate" title={userEmail}>
                          {userEmail}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-0.5">
                      <Link
                        href="/dashboard/settings"
                        onClick={() => setPopoverOpen(false)}
                        className="flex items-center gap-2.5 px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors rounded-md"
                      >
                        <User className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" />
                        <span>Profile</span>
                      </Link>
                      <Link
                        href="/dashboard/settings"
                        onClick={() => setPopoverOpen(false)}
                        className="flex items-center gap-2.5 px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors rounded-md"
                      >
                        <Settings className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" />
                        <span>Workspace Settings</span>
                      </Link>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <a
                      href="/home"
                      className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors rounded-md"
                    >
                      <Home className="w-3.5 h-3.5 shrink-0" />
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