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
  Check,
  Calendar,
  Sliders,
  Plus,
  UserPlus
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

            {/* Floating Popover: Sharp rectangular container with expanded left-pane width */}
            <div className="absolute left-full bottom-0 ml-2 z-50 w-[600px] sm:w-[620px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-2xl rounded-sm overflow-hidden font-sans antialiased animate-in fade-in zoom-in-95 duration-100">
              <div className="flex min-h-[360px] divide-x divide-zinc-200 dark:divide-zinc-800">
                
                {/* LEFT PANE: Account switcher & Logout (Wider w-72 to prevent text clipping) */}
                <div className="w-72 p-4 bg-zinc-50 dark:bg-zinc-950/90 flex flex-col justify-between shrink-0 min-w-0">
                  <div className="space-y-4 min-w-0">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      Account
                    </h3>
                    
                    {/* Active Account Row - Styled cleanly like Asana with gold avatar */}
                    <div className="flex items-center gap-2.5 py-1 px-1 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-gold text-gold-foreground font-bold text-[10px] flex items-center justify-center shrink-0 font-mono">
                        {initials}
                      </div>
                      <span 
                        className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate flex-1 min-w-0" 
                        title={userEmail || displayName}
                      >
                        {userEmail || displayName}
                      </span>
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0 ml-1" />
                      <Check className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0 ml-1" />
                    </div>
                  </div>

                  {/* Bottom Controls */}
                  <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Theme</span>
                      <ThemeToggle />
                    </div>

                    <form action="/api/auth/logout" method="POST">
                      <button
                        type="submit"
                        className="flex items-center gap-2.5 px-1 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer bg-transparent border-none"
                      >
                        <LogOut className="w-4 h-4 shrink-0" />
                        <span>Log out</span>
                      </button>
                    </form>
                  </div>
                </div>

                {/* RIGHT PANE: Full Asana User Content */}
                <div className="flex-1 p-4 flex flex-col justify-between bg-white dark:bg-zinc-900 min-w-0">
                  <div className="space-y-3 min-w-0">
                    {/* Large User Info Header with Gold Avatar */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-full bg-gold text-gold-foreground font-bold text-sm flex items-center justify-center shrink-0 font-mono shadow-sm">
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

                    {/* Set Out of Office Button */}
                    <button
                      type="button"
                      className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-md transition-colors"
                    >
                      <Calendar className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" />
                      <span>Set out of office</span>
                    </button>

                    <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-2" />

                    {/* Workspace Actions */}
                    <div className="space-y-1">
                      <Link
                        href="/dashboard/settings"
                        onClick={() => setPopoverOpen(false)}
                        className="flex items-center gap-2.5 px-2 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors rounded-md"
                      >
                        <Sliders className="w-4 h-4 text-zinc-400 dark:text-zinc-500 shrink-0" />
                        <span>Admin console</span>
                      </Link>

                      <Link
                        href="/dashboard/engagements/new"
                        onClick={() => setPopoverOpen(false)}
                        className="flex items-center gap-2.5 px-2 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors rounded-md"
                      >
                        <Plus className="w-4 h-4 text-zinc-400 dark:text-zinc-500 shrink-0" />
                        <span>New workspace</span>
                      </Link>

                      <Link
                        href="/dashboard/settings"
                        onClick={() => setPopoverOpen(false)}
                        className="flex items-center gap-2.5 px-2 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors rounded-md"
                      >
                        <UserPlus className="w-4 h-4 text-zinc-400 dark:text-zinc-500 shrink-0" />
                        <span>Invite to Showtime</span>
                      </Link>
                    </div>

                    {/* Solid Gold/Amber Upgrade Button (Icon Removed, Text Renamed) */}
                    <button
                      type="button"
                      className="w-full mt-1.5 flex items-center justify-center px-3 py-2 text-xs font-semibold bg-[#ece9e6] hover:bg-[#c7b5a1] text-zinc-950 dark:bg-[#e0d9d9] dark:hover:bg-[#e3c3a0] rounded-md transition-colors shadow-sm cursor-pointer"
                    >
                      <span>Upgrade Account</span>
                    </button>

                    <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-2" />

                    {/* Account Settings Options */}
                    <div className="space-y-1">
                      <Link
                        href="/dashboard/settings"
                        onClick={() => setPopoverOpen(false)}
                        className="flex items-center gap-2.5 px-2 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors rounded-md"
                      >
                        <User className="w-4 h-4 text-zinc-400 dark:text-zinc-500 shrink-0" />
                        <span>Profile</span>
                      </Link>

                      <Link
                        href="/dashboard/settings"
                        onClick={() => setPopoverOpen(false)}
                        className="flex items-center gap-2.5 px-2 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors rounded-md"
                      >
                        <Settings className="w-4 h-4 text-zinc-400 dark:text-zinc-500 shrink-0" />
                        <span>Settings</span>
                      </Link>

                      <Link
                        href="/api/auth/login"
                        onClick={() => setPopoverOpen(false)}
                        className="flex items-center gap-2.5 px-2 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors rounded-md"
                      >
                        <Plus className="w-4 h-4 text-zinc-400 dark:text-zinc-500 shrink-0" />
                        <span>Add another account</span>
                      </Link>
                    </div>
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