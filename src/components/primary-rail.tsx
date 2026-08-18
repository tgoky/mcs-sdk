"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Building2,
  BarChart3,
  BookOpen,
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
  type LucideIcon,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Workspace } from "@/lib/workspace";

interface PrimaryRailProps {
  displayName: string;
  userEmail: string;
  workspaces: Workspace[];
  activeWorkspaceId: string;
}

const RAIL_SECTIONS: Array<{ href: string; title: string; icon: LucideIcon }> = [
  { href: "/dashboard", title: "Work", icon: LayoutGrid },
  { href: "/dashboard/engagements", title: "Engagements", icon: Building2 },
  { href: "/dashboard/analytics", title: "Analytics", icon: BarChart3 },
  { href: "/dashboard/library", title: "Library", icon: BookOpen },
  { href: "/dashboard/meetings", title: "Meetings", icon: CalendarClock },
];

function SquishyCounterClaimBadge({ active }: { active: boolean }) {
  return (
    <div
      className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-200 select-none ${
        active
          ? "bg-amber-400 dark:bg-amber-500 shadow-xs scale-105"
          : "bg-amber-100 dark:bg-amber-950/60 hover:bg-amber-200/80 dark:hover:bg-amber-900/50"
      }`}
    >
      <LayoutGrid
        className={`w-3.5 h-3.5 stroke-[2.3px] transition-colors ${
          active
            ? "text-zinc-950 fill-white"
            : "text-amber-700 dark:text-amber-400 fill-amber-200/70 dark:fill-amber-900/60"
        }`}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </div>
  );
}

const PRODUCT_SECTIONS = [
  { href: "/counter-claim", title: "Counter Claim" },
];

function activeSectionHref(pathname: string): string {
  const allSections = [...RAIL_SECTIONS, ...PRODUCT_SECTIONS];
  const nonRootMatches = allSections.filter(
    (s) => s.href !== "/dashboard" && (pathname === s.href || pathname.startsWith(`${s.href}/`))
  );

  if (nonRootMatches.length > 0) {
    return nonRootMatches.sort((a, b) => b.href.length - a.href.length)[0].href;
  }

  return "/dashboard";
}

export function PrimaryRail({ displayName, userEmail, workspaces, activeWorkspaceId }: PrimaryRailProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const pathname = usePathname();
  const activeHref = activeSectionHref(pathname);
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <aside className="w-[76px] bg-background border-r border-zinc-200 dark:border-zinc-900 flex flex-col items-center justify-between py-3 px-1.5 shrink-0 select-none z-20 transition-colors duration-200">
      {/* Top Section */}
      <div className="flex flex-col items-center gap-1.5 w-full">
        <nav className="flex flex-col items-center gap-1 w-full">
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
                    ? "w-full flex flex-col items-center justify-center gap-1 py-2 px-1 text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-xl transition-all shadow-xs font-semibold"
                    : "w-full flex flex-col items-center justify-center gap-1 py-2 px-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100/70 dark:hover:bg-zinc-900/50 rounded-xl border border-transparent transition-all"
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="text-[9.5px] font-medium leading-normal text-center truncate max-w-full px-0.5 pt-0.5 pb-1">
                  {section.title}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="-mx-1.5 w-[76px] border-t border-zinc-200 dark:border-zinc-800/80 my-2 shrink-0" />

        <nav className="flex flex-col items-center gap-1 w-full">
          {PRODUCT_SECTIONS.map((product) => {
            const isActive = product.href === activeHref;
            return (
              <Link
                key={product.href}
                href={product.href}
                title={product.title}
                aria-current={isActive ? "page" : undefined}
                className={
                  isActive
                    ? "w-full flex flex-col items-center justify-center gap-1 py-1.5 px-1 text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-xl transition-all shadow-xs font-semibold"
                    : "w-full flex flex-col items-center justify-center gap-1 py-1.5 px-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100/70 dark:hover:bg-zinc-900/50 rounded-xl border border-transparent transition-all"
                }
              >
                <SquishyCounterClaimBadge active={isActive} />
                <span className="text-[9.5px] font-medium leading-normal text-center truncate max-w-full px-0.5 pt-0.5 pb-1">
                  {product.title}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom Section */}
      <div className="flex flex-col items-center gap-2 w-full relative">
        <a
          href="/home"
          title="Back to account"
          className="w-full flex flex-col items-center justify-center gap-1 py-2 px-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-xl transition-colors"
        >
          <Home className="w-4 h-4 shrink-0" />
          <span className="text-[9.5px] font-medium leading-normal pt-0.5 pb-1">Home</span>
        </a>

        {/* User Profile Avatar Trigger: Replaced Teal with Near-Black */}
        <button
          type="button"
          onClick={() => setPopoverOpen((prev) => !prev)}
          className="w-8 h-8 rounded-full bg-zinc-900 dark:bg-zinc-100 text-[11px] font-bold text-white dark:text-zinc-900 font-mono flex items-center justify-center hover:ring-2 hover:ring-zinc-900/20 dark:hover:ring-zinc-100/20 transition-all cursor-pointer shadow-xs"
        >
          {initials}
        </button>

        {/* Profile Popover */}
        {popoverOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setPopoverOpen(false)} />

            <div className="absolute left-full bottom-0 ml-2 z-50 w-[640px] sm:w-[680px] bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-2xl rounded-2xl overflow-hidden font-sans antialiased animate-in fade-in zoom-in-95 duration-100">
              <div className="flex min-h-[360px] divide-x divide-zinc-200/80 dark:divide-zinc-800">
                {/* LEFT PANE */}
                <div className="w-72 sm:w-80 p-4 bg-[#f8f7fa] dark:bg-black flex flex-col justify-between shrink-0">
                  <div className="space-y-3">
                    <div className="px-1">
                      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        Workspaces
                      </h3>
                      <p className="text-[11px] text-zinc-500 truncate" title={userEmail || displayName}>
                        {userEmail || displayName}
                      </p>
                    </div>

                    <div className="space-y-0.5 max-h-64 overflow-y-auto">
                      {workspaces.map((workspace) => {
                        const isActive = workspace.workspaceId === activeWorkspaceId;
                        return (
                          <form key={workspace.workspaceId} action={`/api/workspaces/${workspace.workspaceId}/switch`} method="POST">
                            <button
                              type="submit"
                              disabled={isActive}
                              className={`w-full flex items-center gap-2.5 py-1.5 px-2 rounded-xl min-w-0 transition-colors ${
                                isActive
                                  ? "bg-white dark:bg-zinc-900/80 shadow-xs cursor-default"
                                  : "cursor-pointer hover:bg-zinc-200/60 dark:hover:bg-zinc-900"
                              }`}
                            >
                              {/* Workspace Avatar: Near-Black */}
                              <div className="w-6 h-6 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold text-[10px] flex items-center justify-center shrink-0 font-mono">
                                {workspace.name.slice(0, 2).toUpperCase()}
                              </div>
                              <span
                                className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate min-w-0"
                                title={workspace.name}
                              >
                                {workspace.name}
                              </span>
                              {isActive && (
                                <Check className="w-3.5 h-3.5 text-zinc-900 dark:text-zinc-100 shrink-0 ml-auto" />
                              )}
                            </button>
                          </form>
                        );
                      })}
                    </div>

                    <Link
                      href="/home/new"
                      onClick={() => setPopoverOpen(false)}
                      className="flex items-center gap-2.5 px-1 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
                    >
                      <Plus className="w-4 h-4 shrink-0" />
                      <span>New workspace</span>
                    </Link>
                  </div>

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

                {/* RIGHT PANE */}
                <div className="flex-1 p-4 flex flex-col justify-between bg-white dark:bg-zinc-900">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      {/* User Header Avatar: Near-Black */}
                      <div className="w-11 h-11 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold text-sm flex items-center justify-center shrink-0 font-mono shadow-xs">
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
                      className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
                    >
                      <Calendar className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" />
                      <span>Set out of office</span>
                    </button>

                    <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-2" />

                    <div className="space-y-1">
                      <Link
                        href="/dashboard/settings"
                        onClick={() => setPopoverOpen(false)}
                        className="flex items-center gap-2.5 px-2 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors rounded-lg"
                      >
                        <Sliders className="w-4 h-4 text-zinc-400 dark:text-zinc-500 shrink-0" />
                        <span>Admin console</span>
                      </Link>

                      <Link
                        href="/dashboard/engagements/new"
                        onClick={() => setPopoverOpen(false)}
                        className="flex items-center gap-2.5 px-2 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors rounded-lg"
                      >
                        <Plus className="w-4 h-4 text-zinc-400 dark:text-zinc-500 shrink-0" />
                        <span>New client</span>
                      </Link>

                      <Link
                        href="/dashboard/settings"
                        onClick={() => setPopoverOpen(false)}
                        className="flex items-center gap-2.5 px-2 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors rounded-lg"
                      >
                        <UserPlus className="w-4 h-4 text-zinc-400 dark:text-zinc-500 shrink-0" />
                        <span>Invite to Showtime</span>
                      </Link>
                    </div>

                    {/* Upgrade button: System Forest Green Token (#006738) */}
                    <button
                      type="button"
                      className="w-full mt-1 flex items-center justify-center px-3 py-2 text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-[#006738] dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 rounded-xl transition-colors cursor-pointer"
                    >
                      <span>Upgrade account</span>
                    </button>

                    <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-2" />

                    <div className="space-y-1">
                      <Link
                        href="/dashboard/settings"
                        onClick={() => setPopoverOpen(false)}
                        className="flex items-center gap-2.5 px-2 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors rounded-lg"
                      >
                        <User className="w-4 h-4 text-zinc-400 dark:text-zinc-500 shrink-0" />
                        <span>Profile</span>
                      </Link>

                      <Link
                        href="/dashboard/settings"
                        onClick={() => setPopoverOpen(false)}
                        className="flex items-center gap-2.5 px-2 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors rounded-lg"
                      >
                        <Settings className="w-4 h-4 text-zinc-400 dark:text-zinc-500 shrink-0" />
                        <span>Settings</span>
                      </Link>

                      <Link
                        href="/api/auth/login"
                        onClick={() => setPopoverOpen(false)}
                        className="flex items-center gap-2.5 px-2 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors rounded-lg"
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