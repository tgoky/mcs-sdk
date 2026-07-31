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
    <aside className="w-14 bg-zinc-950 border-r border-zinc-900 flex flex-col items-center justify-between py-3 shrink-0 select-none z-20">
      {/* Top Section: Gold Brand Mark + Rail Category Icons */}
      <div className="flex flex-col items-center gap-3.5">
        <Link
          href="/dashboard"
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold text-[13px] font-black text-gold-foreground shadow-sm hover:scale-105 transition-all"
        >
          S
        </Link>

        <div className="w-8 h-px bg-zinc-900 my-0.5" />

        <Link href="/dashboard" title="Work" className="p-2 text-zinc-100 bg-zinc-900 border border-zinc-800 rounded-lg transition-colors">
          <LayoutGrid className="w-4 h-4" />
        </Link>
        <Link href="/dashboard/runs" title="Executions" className="p-2 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 rounded-lg transition-colors">
          <Bot className="w-4 h-4" />
        </Link>
        <Link href="/dashboard/queue" title="Queue" className="p-2 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 rounded-lg transition-colors">
          <Workflow className="w-4 h-4" />
        </Link>
        <Link href="/dashboard/engagements" title="Engagements" className="p-2 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 rounded-lg transition-colors">
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
            <div className="absolute left-12 bottom-0 w-80 bg-zinc-900 border border-zinc-800 text-zinc-200 shadow-2xl rounded-2xl z-50 overflow-hidden flex flex-col font-sans antialiased">
              <div className="flex divide-x divide-zinc-800">
                {/* Left Account Pane */}
                <div className="w-36 p-3 bg-zinc-950/60 flex flex-col justify-between space-y-3">
                  <div>
                    <p className="text-[10px] font-mono font-bold uppercase text-zinc-500 mb-2">
                      Account
                    </p>
                    <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-zinc-800/80 border border-zinc-700/60 text-xs">
                      <div className="w-5 h-5 rounded-full bg-gold text-gold-foreground text-[10px] font-bold flex items-center justify-center shrink-0">
                        {initials}
                      </div>
                      <span className="truncate text-[11px] font-medium text-zinc-200">{displayName}</span>
                      <Check className="w-3 h-3 text-emerald-400 shrink-0 ml-auto" />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-zinc-800/80 space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[10px] text-zinc-500 font-mono">Theme</span>
                      <ThemeToggle />
                    </div>

                    {/* Original POST Logout Form */}
                    <form action="/api/auth/logout" method="POST">
                      <button
                        type="submit"
                        className="w-full flex items-center gap-1.5 p-1.5 text-xs text-zinc-400 hover:text-rose-400 hover:bg-zinc-900 rounded-lg transition-colors cursor-pointer bg-transparent border-none"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Log out</span>
                      </button>
                    </form>
                  </div>
                </div>

                {/* Right Profile & Settings Pane */}
                <div className="flex-1 p-3 space-y-3">
                  <div className="flex items-center gap-2.5 pb-2 border-b border-zinc-800">
                    <div className="w-8 h-8 rounded-full bg-gold text-gold-foreground font-semibold text-xs flex items-center justify-center shrink-0">
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-zinc-100 truncate">{displayName}</p>
                      <p className="text-[10px] text-zinc-500 truncate">{userEmail}</p>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <Link
                      href="/dashboard/settings"
                      onClick={() => setPopoverOpen(false)}
                      className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors"
                    >
                      <User className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Profile</span>
                    </Link>
                    <Link
                      href="/dashboard/settings"
                      onClick={() => setPopoverOpen(false)}
                      className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors"
                    >
                      <Settings className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Settings</span>
                    </Link>
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