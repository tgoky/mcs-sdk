import Link from "next/link";
import { ArrowUpRight, Download } from "lucide-react";
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
          <div className="flex items-start gap-4 min-w-0">
            <img
              src="/images/showtime.png"
              alt="Showtime"
              className="w-20 h-20 shrink-0 object-contain group-hover:scale-105 transition-transform"
            />
            <div className="min-w-0 pt-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-zinc-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                  Showtime
                </h2>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-900 dark:text-zinc-100">
                  <Download size={12} className="stroke-[2.5]" /> Installed
                </span>
              </div>
              <p className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400 font-medium mt-0.5">
                By Showtime Core
              </p>
            </div>
          </div>
          <ArrowUpRight
            size={18}
            className="shrink-0 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all"
          />
        </div>

        {/* Description */}
        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 leading-relaxed max-w-md">
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
        <div className="flex items-center gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800/80">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 shrink-0">
            Inside
          </span>
          <div className="flex items-center -space-x-1.5">
            {SKILL_IDS.map((id) => (
              <div key={id} className="ring-2 ring-white dark:ring-zinc-900 rounded-full">
                <SquishySkillBadge skill={id} size={22} />
              </div>
            ))}
          </div>
          <span className="text-xs text-zinc-700 dark:text-zinc-300 ml-1 font-mono text-[11px] font-medium">
            {SKILL_IDS.map((id) => SKILL_MANIFEST[id].name).join(", ")}
          </span>
        </div>
      </div>
    </Link>
  );
}