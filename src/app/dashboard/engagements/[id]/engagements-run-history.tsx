"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, XCircle, Loader2, AlertCircle } from "lucide-react";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import { RunRowActions } from "./run-row-actions";
import { SKILLS, skillName, runStatusLabel, phaseLabel, type SkillName } from "@/lib/copy";

function RunStatusIcon({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === "success" || s === "completed") return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
  if (s === "failed" || s === "error") return <XCircle className="w-4 h-4 text-rose-500 shrink-0" />;
  if (s === "running" || s === "in_progress") return <Loader2 className="w-4 h-4 text-zinc-400 dark:text-zinc-500 animate-spin shrink-0" />;
  return <AlertCircle className="w-4 h-4 text-zinc-400 dark:text-zinc-600 shrink-0" />;
}

export function EngagementRunHistory({
  engagementId,
  buyerName,
  runs,
}: {
  engagementId: string;
  buyerName: string;
  runs: any[];
}) {
  const [selectedSkill, setSelectedSkill] = useState<string>("all");

  const filteredRuns = selectedSkill === "all"
    ? runs
    : runs.filter((r) => r.skillName === selectedSkill);

  return (
    <div className="space-y-3">
      {/* Skill Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setSelectedSkill("all")}
          className={`px-2.5 py-1 text-xs font-mono rounded-md border transition-colors cursor-pointer ${
            selectedSkill === "all"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-transparent font-semibold"
              : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-200"
          }`}
        >
          All Skills ({runs.length})
        </button>

        {SKILLS.map((skill) => {
          const count = runs.filter((r) => r.skillName === skill).length;
          if (count === 0) return null;

          return (
            <button
              key={skill}
              type="button"
              onClick={() => setSelectedSkill(skill)}
              className={`px-2.5 py-1 text-xs font-mono rounded-md border transition-colors cursor-pointer ${
                selectedSkill === skill
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-transparent font-semibold"
                  : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              {skillName(skill)} ({count})
            </button>
          );
        })}
      </div>

      {/* Filtered Runs List */}
      <div className="w-full overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-transparent transition-colors">
        <ol className="divide-y divide-zinc-200 dark:divide-zinc-800/50">
          {filteredRuns.slice(0, 20).map((run) => (
            <li key={run.id} className="group relative">
              <Link
                href={`/dashboard/runs/${run.id}`}
                className="absolute inset-0 z-10"
                aria-label={`View run details for ${skillName(run.skillName)}`}
              />
              <div className="relative flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                <RunStatusIcon status={run.status} />
                <div className="min-w-0 flex-1 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-200">
                        {skillName(run.skillName)}
                      </span>
                      <span className="text-zinc-600 dark:text-zinc-400 text-xs font-normal font-mono">
                        {runStatusLabel(run.status)}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono mt-0.5 text-zinc-400 dark:text-zinc-500">
                      {phaseLabel(run.phase)}
                      {run.stepCount > 0 ? ` · ${run.stepCount} step${run.stepCount === 1 ? "" : "s"}` : ""}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2 text-[11px] font-mono text-zinc-400 dark:text-zinc-500 pt-0.5">
                    <SquishySkillBadge skill={run.skillName} size={22} enabled={true} />
                    <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    <RunRowActions
                      runId={run.id}
                      engagementId={engagementId}
                      skillName={run.skillName}
                      skillLabel={skillName(run.skillName)}
                      status={run.status}
                    />
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}