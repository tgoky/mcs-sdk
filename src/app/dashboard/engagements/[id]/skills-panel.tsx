"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SKILLS, SKILL_INFO, type SkillName } from "@/lib/copy";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";

// Keep pin-down excluded from manual toggling
const TOGGLEABLE_SKILLS: SkillName[] = SKILLS.filter((s) => s !== "pin-down");

export function SkillsPanel({
  engagementId,
  initialStates,
}: {
  engagementId: string;
  initialStates: Record<SkillName, boolean>;
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

  const activeCount = TOGGLEABLE_SKILLS.filter((s) => states[s]).length;

  return (
    <div className="w-full space-y-2 py-1 font-sans">
      {/* Header Section */}
      <div className="flex items-center justify-between gap-4 pb-2 border-b border-zinc-200/80 dark:border-zinc-800/60">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-zinc-900 dark:text-zinc-100">
            Automation Skills
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed font-sans">
            Turn off anything this client doesn&apos;t need. Takes effect on the next run.
          </p>
        </div>
        <span className="shrink-0 text-xs font-mono font-medium text-zinc-500 dark:text-zinc-400">
          <span className="font-bold text-emerald-600 dark:text-emerald-400">{activeCount}</span>/{TOGGLEABLE_SKILLS.length} active
        </span>
      </div>

      {/* Vertical Single-Column List (divide-y) */}
      <div className="divide-y divide-zinc-200/60 dark:divide-zinc-800/40">
        {TOGGLEABLE_SKILLS.map((skill) => {
          const info = SKILL_INFO[skill];
          const isEnabled = states[skill] ?? true;
          const isBusy = updatingSkill === skill;

          return (
            <div
              key={skill}
              onClick={() => !isBusy && handleToggle(skill)}
              className="group flex items-center justify-between gap-4 py-3.5 px-2 hover:bg-zinc-500/[0.04] dark:hover:bg-zinc-500/[0.06] rounded-xl transition-colors cursor-pointer select-none"
            >
              {/* Left Side: Squishy Badge + Title + Full Description */}
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <SquishySkillBadge skill={skill} size={38} enabled={isEnabled} />

                <div className="min-w-0 flex-1">
                  <span
                    className={`block text-sm font-bold tracking-tight transition-colors ${
                      isEnabled
                        ? "text-zinc-900 dark:text-zinc-100"
                        : "text-zinc-400 dark:text-zinc-500"
                    }`}
                  >
                    {info.name}
                  </span>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug font-sans">
                    {info.description}
                  </p>
                </div>
              </div>

              {/* Right Side: Filled Toggle Switch Button */}
              <div className="shrink-0 flex items-center gap-3">
                <span
                  className={`text-[11px] font-mono font-bold uppercase tracking-wider ${
                    isBusy
                      ? "text-zinc-400"
                      : isEnabled
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-zinc-400 dark:text-zinc-600"
                  }`}
                >
                  {isBusy ? "…" : isEnabled ? "On" : "Off"}
                </span>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isBusy) handleToggle(skill);
                  }}
                  disabled={isBusy}
                  aria-label={`Toggle ${info.name}`}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-all duration-200 ease-in-out focus:outline-none shadow-inner ${
                    isEnabled
                      ? "bg-emerald-500 dark:bg-emerald-600 border border-emerald-600/30"
                      : "bg-zinc-300 dark:bg-zinc-800 border border-zinc-400/30 dark:border-zinc-700/50"
                  } ${isBusy ? "opacity-50" : ""}`}
                >
                  <span
                    className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-md transition-transform duration-200 ease-in-out ${
                      isEnabled ? "translate-x-[22px]" : "translate-x-[3px]"
                    }`}
                  />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}