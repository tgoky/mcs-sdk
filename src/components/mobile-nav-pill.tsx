// src/components/mobile-nav-pill.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Menu, X, Check, Loader2, LogOut, Plus } from "lucide-react";
import { PRIMARY_NAV_SECTIONS, SETTINGS_NAV } from "@/lib/primary-nav";
import type { Workspace } from "@/lib/workspace";

// Fix: this file used to hardcode its own NAVIGATION_SECTIONS — a second,
// independently-authored guess at the app's structure that didn't match
// the desktop primary rail (different labels for the same destination,
// two invented sections desktop doesn't have, and an Analytics sub-list
// pointing at five routes that don't exist). Now reads the same
// PRIMARY_NAV_SECTIONS the desktop rail reads, so "the tabs should at
// least align" holds by construction instead of by remembering to update
// two files in sync. The old per-product accordion section (Showtime/
// Reputation Manager, each expanding into its own Engagements/Analytics/
// Meetings-or-Incidents sub-list) is gone along with the desktop rail's
// two product badges it mirrored — this is a flat list now, same shape
// on mobile as on desktop.

export function MobileNavPill({
  displayName,
  userEmail,
  workspaces = [],
  activeWorkspaceId,
}: {
  displayName?: string;
  userEmail?: string;
  workspaces?: Workspace[];
  activeWorkspaceId?: string;
}) {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [switchingWorkspaceId, setSwitchingWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isMenuOpen]);

  const triggerGlobalSearch = () => {
    // GlobalSearch (components/global-search.tsx) listens for this event
    // unconditionally, regardless of viewport — see the useEffect there.
    // This replaces a previous approach that queried the DOM for a
    // button[aria-label*="Search"] that didn't exist and dispatched fake
    // ⌘K keyboard events, neither of which reliably opened the palette.
    setIsMenuOpen(false);
    window.dispatchEvent(new CustomEvent("open-global-search"));
  };

  return (
    <>
      {/* Floating Bottom Navigation Bar (Find | ≡) */}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 md:hidden font-sans tracking-tight antialiased">
        <div className="flex items-center bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-2xl rounded-2xl px-4 py-2.5 space-x-3.5">
          <button
            onClick={triggerGlobalSearch}
            className="flex items-center gap-2 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors active:scale-95 cursor-pointer"
            aria-label="Open Search"
          >
            <Search className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
            <span>Find</span>
          </button>

          <div className="h-4 w-[1px] bg-zinc-300 dark:bg-zinc-700/70" />

          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors active:scale-95 p-0.5 cursor-pointer"
            aria-label="Toggle Menu"
          >
            {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Flat Full-Screen Edge-to-Edge List Menu */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-50 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans tracking-tight antialiased flex flex-col md:hidden overflow-y-auto">
          {/* Sticky Top Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800/80 sticky top-0 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md z-10">
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Navigation
            </span>
            <button
              onClick={() => setIsMenuOpen(false)}
              className="p-1.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
              aria-label="Close Navigation"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Full-Bleed List */}
          <div className="flex-1 divide-y divide-zinc-200 dark:divide-zinc-900 pb-24">
            {PRIMARY_NAV_SECTIONS.map((section) => {
              const Icon = section.icon;
              const isDirectActive = pathname === section.href;

              return (
                <Link
                  key={section.title}
                  href={section.href}
                  className={`flex items-center gap-3.5 px-5 py-4 text-base transition-colors ${
                    isDirectActive
                      ? "bg-zinc-100 dark:bg-zinc-900 font-semibold text-zinc-900 dark:text-white"
                      : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900/50 hover:text-zinc-900 dark:hover:text-white font-medium"
                  }`}
                >
                  <Icon className="w-5 h-5 text-zinc-500 dark:text-zinc-400 shrink-0" />
                  <span>{section.title}</span>
                </Link>
              );
            })}

            {/* Fix: Settings used to sit inline in the same flat list as
                Work/Library/Analytics — desktop only ever reaches it
                through the avatar popover, never as a rail icon, so
                giving it equal top-level billing here was one more point
                of mismatch. Kept reachable (mobile has no popover to
                tuck it into) but visually set apart the way the rail's
                bottom section is set apart from its main tabs. */}
            <Link
              href={SETTINGS_NAV.href}
              className={`flex items-center gap-3.5 px-5 py-4 text-base transition-colors ${
                pathname === SETTINGS_NAV.href
                  ? "bg-zinc-100 dark:bg-zinc-900 font-semibold text-zinc-900 dark:text-white"
                  : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900/50 hover:text-zinc-900 dark:hover:text-white font-medium"
              }`}
            >
              <SETTINGS_NAV.icon className="w-5 h-5 text-zinc-500 dark:text-zinc-400 shrink-0" />
              <span>{SETTINGS_NAV.label}</span>
            </Link>

            {/* Fix: desktop's only client switcher and only sign-out control
                both live in PrimaryRail, which is `hidden md:flex` — mobile
                had no way to switch clients or log out from inside the
                dashboard at all. Reusing the same
                /api/workspaces/:id/switch POST + /api/auth/logout POST
                pattern primary-rail.tsx uses, just laid out for a full-bleed
                mobile list instead of a popover. */}
            {workspaces.length > 0 && (
              <div className="px-5 py-4">
                <p className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">
                  Workspaces
                </p>
                <div className="space-y-1">
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
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl min-w-0 text-sm transition-colors disabled:cursor-not-allowed ${
                            isActive
                              ? "bg-zinc-100 dark:bg-zinc-900 font-semibold cursor-default"
                              : switchingWorkspaceId !== null
                              ? "opacity-50"
                              : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900/50"
                          }`}
                        >
                          <span className="w-7 h-7 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold text-[11px] flex items-center justify-center shrink-0 font-mono">
                            {workspace.name.slice(0, 2).toUpperCase()}
                          </span>
                          <span className="truncate min-w-0">{workspace.name}</span>
                          {isSwitching ? (
                            <Loader2 className="w-4 h-4 shrink-0 ml-auto animate-spin" />
                          ) : (
                            isActive && <Check className="w-4 h-4 shrink-0 ml-auto" />
                          )}
                        </button>
                      </form>
                    );
                  })}
                </div>
                <Link
                  href="/home/new"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 mt-1 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  <span>New workspace</span>
                </Link>
              </div>
            )}

            <div className="px-5 py-4">
              {displayName && (
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate mb-3">
                  {displayName}
                  {userEmail && (
                    <span className="block text-xs font-normal text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                      {userEmail}
                    </span>
                  )}
                </p>
              )}
              <form action="/api/auth/logout" method="POST">
                <button
                  type="submit"
                  className="flex items-center gap-3 px-3 py-2.5 -mx-3 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900/50 rounded-xl transition-colors cursor-pointer bg-transparent border-none w-full"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  <span>Sign out</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
