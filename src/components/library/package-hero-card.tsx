import Link from "next/link";
import { ArrowUpRight, Download, LayoutGrid } from "lucide-react";
import { SKILL_IDS, SKILL_MANIFEST } from "@/lib/skill-manifest";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import { StatChip } from "@/components/library/stat-chip";
import type { PackageOverview } from "@/lib/package-overview";

export function PackageHeroCard({ overview }: { overview: PackageOverview }) {
  return (
    <Link
      href="/dashboard/library/showtime"
      className="group relative flex flex-col justify-between rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 backdrop-blur-md p-6 transition-all duration-200 hover:border-zinc-300 dark:hover:border-zinc-700 shadow-sm hover:shadow-md"
    >
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="relative shrink-0 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-500 dark:bg-teal-400 shadow-[0_0_0_1px_rgba(45,212,191,0.25),0_8px_24px_-8px_rgba(45,212,191,0.5)] group-hover:scale-105 transition-transform">
              <LayoutGrid size={26} className="text-zinc-950 stroke-[2.3px]" />
            </div>
            <div className="min-w-0 pt-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                  Showtime
                </h2>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-900 dark:text-zinc-100">
                  <Download size={12} className="stroke-[2.5]" /> Installed
                </span>
              </div>
              <p className="text-[11px] font-mono text-zinc-500 mt-0.5">By Showtime Core</p>
            </div>
          </div>
          <ArrowUpRight
            size={18}
            className="shrink-0 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all"
          />
        </div>

        {/* Description */}
        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-md">
          Sales execution for your booked calls — client setup, follow-up sequences, call briefs, win-back, and funnel health, all in one place.
        </p>

        {/* Stat Chips */}
        <div className="flex items-center gap-6 pt-1">
          <StatChip label="Active clients" value={`${overview.activeClients}/${overview.totalClients}`} />
          <StatChip label={`Runs (${overview.windowDays}d)`} value={String(overview.runsInWindow)} />
          <StatChip
            label="Success rate"
            value={overview.successRate !== null ? `${overview.successRate}%` : "—"}
            tone={overview.successRate === null ? "neutral" : overview.successRate >= 80 ? "success" : "warning"}
          />
        </div>

        {/* Skill Avatar Stack */}
        <div className="flex items-center gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 shrink-0">
            Inside
          </span>
          <div className="flex items-center -space-x-1.5">
            {SKILL_IDS.map((id) => (
              <div key={id} className="ring-2 ring-white dark:ring-zinc-900 rounded-full">
                <SquishySkillBadge skill={id} size={22} />
              </div>
            ))}
          </div>
          <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-1 font-mono text-[11px]">
            {SKILL_IDS.map((id) => SKILL_MANIFEST[id].name).join(", ")}
          </span>
        </div>
      </div>
    </Link>
  );
}