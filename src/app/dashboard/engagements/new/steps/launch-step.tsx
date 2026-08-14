// steps/launch-step.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { SKILL_IDS, SKILL_MANIFEST, type SkillId } from "@/lib/skill-manifest";
import { SquishySkillBadge, SKILL_SQUISHY_CONFIG } from "@/components/squishy-skill-badge";

/**
 * Post-save screen. Launch itself (POST /api/engagements/[id]/launch) is
 * product-agnostic and side-effect-free beyond stamping launchedAt — it
 * fires no bridge and nothing else in the codebase reads launchedAt to
 * gate anything. There's no reason to make the user click a button for
 * it, so it fires automatically the moment this screen mounts, and the
 * only thing the user actually sees and acts on is bridge selection:
 *
 *  - every bridge in SKILL_MANIFEST, freely selectable, none pre-checked
 *    and none privileged (including Pin-Down). Finishing writes an
 *    explicit enabled/disabled row for every single bridge via
 *    POST /api/engagements/[id]/skills/[skillId] — deliberately never
 *    leaning on that endpoint's "no row = enabled" default, so what a
 *    client ends up running is always something this screen actually
 *    decided, not an implicit fallback.
 *
 * If the auto-launch call itself fails (network/server error, not a form
 * problem), the user gets a retry button rather than being dropped back
 * into the setup form.
 */
export function LaunchStep({
  engagementId,
  buyerName,
  onBack,
}: {
  engagementId: string;
  buyerName: string;
  /** Only offered if auto-launch fails — lets the user bail out to setup rather than being stuck retrying. */
  onBack?: () => void;
}) {
  const router = useRouter();
  const [launched, setLaunched] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Record<SkillId, boolean>>(
    Object.fromEntries(SKILL_IDS.map((id) => [id, false])) as Record<SkillId, boolean>
  );
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  async function launch() {
    setLaunching(true);
    setLaunchError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/launch`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setLaunchError(data.error ?? "Launch failed. You can try again — nothing else was affected.");
        setLaunching(false);
        return;
      }
      setLaunched(true);
      setLaunching(false);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setLaunchError(
        message === "Failed to fetch" ? "Couldn't reach the server. Check your connection and try again." : message
      );
      setLaunching(false);
    }
  }

  // Auto-fire launch on mount — see file header. Inlined (rather than
  // calling the launch() defined above, which the Retry button still
  // uses) with an AbortController so a fast unmount can't set state on
  // a gone component; runs once per mount, engagementId is stable for
  // the life of this screen.
  useEffect(() => {
    const controller = new AbortController();

    async function autoLaunch() {
      setLaunching(true);
      setLaunchError(null);
      try {
        const res = await fetch(`/api/engagements/${engagementId}/launch`, {
          method: "POST",
          signal: controller.signal,
        });
        const data = await res.json();
        if (controller.signal.aborted) return;
        if (!res.ok) {
          setLaunchError(data.error ?? "Launch failed. You can try again — nothing else was affected.");
          setLaunching(false);
          return;
        }
        setLaunched(true);
        setLaunching(false);
      } catch (e: unknown) {
        if (controller.signal.aborted) return;
        const message = e instanceof Error ? e.message : "Unknown error";
        setLaunchError(
          message === "Failed to fetch" ? "Couldn't reach the server. Check your connection and try again." : message
        );
        setLaunching(false);
      }
    }

    void autoLaunch();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function finish() {
    setFinishing(true);
    setFinishError(null);
    let firstRunId: string | null = null;
    let redirectToBridgeConfig: SkillId | null = null;

    try {
      for (const skillId of SKILL_IDS) {
        // runOnSetup bridges (today: pin-down) only bypass the generic route when SELECTED,
        // because enabling them requires their dedicated setup screen.
        // If UNSELECTED, we fall through to POST { enabled: false } so an explicit 
        // disabled row is written in engagement_skills (preventing the "no row = enabled" fallback).
        if (SKILL_MANIFEST[skillId].runOnSetup && selected[skillId]) {
          redirectToBridgeConfig = skillId;
          continue;
        }

        const res = await fetch(`/api/engagements/${engagementId}/skills/${skillId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: selected[skillId] }),
        });
        const data = await res.json();
        if (!res.ok) {
          setFinishError(`Couldn't set ${SKILL_MANIFEST[skillId].name}: ${data.error ?? "unknown error"}`);
          setFinishing(false);
          return;
        }
        if (data.runId && !firstRunId) firstRunId = data.runId;
      }

      if (redirectToBridgeConfig) {
        router.push(`/dashboard/engagements/${engagementId}/bridges/${redirectToBridgeConfig}`);
        return;
      }
      router.push(firstRunId ? `/dashboard/runs/${firstRunId}` : `/dashboard/engagements/${engagementId}`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setFinishError(
        message === "Failed to fetch" ? "Couldn't reach the server. Check your connection and try again." : message
      );
      setFinishing(false);
    }
  }

  const selectedCount = Object.values(selected).filter(Boolean).length;

  // Launch is auto-fired on mount (see effect above). This branch is now
  // only ever seen mid-flight (brief) or on a genuine launch failure —
  // never as a screen the user has to act on to proceed.
  if (!launched) {
    if (!launchError) {
      return (
        <div
          className="flex items-center gap-2.5 text-xs font-mono py-10 justify-center"
          style={{ color: "var(--text-muted)" }}
        >
          <span
            className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"
            aria-hidden="true"
          />
          Setting up {buyerName}&apos;s account…
        </div>
      );
    }

    return (
      <div className="space-y-6 w-full max-w-none px-1 transition-colors duration-200" style={{ color: "var(--text-secondary)" }}>
        <div className="pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <h1 className="text-lg font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            {buyerName} is saved
          </h1>
          <p className="text-xs font-normal mt-0.5" style={{ color: "var(--text-muted)" }}>
            Setup was saved, but activating the account failed.
          </p>
        </div>

        <p className="text-xs font-mono font-semibold" style={{ color: "var(--error)" }}>
          ⚠ Error: {launchError}
        </p>

        <div className="flex justify-between pt-4 font-mono" style={{ borderTop: "1px solid var(--border)" }}>
          {onBack ? (
            <button
              onClick={onBack}
              disabled={launching}
              className="px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed shadow-xs"
            >
              Back to review
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={launch}
            disabled={launching}
            className="px-5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-zinc-50 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs active:translate-y-px"
          >
            {launching ? "Retrying..." : "Retry"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full max-w-none px-1 transition-colors duration-200" style={{ color: "var(--text-secondary)" }}>
      <div className="pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <h1 className="text-lg font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
          {buyerName} is launched
        </h1>
        <p className="text-xs font-normal mt-0.5" style={{ color: "var(--text-muted)" }}>
          Pick which skills and agents to turn on. None are required, and none are pre-selected — enable whatever fits{" "}
          {buyerName}&apos;s stack today. Anything left off can be turned on later from the engagement page.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {SKILL_IDS.map((skillId) => {
          const skill = SKILL_MANIFEST[skillId];
          const config = SKILL_SQUISHY_CONFIG[skillId];
          const checked = selected[skillId];
          return (
            <label
              key={skillId}
              className="group relative flex items-start gap-3 rounded-xl p-3.5 border cursor-pointer transition-all duration-150"
              style={{
                borderColor: checked ? config.bgClass.match(/#[0-9a-f]{6}/i)?.[0] ?? "var(--text-primary)" : "var(--border)",
                background: checked ? "var(--surface-2)" : "var(--surface)",
                boxShadow: checked ? `0 0 0 1px ${config.bgClass.match(/#[0-9a-f]{6}/i)?.[0] ?? "var(--text-primary)"}` : "none",
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setSelected((s) => ({ ...s, [skillId]: e.target.checked }))}
                className="sr-only"
              />

              <SquishySkillBadge skill={skillId} size={38} enabled={checked} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold font-mono truncate" style={{ color: "var(--text-primary)" }}>
                    {skill.name}
                  </span>
                  <span
                    className="shrink-0 flex items-center justify-center w-4 h-4 rounded-full border transition-all duration-150"
                    style={{
                      borderColor: checked ? config.bgClass.match(/#[0-9a-f]{6}/i)?.[0] ?? "var(--text-primary)" : "var(--border)",
                      background: checked ? config.bgClass.match(/#[0-9a-f]{6}/i)?.[0] ?? "var(--text-primary)" : "transparent",
                    }}
                  >
                    {checked && <Check size={10} strokeWidth={3.5} className="text-zinc-950" />}
                  </span>
                </div>
                <div className="text-[11px] leading-snug mt-1" style={{ color: "var(--text-muted)" }}>
                  {skill.description}
                </div>
                {skill.runOnSetup && (
                  <div className="mt-1.5 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full" style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}>
                    Opens its own setup screen next
                  </div>
                )}
              </div>
            </label>
          );
        })}
      </div>

      {finishError && (
        <p className="text-xs font-mono font-semibold" style={{ color: "var(--error)" }}>
          ⚠ Error: {finishError}
        </p>
      )}

      <div className="flex justify-between items-center pt-4 font-mono" style={{ borderTop: "1px solid var(--border)" }}>
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {selectedCount === 0 ? "Nothing selected yet — that's fine." : `${selectedCount} of ${SKILL_IDS.length} selected`}
        </span>
        <button
          onClick={finish}
          disabled={finishing}
          className="px-5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-zinc-50 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs active:translate-y-px"
        >
          {finishing ? "Saving..." : "Finish Setup"}
        </button>
      </div>
    </div>
  );
}