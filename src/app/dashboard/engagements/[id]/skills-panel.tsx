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
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out ${
        enabled
          ? "bg-emerald-500 dark:bg-emerald-600"
          : "bg-rose-500/20 dark:bg-rose-950/70 border border-rose-500/30"
      } ${busy ? "opacity-50" : ""}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-200 ease-in-out ${
          enabled ? "translate-x-[22px]" : "translate-x-[4px]"
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
    <div
      className="rounded-xl border p-5 space-y-4 shadow-xs"
      style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
    >
      {/* Header Section */}
      <div className="flex items-center justify-between gap-4 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider font-mono" style={{ color: "var(--text-primary)" }}>
            Automation Skills
          </h3>
          <p className="text-xs mt-1 leading-relaxed font-sans" style={{ color: "var(--text-muted)" }}>
            Turn off anything this client doesn&apos;t need. Takes effect on the next run — an in-progress run finishes as started.
          </p>
        </div>
        <span className="shrink-0 text-xs font-mono font-bold px-3 py-1 rounded-full bg-emerald-500/10 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          {onCount}/{TOGGLEABLE_SKILLS.length} Active
        </span>
      </div>

      {/* Skill Cards Grid */}
      <div className="space-y-2.5">
        {TOGGLEABLE_SKILLS.map((skillId) => {
          const skill = SKILL_MANIFEST[skillId];
          const enabled = states[skillId];
          const busy = pending === skillId;
          const Icon = SKILL_ICONS[skillId];

          return (
            <button
              key={skillId}
              onClick={() => toggle(skillId)}
              disabled={busy}
              role="switch"
              aria-checked={enabled}
              className={`w-full flex items-center gap-4 p-3.5 rounded-xl border transition-all duration-200 cursor-pointer disabled:cursor-not-allowed text-left ${
                enabled
                  ? "bg-emerald-500/[0.02] dark:bg-emerald-500/[0.04] border-emerald-500/25 hover:border-emerald-500/40 hover:bg-emerald-500/[0.05]"
                  : "bg-zinc-500/[0.02] dark:bg-zinc-500/[0.03] border-zinc-200 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700"
              }`}
            >
              {/* Icon Box */}
              <span
                className={`shrink-0 grid place-items-center h-10 w-10 rounded-lg border transition-colors ${
                  enabled
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                    : "bg-rose-500/10 border-rose-500/20 text-rose-500/80 dark:text-rose-400/80"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={2} />
              </span>

              {/* Title & Description */}
              <span className="min-w-0 flex-1">
                <span
                  className="block text-sm font-semibold tracking-tight font-mono"
                  style={{ color: enabled ? "var(--text-primary)" : "var(--text-secondary)" }}
                >
                  {skill.name}
                </span>
                <span className="block text-xs mt-0.5 leading-relaxed font-sans" style={{ color: "var(--text-muted)" }}>
                  {skill.description}
                </span>
              </span>

              {/* Status Text & Switch */}
              <span className="shrink-0 flex items-center gap-3">
                <span
                  className={`text-xs font-mono font-bold uppercase tracking-wider w-7 text-right ${
                    busy
                      ? "text-zinc-400"
                      : enabled
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-500 dark:text-rose-400"
                  }`}
                >
                  {busy ? "…" : enabled ? "On" : "Off"}
                </span>
                <Switch enabled={enabled} busy={busy} />
              </span>
            </button>
          );
        })}
      </div>

      {error && <p className="text-xs font-mono font-semibold text-rose-600 dark:text-rose-400 pt-1">⚠ {error}</p>}
    </div>
  );
}