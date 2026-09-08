// src/app/dashboard/engagements/[id]/resolve-back-href.ts
//
// Every bridges/[worker]/page.tsx used to hardcode "back to the engagement
// page" — fine when Configure was only ever reached from that page, wrong
// once the dashboard sidebar's Installed Skills list (skills-nav-list.tsx)
// and the Library's "Set up" card (worker-card.tsx) started linking here
// too: neither of those started on the engagement page, so landing back on
// it after Cancel/Save was a confusing detour, not a return. Callers now
// pass `from` with wherever they actually were; this validates it's an
// internal dashboard path (never an open redirect to an arbitrary URL) and
// falls back to the engagement page for the one caller that doesn't set it
// (WorkersPanel's own "enable + configure" flow, which starts there for real).

import type { ReadonlyURLSearchParams } from "next/navigation";

export function resolveBackHref(searchParams: ReadonlyURLSearchParams, engagementId: string): string {
  const from = searchParams.get("from");
  if (from && from.startsWith("/dashboard")) return from;
  return `/dashboard/engagements/${engagementId}`;
}
