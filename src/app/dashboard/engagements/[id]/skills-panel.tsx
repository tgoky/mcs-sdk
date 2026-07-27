"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { SKILL_IDS, SKILL_MANIFEST, type SkillId } from "@/lib/skill-manifest";

// pin-down is a one-time setup-time skill, not an ongoing automation a
// client turns on or off after the fact — see the route's doc comment at
// src/app/api/engagements/[id]/skills/[skillId]/route.ts. Excluded here
// rather than just left disabled, since a toggle with no real effect on
// an already-onboarded engagement is worse than no toggle at all.
const TOGGLEABLE_SKILLS: SkillId[] = SKILL_IDS.filter((id) => id !== "pin-down");

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

    // Optimistic update — this is a settings toggle, not a destructive
    // action, so it should feel instant; rolled back below on failure.
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

  return (
    <div
      className="rounded-lg border p-4 space-y-3"
      style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
    >
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-primary)" }}>
          Skills
        </h3>
        <p className="text-[11px] font-mono mt-0.5" style={{ color: "var(--text-muted)" }}>
          Turn off anything this client doesn&apos;t need. Takes effect on the next run — an in-progress run finishes as started.
        </p>
      </div>

      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
        {TOGGLEABLE_SKILLS.map((skillId) => {
          const skill = SKILL_MANIFEST[skillId];
          const enabled = states[skillId];
          const busy = pending === skillId;
          return (
            <div key={skillId} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <div className="text-xs font-bold font-mono" style={{ color: "var(--text-primary)" }}>
                  {skill.name}
                </div>
                <div className="text-[11px] font-mono mt-0.5 leading-snug" style={{ color: "var(--text-muted)" }}>
                  {skill.description}
                </div>
              </div>
              <button
                onClick={() => toggle(skillId)}
                disabled={busy}
                aria-pressed={enabled}
   className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2.5 py-1 rounded-sm border transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  enabled
                    ? "text-gold-hover dark:text-gold bg-gold/10 border-gold/25 hover:bg-gold/15"
                    : "text-zinc-500 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-900/60 hover:border-zinc-300 dark:hover:border-zinc-700"
                }`}
              >
                {enabled ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                {busy ? "Saving…" : enabled ? "On" : "Off"}
              </button>
            </div>
          );
        })}
      </div>

      {error && <p className="text-[11px] font-mono font-semibold text-rose-600 dark:text-rose-400">⚠ {error}</p>}
    </div>
  );
}
