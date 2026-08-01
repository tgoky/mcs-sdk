"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Building2,
  BarChart3,
  Target,
  CalendarClock,
  LogOut,
  User,
  Settings,
  Home,
  Check,
  Calendar,
  Sliders,
  Plus,
  UserPlus,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

interface PrimaryRailProps {
  displayName: string;
  userEmail: string;
}

/**
 * The top-level sections (Skills removed as it now lives in the secondary sidebar).
 */
const RAIL_SECTIONS: Array<{ href: string; title: string; icon: LucideIcon }> = [
  { href: "/dashboard", title: "Work", icon: LayoutGrid },
  { href: "/dashboard/engagements", title: "Engagements", icon: Building2 },
  { href: "/dashboard/analytics", title: "Analytics", icon: BarChart3 },
  { href: "/dashboard/strategy", title: "Strategy", icon: Target },
  { href: "/dashboard/meetings", title: "Meetings", icon: CalendarClock },
];

function activeSectionHref(pathname: string): string {
  const nonRootMatches = RAIL_SECTIONS.filter(
    (s) => s.href !== "/dashboard" && (pathname === s.href || pathname.startsWith(`${s.href}/`))
  );

  if (nonRootMatches.length > 0) {
    return nonRootMatches.sort((a, b) => b.href.length - a.href.length)[0].href;
  }

  return "/dashboard";
}

export function PrimaryRail({ displayName, userEmail }: PrimaryRailProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const pathname = usePathname();
  const activeHref = activeSectionHref(pathname);
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <aside className="w-[72px] bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-900 flex flex-col items-center justify-between py-3 px-1 shrink-0 select-none z-20 transition-colors duration-200">
      {/* Top Section: Gold Brand Mark + Rail Category Icons with Labels */}
      <div className="flex flex-col items-center gap-3 w-full">
        <Link
          href="/dashboard"
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold text-[13px] font-black text-gold-foreground shadow-sm hover:scale-105 transition-all mb-1"
        >
          S
        </Link>

        <div className="w-8 h-px bg-zinc-200 dark:bg-zinc-900 my-0.5" />

        <nav className="flex flex-col items-center gap-2 w-full">
          {RAIL_SECTIONS.map((section) => {
            const isActive = section.href === activeHref;
            const Icon = section.icon;
            return (
              <Link
                key={section.href}
                href={section.href}
                title={section.title}
                aria-current={isActive ? "page" : undefined}
                className={
                  isActive
                    ? "w-full flex flex-col items-center justify-center gap-1 py-2 px-1 text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl transition-all"
                    : "w-full flex flex-col items-center justify-center gap-1 py-2 px-1 text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100/80 dark:hover:bg-zinc-900/60 rounded-xl border border-transparent transition-all"
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="text-[9px] font-medium leading-none text-center truncate max-w-full">
                  {section.title}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom Section: Back to Home & Profile Avatar Popover */}
      <div className="flex flex-col items-center gap-2.5 w-full relative">
        <a
          href="/home"
          title="Back to account"
          className="w-full flex flex-col items-center justify-center gap-1 py-1.5 px-1 text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-xl transition-colors"
        >
          <Home className="w-4 h-4 shrink-0" />
          <span className="text-[9px] font-medium leading-none">Home</span>
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

            {/* Floating Popover */}
            <div className="absolute left-full bottom-0 ml-2 z-50 w-[560px] sm:w-[580px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-2xl rounded-sm overflow-hidden font-sans antialiased animate-in fade-in zoom-in-95 duration-100">
              <div className="flex min-h-[360px] divide-x divide-zinc-200 dark:divide-zinc-800">
                
                {/* LEFT PANE: Account switcher & Logout */}
                <div className="w-60 p-4 bg-zinc-50 dark:bg-zinc-950/90 flex flex-col justify-between shrink-0">
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      Account
                    </h3>
                    
                    <div className="flex items-center gap-2.5 py-1 px-1">
                      <div className="w-6 h-6 rounded-full bg-purple-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0 font-mono">
                        {initials}
                      </div>
                      <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                        {userEmail || displayName}
                      </span>
                      <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0 ml-1" />
                      <Check className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 shrink-0 ml-auto" />
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

                {/* RIGHT PANE: User Content */}
                <div className="flex-1 p-4 flex flex-col justify-between bg-white dark:bg-zinc-900">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full bg-purple-600 text-white font-bold text-sm flex items-center justify-center shrink-0 font-mono shadow-sm">
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

                    <button
                      type="button"
                      className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-md transition-colors"
                    >
                      <Calendar className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" />
                      <span>Set out of office</span>
                    </button>

                    <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-2" />

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

                    <button
                      type="button"
                      className="w-full mt-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold bg-amber-200/80 hover:bg-amber-300/80 dark:bg-amber-500/20 dark:hover:bg-amber-500/30 text-amber-950 dark:text-amber-200 border border-amber-300/80 dark:border-amber-700/50 rounded-md transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5 shrink-0" />
                      <span>Upgrade to Pro</span>
                    </button>

                    <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-2" />

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