"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Rocket, Layers, ClipboardList, RotateCcw, Map as MapIcon, type LucideIcon } from "lucide-react";
import { SKILL_IDS, SKILL_MANIFEST, type SkillId } from "@/lib/skill-manifest";

// pin-down is a one-time setup-time skill, not an ongoing automation a
// client turns on or off after the fact — see the route's doc comment at
// src/app/api/engagements/[id]/skills/[skillId]/route.ts. Excluded here
// rather than just left disabled, since a toggle with no real effect on
// an already-onboarded engagement is worse than no toggle at all.
const TOGGLEABLE_SKILLS: SkillId[] = SKILL_IDS.filter((id) => id !== "pin-down");

// One icon per skill, chosen for what the skill's own description
// (skill-manifest.ts) actually says it does — not decoration. Pin-Down
// launches onboarding, Pile-On stacks prospects into sequences,
// Pre-Call Read produces a briefing document, Win-Back is a
// re-engagement loop, Leak-Map audits the funnel.
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
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${
        enabled ? "bg-gold" : "bg-zinc-300 dark:bg-zinc-700"
      } ${busy ? "opacity-60" : ""}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
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

  const onCount = TOGGLEABLE_SKILLS.filter((id) => states[id]).length;

  return (
    <div
      className="rounded-lg border p-4 space-y-4"
      style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-primary)" }}>
            Skills
          </h3>
          <p className="text-[11px] font-mono mt-0.5" style={{ color: "var(--text-muted)" }}>
            Turn off anything this client doesn&apos;t need. Takes effect on the next run.
          </p>
        </div>
        {/* Reading the toggle column top-to-bottom already tells the whole
            story — this count is just the same information compressed
            into one glance, not a second control. */}
        <span
          className="shrink-0 text-[11px] font-mono font-bold px-2 py-0.5 rounded-full"
          style={{ background: "var(--accent-dim)", color: "var(--gold-hover)" }}
        >
          {onCount}/{TOGGLEABLE_SKILLS.length} on
        </span>
      </div>

      <div className="space-y-1">
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
              className="w-full flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-md transition-colors cursor-pointer disabled:cursor-not-allowed text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
            >
              <span
                className={`shrink-0 grid place-items-center h-8 w-8 rounded-md border transition-colors ${
                  enabled
                    ? "bg-gold/10 border-gold/25 text-gold-hover dark:text-gold"
                    : "border-transparent text-zinc-400 dark:text-zinc-600"
                }`}
                style={!enabled ? { background: "var(--surface)" } : undefined}
              >
                <Icon className="h-4 w-4" strokeWidth={2} />
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className="block text-[13px] font-semibold"
                  style={{ color: enabled ? "var(--text-primary)" : "var(--text-secondary)" }}
                >
                  {skill.name}
                </span>
                <span className="block text-[11px] font-mono mt-0.5 leading-snug" style={{ color: "var(--text-muted)" }}>
                  {skill.description}
                </span>
              </span>

              <span className="shrink-0 flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wide w-6 text-right" style={{ color: "var(--text-muted)" }}>
                  {busy ? "…" : enabled ? "On" : "Off"}
                </span>
                <Switch enabled={enabled} busy={busy} />
              </span>
            </button>
          );
        })}
      </div>

      {error && <p className="text-[11px] font-mono font-semibold text-rose-600 dark:text-rose-400">⚠ {error}</p>}
    </div>
  );
}
