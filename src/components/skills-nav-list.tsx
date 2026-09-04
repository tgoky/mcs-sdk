"use client";

import { SKILL_IDS, SKILL_MANIFEST } from "@/lib/skill-manifest";
import { REP_SKILL_IDS, REP_SKILL_MANIFEST } from "@/lib/rep-skill-manifest";
import type { ProductId } from "@/lib/product-catalog";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import { RepSkillBadge } from "@/components/rep-skill-badge";
import { SidebarNavLinks, type NavLinkItem } from "@/app/dashboard/sidebar-nav-links";

/**
 * "Jump to a skill's module hub" list — every skill this workspace has,
 * linking to /dashboard/modules/[skill]. Single source of truth so the
 * dashboard-home sidebar, the modules pages' sidebar, and the Engagements
 * list sidebar can't drift into three independently-hardcoded copies (the
 * same class of bug skill-manifest.ts's own display-name comment calls
 * out). Highlights whichever skill's module hub is currently open.
 *
 * Renders through SidebarNavLinks (same component WorkSidebar's Home/
 * Reports/Queue/Executions already use) rather than its own hand-rolled
 * Link list — this used to have its own static bg-swap with no shared
 * sliding indicator, the one thing in the codebase not wired to the
 * motion-round highlight everything else in a NavLinkItem-shaped list
 * already gets for free.
 */
export function SkillsNavList({ productIds = ["showtime"] }: { productIds?: ProductId[] }) {
  const links: NavLinkItem[] = productIds.flatMap((productId) => {
    if (productId === "showtime") {
      return SKILL_IDS.map((skillId) => ({
        href: `/dashboard/modules/${skillId}`,
        label: SKILL_MANIFEST[skillId].name,
        icon: <SquishySkillBadge skill={skillId} size={18} />,
      }));
    }

    // No per-capability hub page exists for these yet (unlike Showtime's
    // /dashboard/modules/[skill]) — links to the real RM dashboard rather
    // than a fake per-skill destination or the dead ?skill= param the
    // dashboard page no longer reads. The #skillId suffix is only there
    // to keep each entry's href (SidebarNavLinks' React key) unique; it
    // isn't a real anchor on that page.
    return REP_SKILL_IDS.map((skillId) => ({
      href: `/dashboard/reputation-manager#${skillId}`,
      label: REP_SKILL_MANIFEST[skillId].name,
      icon: <RepSkillBadge skill={skillId} size={18} />,
    }));
  });

  return <SidebarNavLinks links={links} />;
}
