// src/components/mobile-nav-pill.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Search,
  Menu,
  X,
  ChevronRight,
  ChevronDown,
  LayoutDashboard,
  Users,
  Inbox,
  PlaySquare,
  BarChart3,
  Settings,
  Key,
  Layers,
} from "lucide-react";

interface NavSection {
  title: string;
  href?: string;
  icon: any;
  items?: { name: string; href: string }[];
}

const NAVIGATION_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Queue",
    href: "/dashboard/queue",
    icon: Inbox,
  },
  {
    title: "Live Executions",
    href: "/dashboard/runs",
    icon: PlaySquare,
  },
  {
    title: "Clients",
    icon: Users,
    items: [
      { name: "All Clients", href: "/dashboard/engagements" },
      { name: "Add New Client", href: "/dashboard/engagements/new" },
    ],
  },
  {
    title: "Modules",
    icon: Layers,
    items: [
      { name: "Show Rate Setup", href: "/dashboard/modules/pin-down" },
      { name: "Pre-Call Sequence", href: "/dashboard/modules/pile-on" },
      { name: "Call Brief", href: "/dashboard/modules/pre-call-read" },
      { name: "Booking Recovery", href: "/dashboard/modules/win-back" },
      { name: "Funnel Audit", href: "/dashboard/modules/leak-map" },
    ],
  },
  {
    title: "Analytics",
    icon: BarChart3,
    items: [
      { name: "Overview", href: "/dashboard/analytics" },
      { name: "Funnel & Leak Audits", href: "/dashboard/analytics/funnel" },
      { name: "Call Outcomes & Objections", href: "/dashboard/analytics/calls" },
      { name: "Recovery & Rebookings", href: "/dashboard/analytics/recovery" },
      { name: "Ad Cohorts & Sequences", href: "/dashboard/analytics/cohorts" },
      { name: "Unit Economics & Sync", href: "/dashboard/analytics/infrastructure" },
    ],
  },
  {
    title: "Credentials",
    href: "/dashboard/credentials",
    icon: Key,
  },
  {
    title: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
  },
];

export function MobileNavPill() {
  const pathname = usePathname();
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
            {NAVIGATION_SECTIONS.map((section) => {
              const Icon = section.icon;
              const hasSubItems = Boolean(section.items && section.items.length > 0);
              const isExpanded = Boolean(expandedSections[section.title]);
              const isDirectActive = section.href ? pathname === section.href : false;

              if (!hasSubItems && section.href) {
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
                  {isExpanded && section.items && (
                    <div className="bg-zinc-50 dark:bg-zinc-900/30 divide-y divide-zinc-200 dark:divide-zinc-900/60 border-t border-zinc-200 dark:border-zinc-900">
                      {section.items.map((subItem) => {
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
                            <span>{subItem.name}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}