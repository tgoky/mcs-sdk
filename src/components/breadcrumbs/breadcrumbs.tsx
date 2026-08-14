"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { useBreadcrumbLabels } from "./breadcrumb-context";
import { labelForSegment } from "./label-for-path";

interface Crumb {
  href: string;
  label: string;
  isCurrent: boolean;
}

/**
 * Renders in the header's left side (see layout.tsx) — the one spot in
 * this app that previously had nothing on desktop but the notification
 * bell way over on the right. Built from the URL's own segments plus
 * whatever a page has registered via SetBreadcrumbLabel for anything
 * dynamic, so a client engagement never shows as a raw UUID.
 */
export function Breadcrumbs() {
  const pathname = usePathname();
  const labels = useBreadcrumbLabels();

  const segments = pathname.split("/").filter(Boolean); // drops leading ""
  // Every route in this app lives under /dashboard — the crumb trail
  // always starts there, rendered as a home icon rather than the word
  // "Dashboard" repeated on every single page.
  if (segments[0] !== "dashboard") return null;

  const crumbs: Crumb[] = [];
  let builtPath = "";

  segments.forEach((segment, i) => {
    builtPath += `/${segment}`;
    const isLast = i === segments.length - 1;
    const label = labelForSegment(segment, segments[i - 1], labels[builtPath]);
    crumbs.push({ href: builtPath, label, isCurrent: isLast });
  });

  // First crumb (/dashboard itself) collapses into the home icon below —
  // drop it from the trail so "Dashboard" doesn't show twice in a row
  // when you're actually just on /dashboard (home icon alone is enough).
  const trail = crumbs.slice(1);

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1 min-w-0 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    >
      <Link
        href="/dashboard"
       className="flex items-center justify-center h-6 w-6 shrink-0 rounded-lg text-zinc-400 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
        title="Dashboard"
      >
        <Home size={13} />
      </Link>

      {trail.map((crumb) => (
        <span key={crumb.href} className="flex items-center gap-1 shrink-0">
          <ChevronRight size={12} className="text-zinc-300 dark:text-zinc-700 shrink-0" />
          {crumb.isCurrent ? (
            <span
              className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate max-w-[220px]"
              title={crumb.label}
              aria-current="page"
            >
              {crumb.label}
            </span>
          ) : (
            <Link
              href={crumb.href}
              className="text-xs font-medium text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors truncate max-w-[160px]"
              title={crumb.label}
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
