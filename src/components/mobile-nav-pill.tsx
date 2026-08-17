"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Search,
  Menu,
  X,
  ChevronDown,
  LayoutDashboard,
  Users,
  Inbox,
  PlaySquare,
  BarChart3,
  Settings,
  Key,
  Layers,
  Sparkles,
  Send,
  PhoneCall,
  RotateCcw,
  Activity,
  Home,
} from "lucide-react";

interface NavSection {
  title: string;
  href?: string;
  icon: any;
  items?: { name: string; href: string; description?: string }[];
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
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    Clients: true, // Auto-expand Clients by default if desired
  });

  // Close sheet on route change
  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  // Lock body scroll when drawer is open
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
    // Dispatches a Cmd+K event to open the existing global search modal
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        metaKey: true,
        ctrlKey: true,
        bubbles: true,
      })
    );
  };

  return (
    <>
      {/* --- Floating Bottom Nav Pill (Screen Shot Aesthetic) --- */}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 md:hidden">
        <div className="flex items-center bg-zinc-900/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-zinc-800/90 text-zinc-100 shadow-2xl rounded-2xl px-4 py-2.5 space-x-3.5">
          {/* Find / Search Trigger */}
          <button
            onClick={triggerGlobalSearch}
            className="flex items-center gap-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors active:scale-95"
            aria-label="Open Search"
          >
            <Search className="w-4 h-4 text-zinc-400" />
            <span>Find</span>
          </button>

          {/* Divider Line */}
          <div className="h-4 w-[1px] bg-zinc-700/70" />

          {/* Hamburger Menu Toggle */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="flex items-center justify-center text-zinc-300 hover:text-white transition-colors active:scale-95 p-0.5"
            aria-label="Toggle Navigation Menu"
          >
            {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* --- Full Mobile Drawer Sheet --- */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden flex flex-col justify-end">
          {/* Backdrop Overlay */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMenuOpen(false)}
          />

          {/* Sliding Sheet Panel */}
          <div className="relative z-50 w-full max-h-[85vh] bg-zinc-950 border-t border-zinc-800 rounded-t-3xl p-5 overflow-y-auto shadow-2xl space-y-4">
            {/* Sheet Handle */}
            <div className="w-10 h-1 bg-zinc-800 rounded-full mx-auto mb-2" />

            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-500">
                Navigation
              </span>
              <button
                onClick={() => setIsMenuOpen(false)}
                className="p-1 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Section List */}
            <nav className="space-y-1 pb-16">
              {NAVIGATION_SECTIONS.map((section) => {
                const Icon = section.icon;
                const hasSubItems = Boolean(section.items && section.items.length > 0);
                const isExpanded = Boolean(expandedSections[section.title]);

                if (!hasSubItems && section.href) {
                  const isActive = pathname === section.href;
                  return (
                    <Link
                      key={section.title}
                      href={section.href}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-zinc-800 text-white font-semibold"
                          : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                      }`}
                    >
                      <Icon className="w-4 h-4 text-zinc-400 shrink-0" />
                      <span>{section.title}</span>
                    </Link>
                  );
                }

                return (
                  <div key={section.title} className="rounded-xl overflow-hidden">
                    {/* Parent Expandable Header */}
                    <button
                      onClick={() => toggleSection(section.title)}
                      className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-zinc-300 hover:text-white hover:bg-zinc-900 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="w-4 h-4 text-zinc-400 shrink-0" />
                        <span>{section.title}</span>
                      </div>
                      <ChevronDown
                        className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${
                          isExpanded ? "rotate-180 text-zinc-200" : ""
                        }`}
                      />
                    </button>

                    {/* Sub-items List (Accordion) */}
                    {isExpanded && section.items && (
                      <div className="pl-9 pr-3 py-1 space-y-1 bg-zinc-900/40 border-l-2 border-zinc-800 ml-5 my-1 rounded-r-lg">
                        {section.items.map((subItem) => {
                          const isSubActive = pathname === subItem.href;
                          return (
                            <Link
                              key={subItem.href}
                              href={subItem.href}
                              className={`block px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                                isSubActive
                                  ? "bg-zinc-800 text-white font-semibold"
                                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                              }`}
                            >
                              {subItem.name}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}