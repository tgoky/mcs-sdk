"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Settings2, ExternalLink } from "lucide-react";
import {
  SKILLS,
  SKILL_INFO,
  type SkillName,
  type ModuleStatus,
  MODULE_STATUS_LABELS,
  MODULE_STATUS_COLORS,
  phaseLabel,
} from "@/lib/copy";
import { SKILL_MANIFEST } from "@/lib/skill-manifest";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import { TriggerSkillButton } from "./trigger-skill-button";

const TOGGLEABLE_SKILLS: SkillName[] = [...SKILLS];
const SKILLS_WITH_PAGE: SkillName[] = ["pre-call-read", "pile-on", "win-back", "leak-map"];

export interface ModuleRunDTO {
  id: string;
  skillName: string;
  status: string;
  phase: string | null;
  errorMessage: string | null;
  startedAt: Date | string;
  completedAt: Date | string | null;
  stepCount: number;
}

function deriveModuleStatus(runs: ModuleRunDTO[], isEnabled: boolean): ModuleStatus | "disabled" {
  if (!isEnabled) return "disabled";
  if (!runs || runs.length === 0) return "not_run";
  const s = runs[0].status.toLowerCase();
  if (s === "success") return "live";
  if (s === "failed") return "failed";
  if (s === "running" || s === "in_progress") return "running";
  return "not_run";
}

function PhaseTag({ phase, status }: { phase: string | null; status: string }) {
  const label = phaseLabel(phase);
  const isRunning = status.toLowerCase() === "running";
  return (
    <span
      className={`text-[11px] font-mono tracking-tight ${
        isRunning ? "text-sky-600 dark:text-sky-400 italic font-semibold" : "text-zinc-500 dark:text-zinc-400"
      }`}
    >
      {label}
    </span>
  );
}

export function SkillsPanel({
  engagementId,
  initialStates,
  runsBySkill,
}: {
  engagementId: string;
  initialStates: Record<SkillName, boolean>;
  runsBySkill: Record<SkillName, ModuleRunDTO[]>;
}) {
  const router = useRouter();
  const [states, setStates] = useState<Record<SkillName, boolean>>(initialStates);
  const [updatingSkill, setUpdatingSkill] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function handleToggle(skill: SkillName) {
    const nextState = !states[skill];
    const previousState = states[skill];

    setStates((prev) => ({ ...prev, [skill]: nextState }));
    setUpdatingSkill(skill);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/engagements/${engagementId}/skills/${skill}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: nextState }),
        });

        if (!res.ok) {
          setStates((prev) => ({ ...prev, [skill]: previousState }));
        } else {
          router.refresh();
        }
      } catch {
        setStates((prev) => ({ ...prev, [skill]: previousState }));
      } finally {
        setUpdatingSkill(null);
      }
    });
  }

  function handleToggleClick(skill: SkillName) {
    if (!states[skill] && SKILL_MANIFEST[skill].runOnSetup) {
      router.push(`/dashboard/engagements/${engagementId}/bridges/${skill}`);
      return;
    }
    handleToggle(skill);
  }

  const activeCount = TOGGLEABLE_SKILLS.filter((s) => states[s]).length;

  return (
    <div className="w-full space-y-3 font-sans">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-4 pb-1.5 border-b border-zinc-200/80 dark:border-zinc-800/60">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-zinc-900 dark:text-zinc-100">
            Automation Modules
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed font-sans">
            Manage status, configuration, and manual executions for this client.
          </p>
        </div>
        <span className="shrink-0 text-xs font-mono font-medium text-zinc-500 dark:text-zinc-400">
          <span className="font-bold text-emerald-600 dark:text-emerald-400">{activeCount}</span>/{TOGGLEABLE_SKILLS.length} active
        </span>
      </div>

      {/* Merged Module Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {TOGGLEABLE_SKILLS.map((skill) => {
          const info = SKILL_INFO[skill];
          const isEnabled = states[skill] ?? true;
          const isBusy = updatingSkill === skill;
          const skillRuns = runsBySkill[skill] ?? [];
          const status = deriveModuleStatus(skillRuns, isEnabled);
          const latestRun = skillRuns[0] ?? null;

          return (
            <div
              key={skill}
              className={`rounded-2xl border p-4 flex flex-col justify-between min-h-[220px] transition-all shadow-2xs ${
                isEnabled
                  ? "border-zinc-200 dark:border-zinc-800/80 bg-white/90 dark:bg-zinc-900/60 backdrop-blur-xs"
                  : "border-zinc-200/60 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-950/40 opacity-75"
              }`}
            >
              {/* Top Section */}
              <div className="space-y-3">
                {/* Badge + Name + Toggle */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <SquishySkillBadge skill={skill} size={36} enabled={isEnabled} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`text-sm font-bold tracking-tight truncate ${
                            isEnabled ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-400 dark:text-zinc-500"
                          }`}
                        >
                          {info.name}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug line-clamp-2">
                        {info.description}
                      </p>
                    </div>
                  </div>

                  {/* On/Off Switch Button */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => !isBusy && handleToggleClick(skill)}
                      disabled={isBusy}
                      aria-label={`Toggle ${info.name}`}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-all duration-200 ease-in-out focus:outline-none shadow-inner ${
                        isEnabled
                          ? "bg-emerald-500 dark:bg-emerald-600 border border-emerald-600/30"
                          : "bg-zinc-300 dark:bg-zinc-800 border border-zinc-400/30 dark:border-zinc-700/50"
                      } ${isBusy ? "opacity-50" : ""}`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-md transition-transform duration-200 ease-in-out ${
                          isEnabled ? "translate-x-[18px]" : "translate-x-[2px]"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Status Indicator & Telemetry */}
                <div className="border-t border-zinc-100 dark:border-zinc-800/60 pt-2.5 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500 font-semibold">
                      Status
                    </span>
                    {status === "disabled" ? (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-zinc-200/60 dark:bg-zinc-800/60 text-zinc-500 border border-zinc-300/40 dark:border-zinc-700/40">
                        Turned Off
                      </span>
                    ) : (
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 ${MODULE_STATUS_COLORS[status]}`}
                      >
                        {MODULE_STATUS_LABELS[status]}
                      </span>
                    )}
                  </div>

                  {/* Latest Execution Details */}
                  {isEnabled && latestRun ? (
                    <div className="space-y-1 text-xs pt-1">
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <PhaseTag phase={latestRun.phase} status={latestRun.status} />
                        <Link
                          href={`/dashboard/runs/${latestRun.id}`}
                          className="text-[10px] font-mono font-bold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors flex items-center gap-0.5"
                        >
                          View run <ArrowRight className="w-2.5 h-2.5" />
                        </Link>
                      </div>

                      {latestRun.status.toLowerCase() === "failed" && latestRun.errorMessage && (
                        <p className="text-[11px] text-rose-600 dark:text-rose-400/90 leading-snug font-mono break-all line-clamp-2">
                          {latestRun.errorMessage}
                        </p>
                      )}
                    </div>
                  ) : isEnabled ? (
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 italic font-mono pt-1">
                      No executions recorded yet.
                    </p>
                  ) : (
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 italic font-mono pt-1">
                      Module is currently paused for this client.
                    </p>
                  )}
                </div>
              </div>

              {/* Bottom Action Footer */}
              <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/60 mt-3 space-y-2">
                <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                  {SKILL_MANIFEST[skill].hasHingesPanel ? (
                    <Link
                      href={`/dashboard/engagements/${engagementId}/bridges/${skill}`}
                      className="inline-flex items-center gap-1 font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
                    >
                      <Settings2 size={12} />
                      <span>Configure</span>
                    </Link>
                  ) : (
                    <span />
                  )}

                  {SKILLS_WITH_PAGE.includes(skill) && (
                    <Link
                      href={`/dashboard/engagements/${engagementId}/skills/${skill}`}
                      className="inline-flex items-center gap-1 font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors ml-auto"
                    >
                      <span>Pipeline</span>
                      <ExternalLink size={11} />
                    </Link>
                  )}
                </div>

                <TriggerSkillButton
                  engagementId={engagementId}
                  skillName={skill}
                  label={`Run ${info.name}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}