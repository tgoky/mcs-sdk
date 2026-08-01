import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { SKILLS, SKILL_INFO } from "@/lib/copy";

/**
 * The "Analytics" section's secondary sidebar. Kept intentionally small:
 * /dashboard/analytics today is a single overview page (stat cards +
 * booking-sync breakdown), and there's no separate "Leak Map report" /
 * "Win-Back report" page yet — only the per-skill cross-client views at
 * /dashboard/modules/[skill]. Linking those five here (instead of inventing
 * routes like /dashboard/analytics/leak-map that don't exist) keeps every
 * link in this sidebar real. If/when analytics grows dedicated per-skill
 * report pages, swap these hrefs over to them.
 */
export function AnalyticsSidebar() {
  return (
    <div className="flex flex-col gap-1">
      <Link
        href="/dashboard/analytics"
        className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-semibold bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900 transition-all"
      >
        <BarChart3 className="w-4 h-4 text-gold dark:text-gold-hover" />
        <span>Overview</span>
      </Link>

      <div className="my-3 border-t border-sidebar-border" />

      <div className="px-2.5 pb-2 text-[11px] font-semibold text-zinc-500 font-mono tracking-wider uppercase">
        Reports by skill
      </div>

      <nav className="flex flex-col gap-0.5">
        {SKILLS.map((skill) => (
          <Link
            key={skill}
            href={`/dashboard/modules/${skill}`}
            title={SKILL_INFO[skill].description}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/40 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700 shrink-0" />
            <span>{SKILL_INFO[skill].name}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
