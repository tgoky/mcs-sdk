// Canonical top-level navigation. One workspace is one client running
// some subset of the unified worker registry — there is no more "which
// product context am I in," so this is one flat rail, identical for
// every client regardless of which workers they have enabled. This
// replaces the old per-product rail (a Showtime badge and a Reputation
// Manager badge, each contributing its own Engagements/Analytics/
// Meetings-or-Incidents icons depending on which one you'd last clicked)
// that survived every phase of the worker-registry restructure
// untouched — the badges and PRODUCT_RAIL_CHILDREN below were the single
// most visible leftover of the old "different menu per product" model.
import { BarChart3, BookOpen, LayoutGrid, Settings, Store, type LucideIcon } from "lucide-react";

export interface PrimaryNavSection {
  title: string;
  href: string;
  icon: LucideIcon;
}

/** The whole rail. Work is this client's home; Library is every worker
 * (enabled or not) for this client; Analytics is the unified,
 * registry-driven overview (Phase 8) with drill-in to any worker's own
 * page; Apps is the workspace's reusable credential vault (still the
 * same /dashboard/settings/apps route and API — this just gives it its
 * own rail entry instead of being buried three levels deep in Settings'
 * nested nav, where it was easy to never notice). No per-product
 * variants — a client running only Showtime workers and a client
 * running only Reputation Manager workers see the exact same rail. */
export const PRIMARY_NAV_SECTIONS: PrimaryNavSection[] = [
  { title: "Work", href: "/dashboard", icon: LayoutGrid },
  { title: "Library", href: "/dashboard/library", icon: BookOpen },
  { title: "Apps", href: "/dashboard/settings/apps", icon: Store },
  { title: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
];

export const SETTINGS_NAV = { label: "Settings", href: "/dashboard/settings", icon: Settings };
