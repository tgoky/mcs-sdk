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
                ? "bg-[#3f3f42] text-white font-semibold shadow-xs"
                : "text-zinc-300 hover:bg-zinc-800/60 hover:text-white"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                className={
                  active
                    ? "text-white shrink-0"
                    : "text-zinc-400 group-hover:text-zinc-200 shrink-0"
                }
              >
                {link.icon}
              </span>
              <span className="truncate">{link.label}</span>
            </div>
            {link.count !== undefined && link.count > 0 && (
              <span
                className={`ml-auto shrink-0 px-1.5 py-[1px] rounded-full text-[11px] font-mono font-medium transition-colors ${
                  active
                    ? "bg-zinc-700 text-white"
                    : "bg-zinc-800 text-zinc-400 group-hover:text-zinc-200"
                }`}
              >
                {link.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}