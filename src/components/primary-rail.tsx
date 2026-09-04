"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LogOut,
  User,
  Settings,
  Home,
  Check,
  Calendar,
  Sliders,
  Plus,
  UserPlus,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Workspace } from "@/lib/workspace";
import { PRIMARY_NAV_SECTIONS, PRODUCT_NAV_SECTIONS } from "@/lib/primary-nav";

interface PrimaryRailProps {
  displayName: string;
  userEmail: string;
  workspaces: Workspace[];
  activeWorkspaceId: string;
  installedPackageIds: string[];
}

const RAIL_SECTIONS = PRIMARY_NAV_SECTIONS;

const NAV_ICON_MAP: Record<string, string> = {
  "/dashboard/engagements": "/images/engagement.png",
  "/dashboard/analytics": "/images/analytic.png",
  "/dashboard/library": "/images/lib.png",
  "/dashboard/meetings": "/images/meeting.png",
};

const PRODUCT_BADGE_COLORS = {
  amber: {
    activeBg: "bg-amber-400 dark:bg-amber-500",
    inactiveBg: "bg-amber-100 dark:bg-amber-950/60 hover:bg-amber-200/80 dark:hover:bg-amber-900/50",
    activeIcon: "text-zinc-950 fill-white",
    inactiveIcon: "text-amber-700 dark:text-amber-400 fill-amber-200/70 dark:fill-amber-900/60",
  },
  indigo: {
    activeBg: "bg-indigo-400 dark:bg-indigo-500",
    inactiveBg: "bg-indigo-100 dark:bg-indigo-950/60 hover:bg-indigo-200/80 dark:hover:bg-indigo-900/50",
    activeIcon: "text-zinc-950 fill-white",
    inactiveIcon: "text-indigo-700 dark:text-indigo-400 fill-indigo-200/70 dark:fill-indigo-900/60",
  },
} as const;

function SquishyProductBadge({
  active,
  icon: Icon,
  iconSrc,
  color,
}: {
  active: boolean;
  icon?: LucideIcon;
  iconSrc?: string;
  color: keyof typeof PRODUCT_BADGE_COLORS;
}) {
  const c = PRODUCT_BADGE_COLORS[color];
  return (
    <div
      className={`w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300 select-none overflow-hidden ${
        active ? `${c.activeBg} shadow-xs` : c.inactiveBg
      }`}
    >
      {iconSrc ? (
        <img src={iconSrc} alt="" className="w-5 h-5 object-contain" />
      ) : Icon ? (
        <Icon
          className={`w-4 h-4 stroke-[2.3px] transition-colors ${active ? c.activeIcon : c.inactiveIcon}`}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </div>
  );
}

// Routes that mean something different per product depending on a
// `?product=` param, rather than owning a whole route prefix outright —
// same shared surface (Queue, Executions, and the Engagements/Clients
// roster), scoped by query string instead of by path. Only the roster's
// own list route (exact match) is scoped this way; its detail/new
// sub-pages (/dashboard/engagements/[id], /dashboard/engagements/new)
// still fall through to the prefix-based Showtime bucket below.
const PRODUCT_SCOPED_ROOTS = ["/dashboard/queue", "/dashboard/runs", "/dashboard/engagements"];

function activeSectionHref(pathname: string, productParam: string | null): string {
  if (PRODUCT_SCOPED_ROOTS.includes(pathname) && productParam === "reputation-manager") {
    return "/dashboard/reputation-manager";
  }
  if (PRODUCT_SCOPED_ROOTS.includes(pathname) && productParam === "showtime") {
    return "/dashboard/showtime";
  }
  if (
    pathname === "/dashboard/showtime" ||
    pathname.startsWith("/dashboard/engagements/") ||
    pathname.startsWith("/dashboard/analytics") ||
    pathname.startsWith("/dashboard/meetings") ||
    pathname.startsWith("/dashboard/modules") ||
    pathname.startsWith("/dashboard/reports")
  ) return "/dashboard/showtime";

  const allSections = [...RAIL_SECTIONS, ...PRODUCT_NAV_SECTIONS];
  const nonRootMatches = allSections.filter(
    (s) => s.href !== "/dashboard" && (pathname === s.href || pathname.startsWith(`${s.href}/`))
  );

  if (nonRootMatches.length > 0) {
    return nonRootMatches.sort((a, b) => b.href.length - a.href.length)[0].href;
  }

  return "/dashboard";
}

export function PrimaryRail({ displayName, userEmail, workspaces, activeWorkspaceId, installedPackageIds }: PrimaryRailProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [switchingWorkspaceId, setSwitchingWorkspaceId] = useState<string | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeHref = activeSectionHref(pathname, searchParams.get("product"));
  const productSections = PRODUCT_NAV_SECTIONS.filter((section) => installedPackageIds.includes(section.productId));
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <aside className="w-[76px] bg-background border-r border-zinc-200 dark:border-zinc-900 flex flex-col items-center justify-between py-3 px-1.5 shrink-0 select-none z-20 transition-colors duration-200">
      {/* Top Section */}
      <div className="flex flex-col items-center gap-1.5 w-full">
        <nav className="flex flex-col items-center gap-1.5 w-full">
          {RAIL_SECTIONS.map((section) => {
            const isActive = section.href === activeHref;
            const Icon = section.icon;
            const customIconSrc = NAV_ICON_MAP[section.href];

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

        <div className="-mx-1.5 w-[76px] border-t border-zinc-200 dark:border-zinc-800/80 my-2 shrink-0" />

        <nav className="flex flex-col items-center gap-1.5 w-full">
          {productSections.map((product) => {
            const isActive = product.href === activeHref;
            return (
              <Link
                key={product.href}
                href={product.href}
                title={product.title}
                aria-current={isActive ? "page" : undefined}
                className={
                  "group relative w-full h-[58px] flex flex-col items-center justify-center p-1 rounded-xl transition-all duration-300 overflow-hidden " +
                  (isActive
                    ? "bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs font-semibold"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100/70 dark:hover:bg-zinc-900/50 border border-transparent")
                }
              >
                {/* Product Badge - Zooms and centers on hover/active */}
                <div
                  className={
                    "transition-all duration-300 ease-out transform flex items-center justify-center " +
                    (isActive
                      ? "scale-[1.3] translate-y-[3px]"
                      : "scale-100 group-hover:scale-[1.3] group-hover:translate-y-[3px]")
                  }
                >
                  <SquishyProductBadge
                    active={isActive}
                    icon={product.icon}
                    iconSrc={product.iconSrc}
                    color={product.color}
                  />
                </div>

                {/* Product Title Text - Collapses and fades out */}
                <span
                  className={
                    "text-[9.5px] font-medium leading-none text-center truncate max-w-full px-0.5 transition-all duration-300 ease-out origin-bottom " +
                    (isActive
                      ? "max-h-0 opacity-0 scale-75 mt-0 pointer-events-none"
                      : "max-h-4 opacity-100 scale-100 mt-1.5 group-hover:max-h-0 group-hover:opacity-0 group-hover:scale-75 group-hover:mt-0 group-hover:pointer-events-none")
                  }
                >
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
          className="group relative w-full h-[58px] flex flex-col items-center justify-center p-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-xl transition-all duration-300 overflow-hidden"
        >
          <div className="transition-all duration-300 ease-out transform group-hover:scale-[1.35] group-hover:translate-y-[3px] flex items-center justify-center">
            <Home className="w-5 h-5 shrink-0" />
          </div>
          <span className="text-[9.5px] font-medium leading-none text-center max-h-4 opacity-100 scale-100 mt-1.5 group-hover:max-h-0 group-hover:opacity-0 group-hover:scale-75 group-hover:mt-0 group-hover:pointer-events-none transition-all duration-300 ease-out origin-bottom">
            Home
          </span>
        </a>

        {/* User Profile Avatar Trigger */}
        <button
          type="button"
          onClick={() => setPopoverOpen((prev) => !prev)}
          className="w-8 h-8 rounded-full bg-[#2a233c] dark:bg-[#e4dff2] text-[11px] font-bold text-white dark:text-[#1f1a2e] font-mono flex items-center justify-center hover:ring-2 hover:ring-[#2a233c]/30 dark:hover:ring-[#e4dff2]/30 transition-all cursor-pointer shadow-xs"
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
                        const isSwitching = switchingWorkspaceId === workspace.workspaceId;
                        return (
                          <form
                            key={workspace.workspaceId}
                            action={`/api/workspaces/${workspace.workspaceId}/switch`}
                            method="POST"
                            onSubmit={() => setSwitchingWorkspaceId(workspace.workspaceId)}
                          >
                            <button
                              type="submit"
                              disabled={isActive || switchingWorkspaceId !== null}
                              className={`w-full flex items-center gap-2.5 py-1.5 px-2 rounded-xl min-w-0 transition-colors disabled:cursor-not-allowed ${
                                isActive
                                  ? "bg-white dark:bg-zinc-900/80 shadow-xs cursor-default"
                                  : switchingWorkspaceId !== null
                                    ? "opacity-50"
                                    : "cursor-pointer hover:bg-zinc-200/60 dark:hover:bg-zinc-900"
                              }`}
                            >
                              <div className="w-6 h-6 rounded-full bg-[#2a233c] dark:bg-[#e4dff2] text-white dark:text-[#1f1a2e] font-bold text-[10px] flex items-center justify-center shrink-0 font-mono">
                                {workspace.name.slice(0, 2).toUpperCase()}
                              </div>
                              <span
                                className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate min-w-0"
                                title={workspace.name}
                              >
                                {workspace.name}
                              </span>
                              {isSwitching ? (
                                <Loader2 className="w-3.5 h-3.5 text-[#2a233c] dark:text-[#e4dff2] shrink-0 ml-auto animate-spin" />
                              ) : (
                                isActive && <Check className="w-3.5 h-3.5 text-[#2a233c] dark:text-[#e4dff2] shrink-0 ml-auto" />
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
                      <div className="w-11 h-11 rounded-full bg-[#2a233c] dark:bg-[#e4dff2] text-white dark:text-[#1f1a2e] font-bold text-sm flex items-center justify-center shrink-0 font-mono shadow-xs">
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

                    <button
                      type="button"
                      className="w-full mt-1 flex items-center justify-center px-3 py-2 text-xs font-semibold bg-[#f0ebf8] hover:bg-[#e3dcf3] dark:bg-purple-950/50 dark:hover:bg-purple-900/60 text-[#2a233c] dark:text-purple-200 border border-[#d6caec] dark:border-purple-800/60 rounded-xl transition-colors cursor-pointer"
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
