"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Rocket, Layers, ClipboardList, RotateCcw, Map as MapIcon, type LucideIcon } from "lucide-react";
import { SKILL_IDS, SKILL_MANIFEST, type SkillId } from "@/lib/skill-manifest";

const TOGGLEABLE_SKILLS: SkillId[] = SKILL_IDS.filter((id) => id !== "pin-down");

const SKILL_ICONS: Record<SkillId, LucideIcon> = {
  "pin-down": Rocket,
  "pile-on": Layers,
  "pre-call-read": ClipboardList,
  "win-back": RotateCcw,
  "leak-map": MapIcon,
};

function Switch({ enabled, busy }: { enabled: boolean; busy: boolean }) {
  return (
    <span
      role="presentation"
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out ${
        enabled
          ? "bg-emerald-500 dark:bg-emerald-600"
          : "bg-zinc-300 dark:bg-zinc-800"
      } ${busy ? "opacity-50" : ""}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition-transform duration-200 ease-in-out ${
          enabled ? "translate-x-[18px]" : "translate-x-[3px]"
        }`}
      />
    </span>
  );
}

export function SkillsPanel({
  engagementId,
  initialStates,
}: {
  engagementId: string;
  initialStates: Record<SkillId, boolean>;
}) {
  const router = useRouter();
  const [states, setStates] = useState(initialStates);
  const [pending, setPending] = useState<SkillId | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(skillId: SkillId) {
    const next = !states[skillId];
    const previous = states[skillId];

    setStates((s) => ({ ...s, [skillId]: next }));
    setPending(skillId);
    setError(null);

    try {
      const res = await fetch(`/api/engagements/${engagementId}/skills/${skillId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStates((s) => ({ ...s, [skillId]: previous }));
        setError(data.error ?? `Failed to update ${SKILL_MANIFEST[skillId].name}.`);
      } else {
        router.refresh();
      }
    } catch (e: unknown) {
      setStates((s) => ({ ...s, [skillId]: previous }));
      setError(e instanceof Error ? e.message : `Failed to update ${SKILL_MANIFEST[skillId].name}.`);
    } finally {
      setPending(null);
    }
  }

  const onCount = TOGGLEABLE_SKILLS.filter((id) => states[id]).length;

  return (
    <div className="w-full space-y-3 py-1">
      {/* Header Section */}
      <div className="flex items-center justify-between gap-4 pb-2 border-b border-zinc-200/80 dark:border-zinc-800/60">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-zinc-900 dark:text-zinc-100">
            Automation Skills
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed font-sans">
            Turn off anything this client doesn&apos;t need. Takes effect on the next run.
          </p>
        </div>
        <span className="shrink-0 text-xs font-mono font-medium text-zinc-500 dark:text-zinc-400">
          <span className="font-bold text-emerald-600 dark:text-emerald-400">{onCount}</span>/{TOGGLEABLE_SKILLS.length} active
        </span>
      </div>

      {/* Flat Clean List */}
      <div className="divide-y divide-zinc-200/60 dark:divide-zinc-800/40">
        {TOGGLEABLE_SKILLS.map((skillId) => {
          const skill = SKILL_MANIFEST[skillId];
          const enabled = states[skillId];
          const busy = pending === skillId;
          const Icon = SKILL_ICONS[skillId];

          return (
            <div
              key={skillId}
              onClick={() => !busy && toggle(skillId)}
              className="group flex items-center justify-between gap-4 py-3 px-1.5 hover:bg-zinc-500/[0.03] rounded-lg transition-colors cursor-pointer select-none"
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <span
                  className={`shrink-0 grid place-items-center h-8 w-8 rounded-md transition-colors ${
                    enabled
                      ? "text-emerald-500 dark:text-emerald-400 bg-emerald-500/10"
                      : "text-zinc-400 dark:text-zinc-600 bg-zinc-100 dark:bg-zinc-800/40"
                  }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </span>

                <div className="min-w-0 flex-1">
                  <span
                    className={`block text-sm font-semibold tracking-tight transition-colors ${
                      enabled
                        ? "text-zinc-900 dark:text-zinc-100"
                        : "text-zinc-400 dark:text-zinc-500"
                    }`}
                  >
                    {skill.name}
                  </span>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug truncate font-sans">
                    {skill.description}
                  </p>
                </div>
              </div>

              <div className="shrink-0 flex items-center gap-3">
                <span
                  className={`text-[11px] font-mono font-semibold uppercase tracking-wider ${
                    busy
                      ? "text-zinc-400"
                      : enabled
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-zinc-400 dark:text-zinc-600"
                  }`}
                >
                  {busy ? "…" : enabled ? "On" : "Off"}
                </span>
                <Switch enabled={enabled} busy={busy} />
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="text-xs font-mono text-rose-600 dark:text-rose-400 pt-1">⚠ {error}</p>}
    </div>
  );
}