// src/components/mobile-nav-pill.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Search, Menu, X, ChevronRight, ChevronDown } from "lucide-react";
import { PRIMARY_NAV_SECTIONS, PRODUCT_NAV_SECTIONS, PRODUCT_RAIL_CHILDREN, SETTINGS_NAV } from "@/lib/primary-nav";

/** Same query-string-aware matching as primary-rail.tsx's isRailItemActive — a sub-item's href can carry its own `?product=`, which a plain pathname compare can't see. */
function isNavHrefActive(href: string, pathname: string, searchParams: URLSearchParams): boolean {
  const [itemPath, itemQuery] = href.split("?");
  const pathMatches = pathname === itemPath || pathname.startsWith(`${itemPath}/`);
  if (!pathMatches) return false;
  if (!itemQuery) return true;
  const wantedProduct = new URLSearchParams(itemQuery).get("product");
  return wantedProduct === null || searchParams.get("product") === wantedProduct;
}

// Fix: this file used to hardcode its own NAVIGATION_SECTIONS — a second,
// independently-authored guess at the app's structure that didn't match
// the desktop primary rail (different labels for the same destination,
// two invented sections desktop doesn't have, and an Analytics sub-list
// pointing at five routes that don't exist). Now reads the same
// PRIMARY_NAV_SECTIONS the desktop rail reads, so "the tabs should at
// least align" holds by construction instead of by remembering to update
// two files in sync.

export function MobileNavPill({ installedPackageIds = [] }: { installedPackageIds?: string[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

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

  const toggleSection = (title: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

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
              const hasSubItems = Boolean(section.children && section.children.length > 0);
              const isExpanded = Boolean(expandedSections[section.title]);
              const isDirectActive = pathname === section.href;

              if (!hasSubItems) {
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
              }

              return (
                <div key={section.title} className="flex flex-col">
                  {/* Parent Item */}
                  <button
                    onClick={() => toggleSection(section.title)}
                    className={`w-full flex items-center justify-between px-5 py-4 text-base font-medium transition-colors cursor-pointer ${
                      isExpanded
                        ? "bg-zinc-100 dark:bg-zinc-900/40 text-zinc-900 dark:text-white"
                        : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900/50"
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <Icon className="w-5 h-5 text-zinc-500 dark:text-zinc-400 shrink-0" />
                      <span>{section.title}</span>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
                    )}
                  </button>

                  {/* Sub-item Edge-to-Edge Nested List */}
                  {isExpanded && section.children && (
                    <div className="bg-zinc-50 dark:bg-zinc-900/30 divide-y divide-zinc-200 dark:divide-zinc-900/60 border-t border-zinc-200 dark:border-zinc-900">
                      {section.children.map((subItem) => {
                        const isSubActive = pathname === subItem.href;
                        return (
                          <Link
                            key={subItem.href}
                            href={subItem.href}
                            className={`flex items-center justify-between pl-12 pr-5 py-3.5 text-sm transition-colors ${
                              isSubActive
                                ? "bg-zinc-100 dark:bg-zinc-900 font-semibold text-zinc-900 dark:text-white"
                                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900/20 font-medium"
                            }`}
                          >
                            <span>{subItem.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {PRODUCT_NAV_SECTIONS.filter((section) => installedPackageIds.includes(section.productId)).map((section) => {
              const Icon = section.icon;
              const children = PRODUCT_RAIL_CHILDREN[section.productId];
              // A product is "active" (and its own icons — Engagements/
              // Analytics/Meetings-or-Incidents — worth showing) once the
              // current route resolves into that product's own space,
              // mirroring primary-rail.tsx's activeSectionHref bucketing.
              const engagementsScopedToShowtime =
                pathname === "/dashboard/engagements"
                  ? searchParams.get("product") === "showtime"
                  : pathname.startsWith("/dashboard/engagements/");
              const isActive = pathname === section.href ||
                (section.productId === "showtime" && (engagementsScopedToShowtime || pathname.startsWith("/dashboard/analytics") || pathname.startsWith("/dashboard/meetings") || pathname.startsWith("/dashboard/modules") || pathname.startsWith("/dashboard/reports"))) ||
                (section.productId === "reputation-manager" && pathname.startsWith("/dashboard/reputation-manager"));
              const isExpanded = Boolean(expandedSections[section.title]) || isActive;

              return (
                <div key={section.productId} className="flex flex-col">
                  <div
                    className={`w-full flex items-center justify-between px-5 py-4 text-base transition-colors ${
                      isActive
                        ? "bg-zinc-100 dark:bg-zinc-900 font-semibold text-zinc-900 dark:text-white"
                        : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900/50 font-medium"
                    }`}
                  >
                    <Link href={section.href} className="flex items-center gap-3.5 flex-1">
                      <Icon className="w-5 h-5 text-zinc-500 dark:text-zinc-400 shrink-0" />
                      <span>{section.title}</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => toggleSection(section.title)}
                      aria-label={isExpanded ? `Collapse ${section.title}` : `Expand ${section.title}`}
                      className="p-1.5 -m-1.5 cursor-pointer"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
                      )}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="bg-zinc-50 dark:bg-zinc-900/30 divide-y divide-zinc-200 dark:divide-zinc-900/60 border-t border-zinc-200 dark:border-zinc-900">
                      {children.map((child) => {
                        const isChildActive = isNavHrefActive(child.href, pathname, searchParams);
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={`flex items-center justify-between pl-12 pr-5 py-3.5 text-sm transition-colors ${
                              isChildActive
                                ? "bg-zinc-100 dark:bg-zinc-900 font-semibold text-zinc-900 dark:text-white"
                                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900/20 font-medium"
                            }`}
                          >
                            <span>{child.title}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Fix: Settings used to sit inline in the same flat list as
                Work/Engagements/Analytics — desktop only ever reaches it
                through the avatar popover, never as a rail icon, so
                giving it equal top-level billing here was one more point
                of mismatch. Kept reachable (mobile has no popover to
                tuck it into) but visually set apart the way the rail's
                bottom section is set apart from its main 5 tabs. */}
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
          </div>
        </div>
      )}
    </>
  );
}
