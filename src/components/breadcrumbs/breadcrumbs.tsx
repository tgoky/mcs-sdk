"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { useBreadcrumbLabels } from "./breadcrumb-context";

/** Friendly labels for every static top-level dashboard route. */
const ROUTE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  engagements: "Engagements",
  new: "New Client",
  queue: "Queue",
  analytics: "Analytics",
  library: "Library",
  settings: "Settings",
  runs: "Runs",
  credentials: "Credentials",
};

/** Segments that look like a UUID/CUID/nanoid — a dynamic record id, not a
 * real page name — and therefore need either a registered label (via
 * SetBreadcrumbLabel) or a generic fallback rather than being shown raw. */
function looksLikeId(segment: string): boolean {
  return /^[a-z0-9]{8,}(-[a-z0-9]{4,}){0,4}$/i.test(segment) && /[0-9]/.test(segment);
}

function fallbackLabelFor(segment: string, parentSegment: string | undefined): string {
  if (parentSegment === "engagements") return "Client";
  if (parentSegment === "runs") return "Run";
  return segment;
}

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
    const registered = labels[builtPath];

    let label: string;
    if (registered) {
      label = registered;
    } else if (ROUTE_LABELS[segment]) {
      label = ROUTE_LABELS[segment];
    } else if (looksLikeId(segment)) {
      label = fallbackLabelFor(segment, segments[i - 1]);
    } else {
      label = segment;
    }

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
        className="flex items-center justify-center h-6 w-6 shrink-0 rounded-md text-zinc-400 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
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
