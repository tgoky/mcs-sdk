"use client";

// src/app/dashboard/autopilot/autopilot-table.tsx
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PauseCircle, PlayCircle, Loader2 } from "lucide-react";
import { SKILL_IDS, SKILL_MANIFEST, type SkillId } from "@/lib/skill-manifest";
import { SKILL_INFO, ACTION_TYPE_LABELS } from "@/lib/copy";
import type { PendingActionType } from "@/lib/approval-gate";
import type { AutopilotClientDTO } from "@/lib/autopilot-clients";

export type AutopilotClientRow = AutopilotClientDTO;

const ACTION_TYPES = Object.keys(ACTION_TYPE_LABELS) as PendingActionType[];

/** Glass-styled toggle switch */
function ToggleSwitch({ on, busy, onClick, label }: { on: boolean; busy: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => !busy && onClick()}
      disabled={busy}
      aria-label={label}
      aria-pressed={on}
      className={`relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer items-center rounded-full transition-all duration-300 focus:outline-none ${
        on
          ? "bg-amber-400/90 shadow-[0_0_8px_rgba(251,191,36,0.3)] border border-amber-300/50"
          : "bg-zinc-700/40 dark:bg-zinc-800/60 border border-white/10 dark:border-zinc-700/50"
      } ${busy ? "opacity-50" : ""}`}
    >
      <span
        className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-xs transition-transform duration-200 ease-out ${
          on ? "translate-x-[15px]" : "translate-x-[2px]"
        }`}
      />
    </button>
  );
}

export function AutopilotTable({ clients: initialClients }: { clients: AutopilotClientRow[] }) {
  const router = useRouter();
  const [clients, setClients] = useState(initialClients);
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
    <div className="space-y-2">
      {clients.map((row) => {
        const isPaused = row.pausedAt !== null;
        const pauseBusy = busyKeys.has(`${row.engagementId}:pause`);
        const approvalBusy = busyKeys.has(`${row.engagementId}:approval-mode`);

        return (
          <div
            key={row.engagementId}
            className="rounded-xl p-3 space-y-2.5 backdrop-blur-xl bg-white/40 dark:bg-zinc-900/30 border border-white/30 dark:border-white/10 shadow-sm"
          >
            {/* Header: Engagement Buyer & Status */}
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold truncate text-zinc-900 dark:text-zinc-100">
                  {row.buyer}
                </p>
                {isPaused && (
                  <p className="text-[10px] font-mono text-amber-600 dark:text-amber-400">
                    Paused{row.pausedReason ? ` · ${row.pausedReason}` : ""}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => togglePause(row)}
                disabled={pauseBusy}
                className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold rounded-full transition-all cursor-pointer disabled:opacity-60 shrink-0 backdrop-blur-md ${
                  isPaused
                    ? "text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500/25"
                    : "text-zinc-600 dark:text-zinc-400 bg-zinc-200/50 dark:bg-zinc-800/40 border border-white/20 dark:border-white/10 hover:bg-zinc-200 dark:hover:bg-zinc-800/60"
                }`}
              >
                {pauseBusy ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : isPaused ? (
                  <PlayCircle size={11} />
                ) : (
                  <PauseCircle size={11} />
                )}
                {isPaused ? "Resume" : "Pause"}
              </button>
            </div>

            {/* Approval Gate Control */}
            <div className="rounded-lg p-2 space-y-2 backdrop-blur-md bg-white/30 dark:bg-zinc-950/40 border border-white/20 dark:border-white/5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-zinc-900 dark:text-zinc-200">
                    {row.requireApprovalForSideEffects ? "Co-Pilot" : "Autopilot"}
                  </p>
                  <p className="text-[10px] leading-tight text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {row.requireApprovalForSideEffects
                      ? "Side-effectful actions require approval in Queue."
                      : "Side-effectful actions execute automatically."}
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
                <div className="pt-2 border-t border-zinc-200/40 dark:border-white/5 space-y-1.5">
                  <p className="text-[9.5px] font-mono font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                    Gated action types:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {ACTION_TYPES.map((actionType) => {
                      const selected = row.requireApprovalActionTypes.includes(actionType);
                      const scopeBusy = busyKeys.has(`${row.engagementId}:scope:${actionType}`);
                      const label = ACTION_TYPE_LABELS[actionType] || actionType.replace(/_/g, " ");

                      return (
                        <button
                          key={actionType}
                          type="button"
                          onClick={() => toggleActionTypeScope(row, actionType)}
                          disabled={scopeBusy}
                          title={label}
                          className={`px-2 py-0.5 text-[10px] font-mono font-medium rounded-md transition-all cursor-pointer disabled:opacity-60 backdrop-blur-sm ${
                            selected
                              ? "bg-amber-400/20 text-amber-800 dark:text-amber-300 border border-amber-400/40 shadow-xs"
                              : "bg-zinc-100/50 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 border border-zinc-200/50 dark:border-white/5 hover:bg-zinc-200/50 dark:hover:bg-white/10"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {row.requireApprovalActionTypes.length === 0 && (
                    <p className="text-[10px] font-mono text-zinc-500 dark:text-zinc-500 pt-0.5">
                      No scope picked; all side-effects gated.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Active Skill Toggles */}
            <div className="flex flex-wrap gap-1 pt-0.5">
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
                    className={`flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-semibold rounded-full transition-all cursor-pointer disabled:opacity-60 backdrop-blur-sm ${
                      enabled
                        ? "bg-amber-400/15 text-amber-800 dark:text-amber-300 border border-amber-400/30"
                        : "bg-zinc-100/50 dark:bg-zinc-900/30 text-zinc-500 border border-zinc-200/40 dark:border-white/5 hover:bg-zinc-200/50 dark:hover:bg-white/10"
                    }`}
                  >
                    <span>{SKILL_INFO[skill].name}</span>
                    <span
                      className={`w-1.5 h-1.5 rounded-full transition-colors ${
                        enabled ? "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]" : "bg-zinc-400 dark:bg-zinc-600"
                      }`}
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