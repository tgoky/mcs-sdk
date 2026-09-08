"use client";

// src/components/library/skill-sequence.tsx
//
// Restored from the pre-two-tier Library — "how a client moves through
// it," a numbered, connected step-flow instead of a plain grid. Adapted
// to today's registry (WorkerDefinition/WorkerOverviewStat instead of
// the old package-overview.ts's PackageSkillStat) and to a route that
// still exists: /dashboard/modules/[skill] was retired, so each node
// now links to that skill's own analytics page instead.
//
// The order is skillIdsForProduct's own order (see product-catalog.ts),
// which for Showtime is a genuine pipeline (onboard → pre-call touch →
// call brief → recovery → audit) and for Reputation Manager is Setup
// first, then its watch/response skills — real registration order, not
// a fabricated sequence.

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AnySkillBadge } from "@/components/any-skill-badge";
import type { WorkerDefinition } from "@/lib/worker-registry";
import type { WorkerOverviewStat } from "@/lib/worker-analytics";

function healthDotClass(stat: WorkerOverviewStat | undefined): string {
  if (!stat) return "bg-zinc-400 dark:bg-zinc-600";
  if (stat.needsAttention > 0) return "bg-rose-500";
  if (stat.runsInWindow === 0) return "bg-zinc-400 dark:bg-zinc-600";
  if (stat.successRate !== null && stat.successRate < 80) return "bg-orange-400";
  return "bg-emerald-400";
}

function nodeStatLabel(stat: WorkerOverviewStat | undefined): string {
  if (!stat || stat.runsInWindow === 0) return "Not run yet";
  if (stat.needsAttention > 0) return `${stat.needsAttention} need${stat.needsAttention === 1 ? "s" : ""} attention`;
  return `${stat.runsInWindow} runs/7d`;
}

export function SkillSequence({
  workers,
  statsById,
}: {
  workers: WorkerDefinition[];
  statsById: Map<string, WorkerOverviewStat>;
}) {
  return (
    <div className="overflow-x-auto pb-2 [scrollbar-width:thin]">
      <div className="flex items-start min-w-max px-1">
        {workers.map((worker, i) => {
          const stat = statsById.get(worker.id);
          return (
            <div key={worker.id} className="flex items-start">
              <Link href={`/dashboard/analytics/${worker.id}`} className="group flex flex-col items-center gap-2 w-[108px] shrink-0">
                <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-600 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <div className="relative">
                  <div className="rounded-full ring-1 ring-zinc-300 dark:ring-zinc-800 group-hover:ring-zinc-400 dark:group-hover:ring-zinc-600 transition-all p-1">
                    <AnySkillBadge skill={worker.id} size={44} />
                  </div>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-zinc-950 ${healthDotClass(stat)}`}
                    title={nodeStatLabel(stat)}
                  />
                </div>
                <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 group-hover:text-amber-600 dark:group-hover:text-amber-400 text-center leading-tight transition-colors">
                  {worker.name}
                </span>
                <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-500 text-center leading-tight">{nodeStatLabel(stat)}</span>
              </Link>

              {i < workers.length - 1 && (
                <div className="flex items-center pt-8 w-10 shrink-0 -mx-1">
                  <div className="h-px w-full bg-zinc-200 dark:bg-zinc-800" />
                  <ChevronRight size={14} className="text-zinc-300 dark:text-zinc-700 -ml-2.5 shrink-0" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
