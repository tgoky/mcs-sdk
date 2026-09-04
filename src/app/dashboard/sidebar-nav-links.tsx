"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
  const searchParams = useSearchParams();
  const navRef = useRef<HTMLElement>(null);
  const linkRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null);

  // A link's href can carry its own query string (e.g. the product-scoped
  // Queue/Executions/Clients links) — pathname alone never includes one,
  // so matching required checking the link's own product param against
  // the current URL's, not just the path.
  const activeHref =
    links.find((l) => {
      const [linkPath, linkQuery] = l.href.split("?");
      const pathMatches = linkPath === "/dashboard" ? pathname === "/dashboard" : pathname === linkPath || pathname.startsWith(`${linkPath}/`);
      if (!pathMatches) return false;
      if (!linkQuery) return true;
      const linkProduct = new URLSearchParams(linkQuery).get("product");
      return linkProduct === null || searchParams.get("product") === linkProduct;
    })?.href ?? null;

  // Each link previously carried its own active background and animated
  // it in/out independently (`transition-all` on the individual button),
  // which reads as two things fading in unison rather than one thing
  // moving. This measures the currently-active link's actual box
  // (offsetTop/offsetHeight, not assumed from index — link heights are
  // uniform in practice but nothing here depends on that assumption) and
  // slides one shared highlight to it instead.
  //
  // useLayoutEffect + setState here isn't the "adjust state during
  // render" case used elsewhere in this delivery — that pattern is for
  // pure prop-derived values with no DOM dependency. This genuinely needs
  // the link's post-commit rendered position, which only exists after
  // paint, same reasoning as the measurement pass in use-flip-list.ts.
  useLayoutEffect(() => {
    const el = activeHref ? linkRefs.current.get(activeHref) : null;
    setIndicator(el ? { top: el.offsetTop, height: el.offsetHeight } : null);
  }, [activeHref]);

  return (
    <nav ref={navRef} className="relative flex flex-col gap-0.5">
      {indicator && (
        <div
          aria-hidden="true"
          className="sidebar-nav-indicator absolute left-0 right-0 rounded-[10px] bg-white dark:bg-zinc-700 shadow-xs border border-zinc-200/60 dark:border-transparent"
          style={{ height: indicator.height, transform: `translateY(${indicator.top}px)` }}
        />
      )}
      {links.map((link) => {
        const active = link.href === activeHref;

        return (
          <Link
            key={link.href}
            href={link.href}
            ref={(el) => {
              if (el) linkRefs.current.set(link.href, el);
              else linkRefs.current.delete(link.href);
            }}
            aria-current={active ? "page" : undefined}
            className={`group relative z-10 flex items-center justify-between rounded-[10px] px-3 py-2 text-[13px] font-medium transition-colors ${
              active
                ? "text-zinc-900 dark:text-white font-semibold"
                : "text-zinc-600 dark:text-zinc-300 hover:bg-[#f0edf6] dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-white border border-transparent"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                className={
                  active
                    ? "text-zinc-900 dark:text-white shrink-0"
                    : "text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200 shrink-0"
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
                      ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white"
                      : "bg-[#f0edf6] dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200"
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