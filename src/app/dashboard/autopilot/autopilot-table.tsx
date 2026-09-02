"use client";

// src/app/dashboard/autopilot/autopilot-table.tsx
//
// The account-wide access-control table backing /dashboard/autopilot.
// Three independent controls per client, each already backed by a real
// endpoint (this file just aggregates them instead of requiring a click
// into every engagement):
//   1. Pause / resume the whole client  — POST/DELETE /api/engagements/[id]/pause
//   2. Co-Pilot vs. Autopilot, with a scoped list of which side-effectful
//      action types require approval — PATCH /api/engagements/[id]
//      (stack.require_approval_for_side_effects / require_approval_action_types
//      — previously write-only at onboarding, this is the first edit path)
//   3. Per-skill enable/disable — POST /api/engagements/[id]/skills/[skillId]
//
// Every mutation here is optimistic with rollback-on-failure, mirroring the
// existing convention in skills-panel.tsx (the per-engagement equivalent of
// control #3) rather than inventing a new pattern.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PauseCircle, PlayCircle, Loader2 } from "lucide-react";
import { SKILL_IDS, SKILL_MANIFEST, type SkillId } from "@/lib/skill-manifest";
import { SKILL_INFO, ACTION_TYPE_LABELS } from "@/lib/copy";
import type { PendingActionType } from "@/lib/approval-gate";
import type { AutopilotClientDTO } from "@/lib/autopilot-clients";

export type AutopilotClientRow = AutopilotClientDTO;

const ACTION_TYPES = Object.keys(ACTION_TYPE_LABELS) as PendingActionType[];

/** The same h-5 w-9 amber pill switch skills-panel.tsx uses for its skill
 * toggles — reused here for all three controls so the whole page reads as
 * one visual language instead of three bespoke ones. */
function ToggleSwitch({ on, busy, onClick, label }: { on: boolean; busy: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => !busy && onClick()}
      disabled={busy}
      aria-label={label}
      aria-pressed={on}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-all duration-200 ease-in-out focus:outline-none shadow-inner ${
        on
          ? "bg-amber-400 border border-amber-500/30"
          : "bg-zinc-300 dark:bg-zinc-800 border border-zinc-400/30 dark:border-zinc-700/50"
      } ${busy ? "opacity-50" : ""}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-md transition-transform duration-200 ease-in-out ${
          on ? "translate-x-[18px]" : "translate-x-[2px]"
        }`}
      />
    </button>
  );
}

export function AutopilotTable({ clients: initialClients }: { clients: AutopilotClientRow[] }) {
  const router = useRouter();
  const [clients, setClients] = useState(initialClients);
  // Tracks in-flight mutations as "<engagementId>:<field>" so only the
  // control actually being changed shows busy, not the whole row.
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());

  function setBusy(key: string, busy: boolean) {
    setBusyKeys((prev) => {
      const next = new Set(prev);
      if (busy) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function patchClient(engagementId: string, patch: Partial<AutopilotClientRow>) {
    setClients((prev) => prev.map((c) => (c.engagementId === engagementId ? { ...c, ...patch } : c)));
  }

  async function togglePause(row: AutopilotClientRow) {
    const key = `${row.engagementId}:pause`;
    const wasPaused = row.pausedAt !== null;
    const optimisticAt = wasPaused ? null : new Date().toISOString();
    patchClient(row.engagementId, { pausedAt: optimisticAt, pausedReason: wasPaused ? null : row.pausedReason });
    setBusy(key, true);
    try {
      const res = await fetch(`/api/engagements/${row.engagementId}/pause`, { method: wasPaused ? "DELETE" : "POST" });
      if (!res.ok) throw new Error("request failed");
      router.refresh();
    } catch {
      patchClient(row.engagementId, { pausedAt: row.pausedAt, pausedReason: row.pausedReason });
    } finally {
      setBusy(key, false);
    }
  }

  async function patchStack(engagementId: string, stackPatch: Record<string, unknown>) {
    const res = await fetch(`/api/engagements/${engagementId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stack: stackPatch }),
    });
    if (!res.ok) throw new Error("request failed");
  }

  async function toggleApprovalMode(row: AutopilotClientRow) {
    const key = `${row.engagementId}:approval-mode`;
    const nextValue = !row.requireApprovalForSideEffects;
    const previous = { requireApprovalForSideEffects: row.requireApprovalForSideEffects, requireApprovalActionTypes: row.requireApprovalActionTypes };
    // Switching Autopilot -> Co-Pilot defaults to gating every action type
    // (empty scope list) until the operator narrows it — same "no scope =
    // gate everything" contract approval-gate.ts's isApprovalRequired
    // already implements, just surfaced here instead of only at onboarding.
    patchClient(row.engagementId, {
      requireApprovalForSideEffects: nextValue,
      requireApprovalActionTypes: nextValue ? row.requireApprovalActionTypes : [],
    });
    setBusy(key, true);
    try {
      await patchStack(row.engagementId, {
        require_approval_for_side_effects: nextValue,
        ...(nextValue ? {} : { require_approval_action_types: [] }),
      });
      router.refresh();
    } catch {
      patchClient(row.engagementId, previous);
    } finally {
      setBusy(key, false);
    }
  }

  async function toggleActionTypeScope(row: AutopilotClientRow, actionType: PendingActionType) {
    const key = `${row.engagementId}:scope:${actionType}`;
    const has = row.requireApprovalActionTypes.includes(actionType);
    const nextList = has
      ? row.requireApprovalActionTypes.filter((t) => t !== actionType)
      : [...row.requireApprovalActionTypes, actionType];
    const previous = row.requireApprovalActionTypes;
    patchClient(row.engagementId, { requireApprovalActionTypes: nextList });
    setBusy(key, true);
    try {
      await patchStack(row.engagementId, { require_approval_action_types: nextList });
      router.refresh();
    } catch {
      patchClient(row.engagementId, { requireApprovalActionTypes: previous });
    } finally {
      setBusy(key, false);
    }
  }

  async function toggleSkill(row: AutopilotClientRow, skill: SkillId) {
    const nextEnabled = !row.skills[skill];
    // Pin-down can only be turned ON through its own bridge/setup flow
    // (POST .../skills/pin-down returns 422 otherwise) — same restriction
    // skills-panel.tsx's handleToggleClick enforces per-engagement; here it
    // sends the operator straight to that client's bridge page instead of
    // silently failing.
    if (nextEnabled && SKILL_MANIFEST[skill].runOnSetup) {
      router.push(`/dashboard/engagements/${row.engagementId}/bridges/${skill}`);
      return;
    }

    const key = `${row.engagementId}:skill:${skill}`;
    const previous = row.skills[skill];
    patchClient(row.engagementId, { skills: { ...row.skills, [skill]: nextEnabled } });
    setBusy(key, true);
    try {
      const res = await fetch(`/api/engagements/${row.engagementId}/skills/${skill}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      if (!res.ok) throw new Error("request failed");
      router.refresh();
    } catch {
      patchClient(row.engagementId, { skills: { ...row.skills, [skill]: previous } });
    } finally {
      setBusy(key, false);
    }
  }

  return (
    <div className="space-y-3">
      {clients.map((row) => {
        const isPaused = row.pausedAt !== null;
        const pauseBusy = busyKeys.has(`${row.engagementId}:pause`);
        const approvalBusy = busyKeys.has(`${row.engagementId}:approval-mode`);

        return (
          <div
            key={row.engagementId}
            className="rounded-xl p-3.5 space-y-3"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            {/* Row 1: client name + pause/resume */}
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>
                  {row.buyer}
                </p>
                {isPaused && (
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                    Paused{row.pausedReason ? ` — ${row.pausedReason}` : ""}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => togglePause(row)}
                disabled={pauseBusy}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-60 shrink-0 ${
                  isPaused
                    ? "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-950/70"
                    : "text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                }`}
              >
                {pauseBusy ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : isPaused ? (
                  <PlayCircle size={12} />
                ) : (
                  <PauseCircle size={12} />
                )}
                {isPaused ? "Resume" : "Pause"}
              </button>
            </div>

            {/* Row 2: Co-Pilot / Autopilot + scoped action types */}
            <div className="rounded-lg p-2.5 space-y-2" style={{ background: "var(--surface-2)" }}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>
                    {row.requireApprovalForSideEffects ? "Co-Pilot" : "Autopilot"}
                  </p>
                  <p className="text-[10px] leading-snug mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {row.requireApprovalForSideEffects
                      ? "Side-effectful actions wait for your approval in the Queue first."
                      : "Side-effectful actions run automatically, with no approval step."}
                  </p>
                </div>
                <ToggleSwitch
                  on={row.requireApprovalForSideEffects}
                  busy={approvalBusy}
                  onClick={() => toggleApprovalMode(row)}
                  label={`Toggle Co-Pilot for ${row.buyer}`}
                />
              </div>

              {row.requireApprovalForSideEffects && (
                <div className="flex flex-wrap gap-1.5 pt-1.5 border-t" style={{ borderColor: "var(--border)" }}>
                  {ACTION_TYPES.map((actionType) => {
                    const selected = row.requireApprovalActionTypes.includes(actionType);
                    const scopeBusy = busyKeys.has(`${row.engagementId}:scope:${actionType}`);
                    return (
                      <button
                        key={actionType}
                        type="button"
                        onClick={() => toggleActionTypeScope(row, actionType)}
                        disabled={scopeBusy}
                        title={ACTION_TYPE_LABELS[actionType]}
                        className={`px-2 py-1 text-[10px] font-mono font-bold rounded-md transition-colors cursor-pointer disabled:opacity-60 ${
                          selected
                            ? "bg-amber-400/20 text-amber-700 dark:text-amber-300 border border-amber-500/40"
                            : "bg-transparent text-zinc-400 dark:text-zinc-600 border border-zinc-300/50 dark:border-zinc-700/50"
                        }`}
                      >
                        {actionType.replace(/_/g, " ")}
                      </button>
                    );
                  })}
                  <span className="text-[10px] self-center" style={{ color: "var(--text-muted)" }}>
                    {row.requireApprovalActionTypes.length === 0 ? "— none picked, so all are gated" : ""}
                  </span>
                </div>
              )}
            </div>

            {/* Row 3: per-skill toggles */}
            <div className="flex flex-wrap gap-1.5">
              {SKILL_IDS.map((skill) => {
                const enabled = row.skills[skill];
                const skillBusy = busyKeys.has(`${row.engagementId}:skill:${skill}`);
                return (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => !skillBusy && toggleSkill(row, skill)}
                    disabled={skillBusy}
                    title={SKILL_INFO[skill].description}
                    className={`flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 text-[10px] font-bold rounded-full transition-colors cursor-pointer disabled:opacity-60 ${
                      enabled
                        ? "bg-amber-400/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                        : "bg-zinc-100 dark:bg-zinc-900 text-zinc-400 dark:text-zinc-600 border border-zinc-300/40 dark:border-zinc-700/40"
                    }`}
                  >
                    {SKILL_INFO[skill].name}
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full ${enabled ? "bg-amber-500" : "bg-zinc-400 dark:bg-zinc-600"}`}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
