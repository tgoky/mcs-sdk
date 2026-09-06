"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SKILL_IDS, SKILL_MANIFEST } from "@/lib/skill-manifest";
import { REP_SKILL_IDS, REP_SKILL_MANIFEST, type RepSkillId } from "@/lib/rep-skill-manifest";
import type { ProductId } from "@/lib/product-catalog";
import type { WorkerId } from "@/lib/worker-registry";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import { RepSkillBadge } from "@/components/rep-skill-badge";
import { SidebarNavLinks, type NavLinkItem } from "@/app/dashboard/sidebar-nav-links";

interface SkillEntry {
  skillId: string;
  href: string;
  label: string;
  isRep: boolean;
}

function buildEntries(productIds: ProductId[]): SkillEntry[] {
  return productIds.flatMap((productId) => {
    if (productId === "showtime") {
      return SKILL_IDS.map(
        (skillId): SkillEntry => ({
          skillId,
          href: `/dashboard/modules/${skillId}`,
          label: SKILL_MANIFEST[skillId].name,
          isRep: false,
        })
      );
    }

    // Same module hub route Showtime's skills use — /dashboard/modules/[skill]
    // now checks both catalogs (isSkillId then isRepSkillId), so this no
    // longer needs its own placeholder destination.
    return REP_SKILL_IDS.map(
      (skillId): SkillEntry => ({
        skillId,
        href: `/dashboard/modules/${skillId}`,
        label: REP_SKILL_MANIFEST[skillId].name,
        isRep: true,
      })
    );
  });
}

/**
 * "Jump to a skill's module hub" grid — same entries as the list layout
 * below, rendered as icon-over-label tiles instead of rows. Used only for
 * the combined Work sidebar (both catalogs at once, 11 skills today and
 * growing) where a single vertical column would just get taller forever;
 * a product's own sidebar has far fewer of its own skills and stays a
 * list. Bigger badge than the list's 18px since a tile has room for one
 * — an icon alone at any size reads as "some skill," so the label stays
 * directly underneath every tile rather than becoming a hover-only detail.
 */
function SkillsGrid({ entries }: { entries: SkillEntry[] }) {
  const pathname = usePathname();

  if (entries.length === 0) {
    return (
      <Link
        href="/dashboard/library"
        className="block rounded-[10px] border border-dashed border-zinc-300 dark:border-zinc-700 px-3 py-3 text-center text-[11px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
      >
        No workers enabled yet — visit the Library to turn one on.
      </Link>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-1.5">
      {entries.map((entry) => {
        const active = pathname === entry.href || pathname.startsWith(`${entry.href}/`);
        return (
          <Link
            key={entry.href}
            href={entry.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-col items-center gap-1 rounded-[8px] px-1 py-1.5 text-center transition-colors ${
              active
                ? "bg-white dark:bg-zinc-700 shadow-xs border border-zinc-200/60 dark:border-transparent"
                : "border border-transparent hover:bg-[#f0edf6] dark:hover:bg-zinc-800/60"
            }`}
          >
            {entry.isRep ? (
              <RepSkillBadge skill={entry.skillId as RepSkillId} size={22} />
            ) : (
              <SquishySkillBadge skill={entry.skillId} size={22} />
            )}
            <span
              className={`text-[9.5px] leading-tight line-clamp-2 font-medium ${
                active ? "text-zinc-900 dark:text-white" : "text-zinc-600 dark:text-zinc-300"
              }`}
            >
              {entry.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/**
 * "Jump to a skill's module hub" — every skill this workspace has, linking
 * to /dashboard/modules/[skill]. Single source of truth so the dashboard-
 * home sidebar, the modules pages' sidebar, and the Engagements list
 * sidebar can't drift into three independently-hardcoded copies (the same
 * class of bug skill-manifest.ts's own display-name comment calls out).
 *
 * `layout="grid"` (WorkSidebar's combined-catalog call only) renders
 * SkillsGrid instead — a product's own sidebar (layout="list", the
 * default) keeps the original SidebarNavLinks rendering, since it has far
 * fewer of its own skills and the vertical list already reads fine there.
 */
export function SkillsNavList({
  productIds = ["showtime"],
  layout = "list",
  enabledWorkerIds,
}: {
  productIds?: ProductId[];
  layout?: "list" | "grid";
  /**
   * When provided, restricts the rendered entries to this set — the grid
   * layout's actual job is "jump into what's already running," not
   * "browse the full catalog" (that's the Library). Omitted entirely for
   * a product's own list-layout sidebar, which still shows every skill in
   * that product's catalog on purpose — a product's own nav is meant to
   * be a full skill directory, not a quick-access shortlist.
   */
  enabledWorkerIds?: WorkerId[];
}) {
  const allEntries = buildEntries(productIds);
  const entries = enabledWorkerIds
    ? allEntries.filter((entry) => (enabledWorkerIds as string[]).includes(entry.skillId))
    : allEntries;

  if (layout === "grid") {
    return <SkillsGrid entries={entries} />;
  }

  const links: NavLinkItem[] = entries.map((entry) => ({
    href: entry.href,
    label: entry.label,
    icon: entry.isRep ? <RepSkillBadge skill={entry.skillId as RepSkillId} size={18} /> : <SquishySkillBadge skill={entry.skillId} size={18} />,
  }));

  return <SidebarNavLinks links={links} />;
}
