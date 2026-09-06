"use client";

// src/app/dashboard/reports/reports-client-links.tsx
//
// The client picker for Reports — a vertical nav list living directly
// underneath that product's trimmed Home/Clients/Reports links in the
// secondary sidebar (see reports-sidebar-section.tsx), not the page
// content. `product` is fixed per instance (this component is rendered
// once per product, never generically) so every link it builds carries
// the right `?product=` — that's what keeps a client picked while
// looking at Reputation Manager's Reports from ever being a Showtime-only
// client, and vice versa.
//
// Same sliding-highlight technique as sidebar-nav-links.tsx (measure the
// active row's real offsetTop/offsetHeight via useLayoutEffect, slide one
// shared indicator to it), but matched against the `client` searchParam
// instead of pathname — every client link shares the exact same
// /dashboard/reports pathname, only ?client= differs, so pathname-based
// matching can never tell them apart.
//
// Deliberately real <Link> navigation, not client state: selecting a
// client triggers a genuine per-client server computation
// (computeClientReportAllPeriods / computeRepClientReportAllPeriods +
// report notes), not a cheap client fetch of already-persisted messages,
// and these ?client= URLs are already bookmarked/shared outside the app,
// so the URL scheme has to stay real and stable.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { CircleUserRound } from "lucide-react";
import type { ProductId } from "@/lib/product-catalog";

export interface ReportableClient {
  engagementId: string;
  buyer: string;
  bookingPlatform: string | null;
}

export function ReportsClientLinks({ clients, product }: { clients: ReportableClient[]; product: ProductId }) {
  const searchParams = useSearchParams();
  const currentProduct = searchParams.get("product");
  // Mirrors page.tsx's own fallback (`clients.find(...) ?? clients[0]`) so
  // the sidebar's initial highlight agrees with what the server actually
  // rendered when you land on /dashboard/reports with no ?client= yet.
  // Only trusts ?client= when it's this instance's own product that's
  // actually active — otherwise the OTHER product's sidebar instance
  // would also see the same param and both would think they're selected.
  const selectedId = currentProduct === product ? (searchParams.get("client") ?? clients[0]?.engagementId ?? null) : null;

  const linkRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const el = selectedId ? linkRefs.current.get(selectedId) : null;
    setIndicator(el ? { top: el.offsetTop, height: el.offsetHeight } : null);
  }, [selectedId, clients]);

  if (clients.length === 0) return null;

  return (
    <nav className="relative flex flex-col gap-0.5">
      {indicator && (
        <div
          aria-hidden="true"
          className="absolute left-0 right-0 rounded-[10px] bg-white dark:bg-zinc-700 shadow-xs border border-zinc-200/60 dark:border-transparent transition-[transform,height] duration-150 ease-out"
          style={{ height: indicator.height, transform: `translateY(${indicator.top}px)` }}
        />
      )}
      {clients.map((client) => {
        const active = client.engagementId === selectedId;
        return (
          <Link
            key={client.engagementId}
            href={`/dashboard/reports?product=${product}&client=${client.engagementId}`}
            ref={(el) => {
              if (el) linkRefs.current.set(client.engagementId, el);
              else linkRefs.current.delete(client.engagementId);
            }}
            aria-current={active ? "page" : undefined}
            className={`group relative z-10 flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] font-medium transition-colors truncate ${
              active
                ? "text-zinc-900 dark:text-white font-semibold"
                : "text-zinc-600 dark:text-zinc-300 hover:bg-[#f0edf6] dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            <CircleUserRound
              className={`w-4 h-4 shrink-0 ${active ? "text-zinc-900 dark:text-white" : "text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200"}`}
              strokeWidth={1.75}
            />
            <span className="truncate">{client.buyer}</span>
          </Link>
        );
      })}
    </nav>
  );
}
