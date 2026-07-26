"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export interface NavLinkItem {
  href: string;
  label: string;
  icon: ReactNode;
  count?: number;
}

function CountBadge({ count, active }: { count: number; active: boolean }) {
  if (count <= 0) return null;
  return (
    <span
      className={`ml-auto shrink-0 min-w-[18px] text-center px-1.5 py-[1px] rounded-full text-[10px] font-mono font-bold transition-colors ${
        active
          ? "bg-zinc-900 text-gold dark:bg-zinc-100 dark:text-zinc-900"
          : "bg-gold/15 text-gold-hover dark:text-gold"
      }`}
    >
      {count}
    </span>
  );
}

/**
 * Every previous version of this nav rendered every link with identical
 * styling regardless of which page you were on — because SidebarNav is an
 * async Server Component, it has no access to the current pathname, so
 * there was never an "active" state at all. That's why the links read as
 * plain colored text rather than real navigation buttons: nothing ever
 * distinguished "where you are" from "where you could go."
 *
 * Split into its own client component for exactly that reason —
 * usePathname() needs "use client", but the count queries in
 * SidebarNav/SidebarSkills need to stay server-side (see their own file
 * comments on why that's wrapped in Suspense rather than inlined in
 * DashboardLayout). This file only ever receives already-fetched data as
 * props; it does no I/O itself.
 */
export function SidebarNavLinks({ links }: { links: NavLinkItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5">
      {links.map((link) => {
        // Exact match for the dashboard root (otherwise it'd "stay active"
        // on every nested route since every path starts with /dashboard);
        // prefix match for everything else so a sub-route like
        // /dashboard/engagements/abc123 still highlights "Engagements".
        const active =
          link.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname === link.href || pathname.startsWith(`${link.href}/`);

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all ${
              active
                ? "bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/40 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            <span
              className={
                active
                  ? "text-gold dark:text-gold-hover"
                  : "text-zinc-400 dark:text-zinc-500"
              }
            >
              {link.icon}
            </span>
            <span>{link.label}</span>
            {link.count !== undefined && <CountBadge count={link.count} active={active} />}
          </Link>
        );
      })}
    </nav>
  );
}
