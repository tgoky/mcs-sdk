"use client";

// src/app/dashboard/reports/reports-client-links.tsx
//
// The client switcher for /dashboard/reports — a horizontal row of pills
// inside the page content (not the secondary sidebar: Reports is
// product-scoped via `?product=` exactly like Queue/Executions/Clients,
// so the sidebar always shows the current product's own Home/Clients/
// Reports/Queue/Executions nav — see secondary-sidebar.tsx's
// isProductScopedRoot and this file's own former sidebar-nav-styled
// version, which broke that by replacing the whole sidebar with a bare,
// cross-product client list).
//
// Real <Link> navigation, not client state: selecting a client triggers a
// genuine per-client server computation (computeClientReportAllPeriods /
// computeRepClientReportAllPeriods + report notes), not a cheap client
// fetch of already-persisted messages, and these ?client= URLs are
// already bookmarked/shared outside the app, so the URL scheme has to
// stay real and stable. `product` is carried through unchanged so
// switching clients never drops the current product scope.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CircleUserRound } from "lucide-react";

export interface ReportableClient {
  engagementId: string;
  buyer: string;
  bookingPlatform: string | null;
}

export function ReportsClientLinks({ clients }: { clients: ReportableClient[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const product = searchParams.get("product");
  // Mirrors page.tsx's own fallback (`clients.find(...) ?? clients[0]`) so
  // the pill row's initial highlight agrees with what the server actually
  // rendered when you land on /dashboard/reports with no ?client= yet.
  const selectedId = searchParams.get("client") ?? clients[0]?.engagementId ?? null;

  if (clients.length === 0) return null;

  return (
    <nav className="flex flex-wrap items-center gap-2">
      {clients.map((client) => {
        const active = client.engagementId === selectedId;
        const href = product
          ? `${pathname}?product=${product}&client=${client.engagementId}`
          : `${pathname}?client=${client.engagementId}`;

        return (
          <Link
            key={client.engagementId}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer whitespace-nowrap ${
              active
                ? "border-zinc-400 dark:border-zinc-400 text-zinc-900 dark:text-white font-semibold bg-zinc-100/60 dark:bg-zinc-800/60"
                : "border-zinc-200/90 dark:border-zinc-800/90 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-400 dark:hover:border-zinc-600 bg-transparent"
            }`}
          >
            <CircleUserRound size={13} className="shrink-0" strokeWidth={1.75} />
            <span className="truncate max-w-[10rem]">{client.buyer}</span>
          </Link>
        );
      })}
    </nav>
  );
}
