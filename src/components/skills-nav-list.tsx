"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SKILL_IDS, SKILL_MANIFEST } from "@/lib/skill-manifest";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";

/**
 * "Jump to a skill's module hub" list — every skill this workspace has,
 * linking to /dashboard/modules/[skill]. Single source of truth so the
 * dashboard-home sidebar, the modules pages' sidebar, and the Engagements
 * list sidebar can't drift into three independently-hardcoded copies (the
 * same class of bug skill-manifest.ts's own display-name comment calls
 * out). Highlights whichever skill's module hub is currently open.
 */
export function SkillsNavList() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5">
      {SKILL_IDS.map((skillId) => {
        const href = `/dashboard/modules/${skillId}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={skillId}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-all truncate ${
              active
                ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white font-semibold shadow-xs border border-zinc-200/60 dark:border-transparent"
                : "text-zinc-600 dark:text-zinc-400 hover:bg-[#e7e7eb] dark:hover:bg-zinc-900/40 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            <SquishySkillBadge skill={skillId} size={18} />
            <span className="truncate">{SKILL_MANIFEST[skillId].name}</span>
          </Link>
        );
      })}
    </nav>
  );
}