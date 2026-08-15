import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import type { PackageSkillStat } from "@/lib/package-overview";

function healthDotClass(skill: PackageSkillStat): string {
  if (skill.needsAttention > 0) return "bg-rose-500";
  if (skill.activeClients === 0) return "bg-zinc-600";
  if (skill.successRate !== null && skill.successRate < 80) return "bg-orange-400";
  return "bg-emerald-400";
}

function nodeStatLabel(skill: PackageSkillStat): string {
  if (skill.needsAttention > 0) {
    return `${skill.needsAttention} need${skill.needsAttention === 1 ? "s" : ""} attention`;
  }
  if (skill.activeClients === 0) return "Not run yet";
  return `${skill.activeClients} active`;
}

/**
 * Real order, not decoration: this is the actual sequence a client moves
 * through — onboarded (Show Rate Setup), enrolled in pre-call touchpoints
 * (Pre-Call Sequence), briefed before each call (Call Brief), recovered
 * if they go cold (Booking Recovery), and audited for funnel drop-off on
 * an ongoing basis (Funnel Audit) — which is what earns the step numbers
 * and connecting line here, unlike a generic 01/02/03 treatment. Each
 * node's health dot and live count come straight from this workspace's
 * own runs, not a placeholder. Scrolls horizontally rather than wrapping
 * on narrow screens, so the flow (and its connecting line) never breaks
 * mid-sequence.
 */
export function SkillSequence({ skills }: { skills: PackageSkillStat[] }) {
  return (
    <div className="overflow-x-auto pb-2 [scrollbar-width:thin]">
      <div className="flex items-start min-w-max px-1">
        {skills.map((skill, i) => (
          <div key={skill.skillId} className="flex items-start">
            <Link href={`/dashboard/modules/${skill.skillId}`} className="group flex flex-col items-center gap-2 w-[108px] shrink-0">
              <span className="text-[10px] font-mono text-zinc-600 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              <div className="relative">
                <div className="rounded-full ring-1 ring-zinc-800 group-hover:ring-zinc-600 transition-all p-1">
                  <SquishySkillBadge skill={skill.skillId} size={44} enabled />
                </div>
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-zinc-950 ${healthDotClass(skill)}`}
                  title={nodeStatLabel(skill)}
                />
              </div>
              <span className="text-xs font-semibold text-zinc-200 group-hover:text-amber-300 text-center leading-tight transition-colors">
                {skill.name}
              </span>
              <span className="text-[10px] font-mono text-zinc-500 text-center leading-tight">{nodeStatLabel(skill)}</span>
            </Link>

            {i < skills.length - 1 && (
              <div className="flex items-center pt-8 w-10 shrink-0 -mx-1">
                <div className="h-px w-full bg-zinc-800" />
                <ChevronRight size={14} className="text-zinc-700 -ml-2.5 shrink-0" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
