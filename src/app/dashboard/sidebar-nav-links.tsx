"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { LiveCountBadge } from "./live-count-badge";

export interface NavLinkItem {
  href: string;
  label: string;
  icon: ReactNode;
  count?: number;
  /** When true, count is rendered by LiveCountBadge (polls for updates) instead of as a static number. `count` is still used as its initial value. */
  live?: boolean;
  /** Initial value for LiveCountBadge's second number — see that component's doc. Ignored unless `live` is also set. */
  unseenCount?: number;
}

export function SidebarNavLinks({ links }: { links: NavLinkItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5">
      {links.map((link) => {
        const active =
          link.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname === link.href || pathname.startsWith(`${link.href}/`);

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`group relative flex items-center justify-between rounded-[10px] px-3 py-2 text-[13px] font-medium transition-all ${
              active
                ? "bg-white text-zinc-900 font-semibold shadow-xs"
                : "text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                className={
                  active
                    ? "text-zinc-900 shrink-0"
                    : "text-zinc-500 group-hover:text-zinc-800 shrink-0"
                }
              >
                {link.icon}
              </span>
              <span className="truncate">{link.label}</span>
            </div>
            {link.live ? (
              <LiveCountBadge initialCount={link.count ?? 0} initialUnseenCount={link.unseenCount ?? 0} active={active} />
            ) : (
              link.count !== undefined && link.count > 0 && (
                <span
                  className={`ml-auto shrink-0 px-2 py-[1px] rounded-full text-[11px] font-mono font-medium transition-colors ${
                    active
                      ? "bg-zinc-100 text-zinc-900"
                      : "bg-zinc-200/80 text-zinc-700 group-hover:bg-zinc-200 group-hover:text-zinc-900"
                  }`}
                >
                  {link.count}
                </span>
              )
            )}
          </Link>
        );
      })}
    </nav>
  );
}