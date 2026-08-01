import Link from "next/link";
import { Target, BarChart3, Users, Gauge } from "lucide-react";

/**
 * The "Strategy" section's secondary sidebar. This was the most
 * speculative part of Anthony's request ("we can even have a strategy...")
 * — there's no goals/resourcing data model behind this today, so unlike
 * every other section here, these four don't have real numbers waiting on
 * the other end yet. They route to real anchors on one real (deliberately
 * plain) page, /dashboard/strategy, rather than four pages faking content.
 * See that page's file comment for what each of these would need before
 * it's more than a shell.
 */
export function StrategySidebar() {
  return (
    <div className="flex flex-col gap-1">
      <div className="px-2.5 pb-2 text-[11px] font-semibold text-zinc-500 font-mono tracking-wider uppercase">
        Strategy
      </div>

      <nav className="flex flex-col gap-0.5">
        <Link
          href="/dashboard/strategy#goals"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/40 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all"
        >
          <Target className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
          <span>Goals</span>
        </Link>
        <Link
          href="/dashboard/strategy#reporting"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/40 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all"
        >
          <BarChart3 className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
          <span>Reporting</span>
        </Link>
        <Link
          href="/dashboard/strategy#resourcing"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/40 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all"
        >
          <Users className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
          <span>Resourcing</span>
        </Link>
        <Link
          href="/dashboard/strategy#stats"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/40 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all"
        >
          <Gauge className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
          <span>Stats</span>
        </Link>
      </nav>
    </div>
  );
}
