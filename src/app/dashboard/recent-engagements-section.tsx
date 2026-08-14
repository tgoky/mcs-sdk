"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { SKILL_IDS, SKILL_MANIFEST } from "@/lib/skill-manifest";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";

interface RecentEngagement {
  engagementId: string;
  buyer: string;
}

/**
 * Recent clients — hidden specifically on the exact Engagements list page
 * (/dashboard/engagements), since that page's own main panel already
 * shows the full client list; a second copy of it here was pure
 * duplication. Shown everywhere else under /dashboard/engagements/* (a
 * client's detail page, a skill page, a bridge/setup page), where the
 * sidebar is the only quick way to jump to a different client without
 * backing all the way out to the list.
 *
 * On the exact list page, this space is used for something that isn't
 * redundant instead: quick links into each skill's holistic client
 * roster (Library -> skill -> every client), so people aren't left
 * guessing where that view lives.
 */
export function RecentEngagementsSection({ recent }: { recent: RecentEngagement[] }) {
  const pathname = usePathname();

  if (pathname === "/dashboard/engagements") {
    return (
      <>
        <div className="my-3 border-t border-sidebar-border" />
        <div className="px-2.5 pb-2 text-[11px] font-semibold text-zinc-500 font-mono tracking-wider uppercase">
          Skills
        </div>
        <nav className="flex flex-col gap-0.5">
          {SKILL_IDS.map((skillId) => (
            <Link
              key={skillId}
              href={`/dashboard/modules/${skillId}`}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/40 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all truncate"
            >
              <SquishySkillBadge skill={skillId} size={18} />
              <span className="truncate">{SKILL_MANIFEST[skillId].name}</span>
            </Link>
          ))}
        </nav>
      </>
    );
  }

  return (
    <>
      <div className="my-3 border-t border-sidebar-border" />
      <div className="px-2.5 pb-2 text-[11px] font-semibold text-zinc-500 font-mono tracking-wider uppercase">
        Recent
      </div>
      {recent.length > 0 ? (
        <nav className="flex flex-col gap-0.5">
          {recent.map((client) => (
            <Link
              key={client.engagementId}
              href={`/dashboard/engagements/${client.engagementId}`}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/40 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all truncate"
            >
              <span className="w-4 h-4 shrink-0 rounded-[5px] bg-teal-500/90 flex items-center justify-center text-[8px] font-bold text-white">
                {client.buyer.slice(0, 1).toUpperCase()}
              </span>
              <span className="truncate">{client.buyer}</span>
            </Link>
          ))}
        </nav>
      ) : (
        <p className="px-2.5 py-1 text-xs text-zinc-400 dark:text-zinc-600">No engagements yet.</p>
      )}
    </>
  );
}
