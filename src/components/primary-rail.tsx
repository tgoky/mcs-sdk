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
  Settings,
  Home,
  type LucideIcon,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

interface PrimaryRailProps {
  displayName: string;
  userEmail: string;
}

/**
 * Main rail navigation items.
 */
const RAIL_SECTIONS: Array<{ href: string; title: string; icon: LucideIcon }> = [
  { href: "/dashboard", title: "Work", icon: LayoutGrid },
  { href: "/dashboard/engagements", title: "Engagements", icon: Building2 },
  { href: "/dashboard/analytics", title: "Analytics", icon: BarChart3 },
  { href: "/dashboard/settings", title: "Settings", icon: Settings },
  { href: "/dashboard/library", title: "Library", icon: BookOpen },
  { href: "/dashboard/meetings", title: "Meetings", icon: CalendarClock },
];

/**
 * Custom Squishy Counter Claim Badge (Gavel)
 */
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

/**
 * Product suite section (segmented below main nav).
 */
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

export function PrimaryRail({ displayName, userEmail }: PrimaryRailProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const pathname = usePathname();
  const activeHref = activeSectionHref(pathname);
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <aside className="w-[76px] bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-900 flex flex-col items-center justify-between py-3 px-1.5 shrink-0 select-none z-20 transition-colors duration-200">
      {/* Top Section: Primary Navigation & Secondary Product Segment */}
      <div className="flex flex-col items-center gap-1.5 w-full">
        {/* Main Rail Links */}
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
                    ? "w-full flex flex-col items-center justify-center gap-1 py-2 px-1 text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl transition-all shadow-xs"
                    : "w-full flex flex-col items-center justify-center gap-1 py-2 px-1 text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100/70 dark:hover:bg-zinc-900/50 rounded-xl border border-transparent transition-all"
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

        {/* Full Edge-to-Edge Divider across the 76px rail */}
        <div className="-mx-1.5 w-[76px] border-t border-zinc-200 dark:border-zinc-800/80 my-2 shrink-0" />

        {/* Product Suite Section with Counter Claim Squishy Badge */}
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
                    ? "w-full flex flex-col items-center justify-center gap-1 py-1.5 px-1 text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl transition-all shadow-xs"
                    : "w-full flex flex-col items-center justify-center gap-1 py-1.5 px-1 text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100/70 dark:hover:bg-zinc-900/50 rounded-xl border border-transparent transition-all"
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

      {/* Bottom Section: Back to Home & Profile Avatar Popover */}
      <div className="flex flex-col items-center gap-2 w-full relative">
        <a
          href="/home"
          title="Back to account"
          className="w-full flex flex-col items-center justify-center gap-1 py-2 px-1 text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-xl transition-colors"
        >
          <Home className="w-4 h-4 shrink-0" />
          <span className="text-[9.5px] font-medium leading-normal pt-0.5 pb-1">Home</span>
        </a>

        {/* User Profile Avatar Trigger */}
        <button
          type="button"
          onClick={() => setPopoverOpen((prev) => !prev)}
          className="w-8 h-8 rounded-full bg-teal-600 dark:bg-teal-500 text-[11px] font-bold text-white font-mono flex items-center justify-center hover:ring-2 hover:ring-teal-500/40 transition-all cursor-pointer shadow-xs"
        >
          {initials}
        </button>

        {/* Cleaned-Up Profile Popover (Obs 2B) */}
        {popoverOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setPopoverOpen(false)} />

            <div className="absolute left-full bottom-0 ml-2 z-50 w-56 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xl rounded-lg p-1.5 text-xs font-sans antialiased animate-in fade-in zoom-in-95 duration-100">
              {/* Identity Header (Non-clickable) */}
              <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-900 mb-1">
                <p className="text-[10px] font-mono text-zinc-400 uppercase">Signed in as</p>
                <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                  {userEmail || displayName}
                </p>
              </div>

              <div className="space-y-0.5">
                {/* Single Settings Destination */}
                <Link
                  href="/dashboard/settings"
                  onClick={() => setPopoverOpen(false)}
                  className="flex items-center gap-2 rounded-md px-3 py-1.5 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                >
                  <Settings className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" />
                  <span>Settings</span>
                </Link>

                {/* Theme Toggle Row */}
                <div className="flex items-center justify-between rounded-md px-3 py-1.5 text-zinc-700 dark:text-zinc-300">
                  <span className="text-xs">Theme</span>
                  <ThemeToggle />
                </div>
              </div>

              {/* Log Out */}
              <div className="border-t border-zinc-100 dark:border-zinc-900 mt-1 pt-1">
                <form action="/api/auth/logout" method="POST">
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer bg-transparent border-none text-xs font-medium"
                  >
                    <LogOut className="w-3.5 h-3.5 shrink-0" />
                    <span>Log out</span>
                  </button>
                </form>
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}