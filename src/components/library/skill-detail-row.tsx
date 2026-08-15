import Link from "next/link";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import type { PackageSkillStat } from "@/lib/package-overview";
import type { SkillManifestEntry } from "@/lib/skill-manifest";

export function SkillDetailRow({
  skill,
  manifest,
}: {
  skill: PackageSkillStat;
  manifest: SkillManifestEntry;
}) {
  return (
    <Link
      href={`/dashboard/modules/${skill.skillId}`}
      className="group flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 hover:bg-zinc-900/40 transition-colors"
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <SquishySkillBadge skill={skill.skillId} size={36} />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors">{skill.name}</p>
            {manifest.hasHingesPanel && (
              <span className="text-[10px] font-mono text-zinc-600">configured per client</span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed max-w-lg">{manifest.description}</p>
        </div>
      </div>

      <div className="flex items-center gap-4 sm:gap-5 pl-[3rem] sm:pl-0 shrink-0">
        <div className="text-right">
          <p className="text-sm font-bold text-zinc-100 tabular-nums">{skill.activeClients}</p>
          <p className="text-[10px] font-mono uppercase tracking-wide text-zinc-600">active</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-zinc-100 tabular-nums">{skill.runsInWindow}</p>
          <p className="text-[10px] font-mono uppercase tracking-wide text-zinc-600">runs/7d</p>
        </div>
        <div className="text-right w-14">
          <p
            className={`text-sm font-bold tabular-nums ${
              skill.successRate === null
                ? "text-zinc-600"
                : skill.successRate >= 80
                  ? "text-emerald-400"
                  : "text-orange-400"
            }`}
          >
            {skill.successRate !== null ? `${skill.successRate}%` : "—"}
          </p>
          <p className="text-[10px] font-mono uppercase tracking-wide text-zinc-600">success</p>
        </div>

        {skill.needsAttention > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-md border border-rose-800/60 bg-rose-950/60 px-1.5 py-1 text-[10px] font-semibold text-rose-400 shrink-0"
            title={`${skill.needsAttention} client${skill.needsAttention === 1 ? "" : "s"} failing back-to-back`}
          >
            <AlertTriangle size={11} />
            {skill.needsAttention}
          </span>
        )}

        <ArrowUpRight size={15} className="text-zinc-700 group-hover:text-zinc-400 transition-colors shrink-0" />
      </div>
    </Link>
  );
}
