// =============================================================================
// CANONICAL PRIMARY NAVIGATION — single source of truth
//
// Before this file, the desktop primary rail (components/primary-rail.tsx)
// and the mobile hamburger menu (components/mobile-nav-pill.tsx) each
// hardcoded their own, independently-authored list of top-level sections.
// They'd drifted hard:
//   - Mobile had "Overview" for what desktop calls "Work", "Clients" for
//     what desktop calls "Engagements" — same destination, different name,
//     so the tabs didn't read as the same app.
//   - Mobile had a standalone "Modules" section and a standalone
//     "Credentials" section that don't exist anywhere in the desktop
//     primary rail at all — desktop reaches skill modules from inside the
//     "Work" section's sidebar (SkillsNavList) and reaches settings/
//     connections from the avatar popover, not as their own top-level tabs.
//   - Mobile's "Analytics" sub-items pointed at /dashboard/analytics/funnel,
//     /calls, /recovery, /cohorts, /infrastructure — none of which exist as
//     routes (only /dashboard/analytics itself does). Those were dead links.
//   - Mobile had no entry at all for /dashboard/inbox (Notifications),
//     which the desktop "Work" sidebar surfaces.
//
// This file is now what both consume, mirroring the real desktop structure:
// primary-rail.tsx's 5 sections, each with the actual secondary-sidebar
// links pulled from work-sidebar.tsx / engagements-sidebar.tsx /
// analytics-sidebar.tsx / meetings-sidebar.tsx — not a second, separately
// maintained guess at what those pages contain.
// =============================================================================

import {
  LayoutGrid,
  Building2,
  BarChart3,
  BookOpen,
  CalendarClock,
  Home,
  Inbox,
  ListTodo,
  Activity,
  UserPlus,
  History,
  FileText,
  Link2,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { SKILL_IDS, SKILL_MANIFEST } from "@/lib/skill-manifest";

export interface PrimaryNavChild {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface PrimaryNavSection {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Real secondary-sidebar links for this section, in the same order the desktop sidebar shows them. Omitted for sections that are a single page with no sub-nav (e.g. Library). */
  children?: PrimaryNavChild[];
}

// Mirrors work-sidebar.tsx's two link groups plus its "Installed Skills"
// list (skills-nav-list.tsx) — same SKILL_IDS/SKILL_MANIFEST data, so a
// skill rename or a new skill shows up here automatically instead of
// needing a second edit.
const WORK_CHILDREN: PrimaryNavChild[] = [
  { label: "Home", href: "/dashboard", icon: Home },
  { label: "Notifications", href: "/dashboard/inbox", icon: Inbox },
  { label: "Queue", href: "/dashboard/queue", icon: ListTodo },
  { label: "Executions", href: "/dashboard/runs", icon: Activity },
  ...SKILL_IDS.map((id) => ({
    label: SKILL_MANIFEST[id].name,
    href: `/dashboard/modules/${id}`,
    icon: Activity,
  })),
];

// Mirrors engagements-sidebar.tsx.
const ENGAGEMENTS_CHILDREN: PrimaryNavChild[] = [
  { label: "All Clients", href: "/dashboard/engagements", icon: Building2 },
  { label: "Add New Client", href: "/dashboard/engagements/new", icon: UserPlus },
];

// Mirrors analytics-sidebar.tsx: the Overview page plus "Reports by
// skill" — deliberately NOT /dashboard/analytics/funnel|calls|recovery|
// cohorts|infrastructure, which don't exist as routes.
const ANALYTICS_CHILDREN: PrimaryNavChild[] = [
  { label: "Overview", href: "/dashboard/analytics", icon: BarChart3 },
  ...SKILL_IDS.map((id) => ({
    label: SKILL_MANIFEST[id].name,
    href: `/dashboard/modules/${id}`,
    icon: BarChart3,
  })),
];

// Mirrors meetings-sidebar.tsx.
const MEETINGS_CHILDREN: PrimaryNavChild[] = [
  { label: "Upcoming", href: "/dashboard/meetings", icon: CalendarClock },
  { label: "Past calls", href: "/dashboard/meetings?range=past", icon: History },
  { label: "Pre-Call Reads", href: "/dashboard/modules/pre-call-read", icon: FileText },
  { label: "Calendar connections", href: "/dashboard/settings", icon: Link2 },
];

export const PRIMARY_NAV_SECTIONS: PrimaryNavSection[] = [
  { title: "Work", href: "/dashboard", icon: LayoutGrid, children: WORK_CHILDREN },
  { title: "Engagements", href: "/dashboard/engagements", icon: Building2, children: ENGAGEMENTS_CHILDREN },
  { title: "Analytics", href: "/dashboard/analytics", icon: BarChart3, children: ANALYTICS_CHILDREN },
  { title: "Library", href: "/dashboard/library", icon: BookOpen },
  { title: "Meetings", href: "/dashboard/meetings", icon: CalendarClock, children: MEETINGS_CHILDREN },
];

// Reachable today only via the primary rail's avatar popover ("Admin
// console" / "Settings" / "Profile" all point here) — surfaced as its own
// row on mobile since there's no popover affordance to bury it in there.
export const SETTINGS_NAV: PrimaryNavChild = { label: "Settings", href: "/dashboard/settings", icon: Settings };
