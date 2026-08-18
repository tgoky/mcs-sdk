"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SKILL_IDS, SKILL_MANIFEST } from "@/lib/skill-manifest";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";

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
                : "text-zinc-700 dark:text-zinc-400 hover:bg-[#e5e4e6] dark:hover:bg-zinc-900/40 hover:text-zinc-900 dark:hover:text-zinc-100"
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