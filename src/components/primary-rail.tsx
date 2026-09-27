"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LogOut,
  User,
  Settings,
  Plus,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Workspace } from "@/lib/workspace";
import type { UserAvatarPrefs } from "@/lib/user-avatar";
import { UserAvatar } from "@/components/user-avatar";
import { PRIMARY_NAV_SECTIONS } from "@/lib/primary-nav";
import { ClientAvatar } from "@/components/client-switcher";

interface PrimaryRailProps {
  displayName: string;
  userEmail: string;
  workspaces: Workspace[];
  activeWorkspaceId: string;
  avatar: UserAvatarPrefs;
}

/**
 * A rail item's own active state. Plain prefix matching is enough now —
 * there's no more per-product `?product=` query variant of a rail item to
 * disambiguate (that machinery, and the two product badges it existed
 * for, is gone).
 */
function isRailItemActive(href: string, pathname: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const NAV_ICON_MAP: Record<string, string> = {
  "/dashboard/analytics": "/images/analytic.png",
  "/dashboard/library": "/images/lib.png",
};

export function PrimaryRail({ displayName, userEmail, workspaces, activeWorkspaceId, avatar }: PrimaryRailProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const pathname = usePathname();
  const initials = displayName.slice(0, 2).toUpperCase();
  const topNavItems = PRIMARY_NAV_SECTIONS;
  const activeClient = workspaces.find((w) => w.workspaceId === activeWorkspaceId);

  return (
    <aside className="w-[76px] bg-background border-r border-zinc-200 dark:border-zinc-900 flex flex-col items-center justify-between py-3 px-1.5 shrink-0 select-none z-20 transition-colors duration-200">
      {/* Top Section */}
      <div className="flex flex-col items-center gap-1.5 w-full">
        {/* The active client's profile, first on the rail. Which client is
            active is picked in the top nav's client switcher. */}
        {activeClient && (
          <Link
            href="/dashboard/engagements"
            title={activeClient.name}
            aria-current={pathname.startsWith("/dashboard/engagements") ? "page" : undefined}
            className={
              "group relative w-full h-[50px] flex items-center justify-center rounded-xl transition-all duration-300 overflow-hidden " +
              (pathname.startsWith("/dashboard/engagements")
                ? "bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-xs"
                : "hover:bg-zinc-100/70 dark:hover:bg-zinc-900/50 border border-transparent")
            }
          >
            {/* Just the active client's initials avatar, sized up — no
                label underneath (the name is already on the row above in
                the dropdown, and on the title tooltip here), this is
                purely a "jump straight to my current client" glyph. */}
            <div
              className={
                "transition-transform duration-300 ease-out " +
                (pathname.startsWith("/dashboard/engagements") ? "scale-105" : "group-hover:scale-110")
              }
            >
              <ClientAvatar name={activeClient.name} size="w-9 h-9" />
            </div>
          </Link>
        )}

        <div className="h-px bg-zinc-200/80 dark:bg-zinc-800/80 w-8 my-0.5" />

        <nav className="flex flex-col items-center gap-1.5 w-full">
          {topNavItems.map((section) => {
            const isActive = isRailItemActive(section.href, pathname);
            const Icon = section.icon;
            const customIconSrc = NAV_ICON_MAP[section.href.split("?")[0]];

            return (
              <Link
                key={section.href}
                href={section.href}
                title={section.title}
                aria-current={isActive ? "page" : undefined}
                className={
                  "group relative w-full h-[58px] flex flex-col items-center justify-center p-1 rounded-xl transition-all duration-300 overflow-hidden " +
                  (isActive
                    ? "bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs font-semibold"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100/70 dark:hover:bg-zinc-900/50 border border-transparent")
                }
              >
                {/* Icon / Image - Zooms up and centers when active or hovered */}
                <div
                  className={
                    "transition-all duration-300 ease-out transform flex items-center justify-center " +
                    (isActive
                      ? "scale-[1.4] translate-y-[3px]"
                      : "scale-100 group-hover:scale-[1.4] group-hover:translate-y-[3px]")
                  }
                >
                  {customIconSrc ? (
                    <img src={customIconSrc} alt="" className="w-6 h-6 shrink-0 object-contain" />
                  ) : (
                    <Icon className="w-5 h-5 shrink-0" />
                  )}
                </div>

                {/* Title Text - Smoothly collapses and fades out on hover or active */}
                <span
                  className={
                    "text-[9.5px] font-medium leading-none text-center truncate max-w-full px-0.5 transition-all duration-300 ease-out origin-bottom " +
                    (isActive
                      ? "max-h-0 opacity-0 scale-75 mt-0 pointer-events-none"
                      : "max-h-4 opacity-100 scale-100 mt-1.5 group-hover:max-h-0 group-hover:opacity-0 group-hover:scale-75 group-hover:mt-0 group-hover:pointer-events-none")
                  }
                >
                  {section.title}
                </span>
              </Link>
            );
          })}
        </nav>

      </div>

      {/* Bottom Section */}
      <div className="flex flex-col items-center gap-2 w-full relative">
        {/* No Home link here: the client switcher in the top nav goes between clients. */}

        {/* User Profile Avatar Trigger */}
        <button
          type="button"
          onClick={() => setPopoverOpen((prev) => !prev)}
          className="w-8 h-8 rounded-full hover:ring-2 hover:ring-[#2a233c]/30 dark:hover:ring-[#e4dff2]/30 transition-all cursor-pointer shadow-xs"
        >
          <UserAvatar
            avatar={avatar}
            identityFallback={userEmail}
            size={32}
            fallback={
              <div className="w-8 h-8 rounded-full bg-[#2a233c] dark:bg-[#e4dff2] text-[11px] font-bold text-white dark:text-[#1f1a2e] font-mono flex items-center justify-center">
                {initials}
              </div>
            }
          />
        </button>

        {/* Profile Popover — the account only. Switching or creating a
            client is the client switcher's job (top of this rail); this
            used to repeat that list as "Workspaces" under a second name,
            plus "Admin console" / "Invite" links that only opened Settings. */}
        {popoverOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setPopoverOpen(false)} />

            <div className="absolute left-full bottom-0 ml-2 z-50 w-72 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-2xl rounded-2xl overflow-hidden font-sans antialiased animate-in fade-in zoom-in-95 duration-100 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <UserAvatar
                  avatar={avatar}
                  identityFallback={userEmail}
                  size={40}
                  fallback={
                    <div className="w-10 h-10 rounded-full bg-[#2a233c] dark:bg-[#e4dff2] text-white dark:text-[#1f1a2e] font-bold text-sm flex items-center justify-center shrink-0 font-mono shadow-xs">
                      {initials}
                    </div>
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{displayName}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{userEmail}</p>
                </div>
              </div>

              <div className="h-px bg-zinc-100 dark:bg-zinc-800" />

              <div className="space-y-1">
                <Link
                  href="/dashboard/settings/profile"
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

              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
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
          </>
        )}
      </div>
    </aside>
  );
}
