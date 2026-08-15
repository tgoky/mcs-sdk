import Link from "next/link";
import { ArrowUpRight, LayoutGrid } from "lucide-react";
import { SKILL_IDS } from "@/lib/skill-manifest";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import { StatChip } from "@/components/library/stat-chip";
import type { PackageOverview } from "@/lib/package-overview";

export function PackageHeroCard({ overview }: { overview: PackageOverview }) {
  return (
    <Link
      href="/dashboard/library/showtime"
      className="group block rounded-2xl border border-zinc-800/80 bg-zinc-900/40 hover:border-zinc-700 transition-colors overflow-hidden"
    >
      <div className="p-5 sm:p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="relative shrink-0 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500 dark:bg-teal-400 shadow-[0_0_0_1px_rgba(45,212,191,0.25),0_8px_24px_-8px_rgba(45,212,191,0.5)]">
              <LayoutGrid size={22} className="text-zinc-950 stroke-[2.3px]" />
            </div>
            <div className="min-w-0 pt-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-white">Showtime</h2>
                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-800/60 bg-emerald-950/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                  Installed
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed max-w-md">
                Sales execution for your booked calls — client setup, follow-up sequences, call
                briefs, win-back, and funnel health, all in one place.
              </p>
            </div>
          </div>
          <ArrowUpRight
            size={16}
            className="shrink-0 text-zinc-600 group-hover:text-zinc-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all"
          />
        </div>

        <div className="flex items-center gap-6 pl-[1px]">
          <StatChip label="Active clients" value={`${overview.activeClients}/${overview.totalClients}`} />
          <StatChip label={`Runs (${overview.windowDays}d)`} value={String(overview.runsInWindow)} />
          <StatChip
            label="Success rate"
            value={overview.successRate !== null ? `${overview.successRate}%` : "—"}
            tone={overview.successRate === null ? "neutral" : overview.successRate >= 80 ? "success" : "warning"}
          />
        </div>

        <div className="flex items-center gap-2 pt-1 border-t border-zinc-800/60 -mx-1 px-1 pt-3">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 shrink-0">Inside</span>
          <div className="flex items-center -space-x-1.5">
            {SKILL_IDS.map((id) => (
              <div key={id} className="ring-2 ring-zinc-900 rounded-full">
                <SquishySkillBadge skill={id} size={24} />
              </div>
            ))}
          </div>
          <span className="text-xs text-zinc-500 ml-1">5 skills</span>
        </div>
      </div>
    </Link>
  );
}
